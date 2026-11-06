import { getStore } from '@netlify/blobs'
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Account cloud + database online.
 *
 * - I dati (profilo, esercizi, allenamenti) vivono su Netlify Blobs, non solo
 *   sul telefono: cancellare i dati del browser non li perde più.
 * - Accesso con email + password (PBKDF2-SHA256, salt casuale).
 * - Codice di recupero monouso: permette di rientrare senza email.
 * - Ogni scrittura ha una revisione: due dispositivi non si sovrascrivono.
 */

const ACCOUNTS_STORE = 'palestralogger-accounts'
const DATA_STORE = 'palestralogger-sync'
const SOCIAL_STORE = 'palestralogger-social'

const EMAIL_PREFIX = 'email/'
const ACCOUNT_PREFIX = 'acct/'
const TOKEN_PREFIX = 'tok/'
const SESSION_INDEX_PREFIX = 'sess/'
const RECOVERY_PREFIX = 'recov/'
const RATE_PREFIX = 'rl/'
const DATA_PREFIX = 'a/'
const LEGACY_PREFIX = 'd/'

const ITERATIONS = 120_000
const MAX_PAYLOAD_BYTES = 8_000_000
const SESSION_MAX_TOKENS = 20
const LOGIN_WINDOW_MS = 15 * 60_000
const LOGIN_MAX_FAILS = 8
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const LEGACY_CODE_RE = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/
/**
 * Email con ruolo amministratore: possono gestire (aggiungere, sostituire,
 * rimuovere) le immagini degli esercizi di tutti gli account.
 * Il ruolo è derivato dall'email, così non serve migrare i record esistenti.
 */
const ADMIN_EMAILS = new Set(['francescochecco@gmail.com'])

export type Role = 'admin' | 'user'

export function roleForEmail(email: unknown): Role {
  return ADMIN_EMAILS.has(String(email ?? '').trim().toLowerCase()) ? 'admin' : 'user'
}

interface Account {
  id: string
  /** Identità usata dalla funzione amici (può derivare da un profilo legacy). */
  uid: string
  email: string
  name: string
  passHash: string
  passSalt: string
  iterations: number
  recoveryKeyHash: string | null
  createdAt: string
  passwordChangedAt: string
}

interface Session {
  accountId: string
  pwStamp: string
}

interface DataDoc {
  revision: number
  payload: unknown
  updatedAt: string
}

type Event = {
  httpMethod: string
  body: string | null
  blobs?: string
  headers?: Record<string, string | undefined>
}

class HttpError extends Error {
  status: number
  error: string
  constructor(status: number, error: string) {
    super(error)
    this.status = status
    this.error = error
  }
}

function respond(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
    body: JSON.stringify(body),
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeEmail(raw: unknown): string {
  const email = String(raw ?? '').trim().toLowerCase()
  if (email.length < 5 || email.length > 254 || !EMAIL_RE.test(email)) {
    throw new HttpError(400, 'invalid_email')
  }
  return email
}

function normalizePassword(raw: unknown): string {
  const password = String(raw ?? '')
  if (password.length < 8) throw new HttpError(400, 'weak_password')
  if (password.length > 200) throw new HttpError(400, 'invalid_password')
  return password
}

function normalizeName(raw: unknown, fallback = ''): string {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ')
  if (!name) return fallback
  if (name.length < 2 || name.length > 24) throw new HttpError(400, 'invalid_name')
  return name
}

function hashPassword(password: string, salt: Buffer, iterations = ITERATIONS): string {
  return pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex')
}

function verifyPassword(password: string, account: Account): boolean {
  const expected = Buffer.from(account.passHash, 'hex')
  const actual = Buffer.from(hashPassword(password, Buffer.from(account.passSalt, 'hex'), account.iterations), 'hex')
  if (expected.length !== actual.length) return false
  return timingSafeEqual(expected, actual)
}

function newRecoveryCode(): string {
  const bytes = randomBytes(16)
  let out = ''
  for (let i = 0; i < 16; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out.replace(/(.{4})(?=.)/g, '$1-')
}

function publicAccount(account: Account) {
  return {
    id: account.id,
    uid: account.uid,
    email: account.email,
    name: account.name,
    createdAt: account.createdAt,
    role: roleForEmail(account.email),
  }
}

function storeOptions(event: Event) {
  const base = { consistency: 'strong' as const }
  try {
    if (event.blobs) {
      const context = JSON.parse(Buffer.from(event.blobs, 'base64').toString('utf8')) as {
        token?: string
      }
      const siteID = event.headers?.['x-nf-site-id']
      if (context.token && siteID) return { ...base, siteID, token: context.token }
    }
  } catch (err) {
    console.error('[account] contesto blobs non leggibile', err)
  }
  return base
}

function stores(event: Event) {
  const options = storeOptions(event)
  return {
    accounts: getStore({ name: ACCOUNTS_STORE, ...options }),
    data: getStore({ name: DATA_STORE, ...options }),
    social: getStore({ name: SOCIAL_STORE, ...options }),
  }
}

type Stores = ReturnType<typeof stores>

async function accountByEmail(store: Stores, email: string): Promise<Account | null> {
  const id = await store.accounts.get(EMAIL_PREFIX + sha256(email))
  if (!id) return null
  return (await store.accounts.get(ACCOUNT_PREFIX + id, { type: 'json' })) as Account | null
}

async function accountById(store: Stores, id: string): Promise<Account | null> {
  return (await store.accounts.get(ACCOUNT_PREFIX + id, { type: 'json' })) as Account | null
}

async function saveAccount(store: Stores, account: Account): Promise<void> {
  await store.accounts.setJSON(ACCOUNT_PREFIX + account.id, account)
}

async function getData(store: Stores, accountId: string): Promise<DataDoc | null> {
  return (await store.data.get(DATA_PREFIX + accountId, { type: 'json' })) as DataDoc | null
}

async function issueSession(store: Stores, account: Account): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const hash = sha256(token)
  await store.accounts.setJSON(TOKEN_PREFIX + hash, {
    accountId: account.id,
    pwStamp: account.passwordChangedAt,
  } satisfies Session)
  // l'indice include il timestamp: si eliminano le sessioni più vecchie
  const stamp = String(Date.now()).padStart(14, '0')
  await store.accounts.set(SESSION_INDEX_PREFIX + account.id + '/' + stamp + '-' + hash, '')

  const keys = await sessionKeys(store, account.id)
  if (keys.length > SESSION_MAX_TOKENS) {
    for (const key of keys.slice(0, keys.length - SESSION_MAX_TOKENS)) {
      await store.accounts.delete(TOKEN_PREFIX + hashFromIndexKey(key))
      await store.accounts.delete(key)
    }
  }
  return token
}

function hashFromIndexKey(key: string): string {
  return key.slice(key.lastIndexOf('-') + 1)
}

async function sessionKeys(store: Stores, accountId: string): Promise<string[]> {
  const keys: string[] = []
  for await (const page of store.accounts.list({ prefix: SESSION_INDEX_PREFIX + accountId + '/', paginate: true })) {
    for (const blob of page.blobs) keys.push(blob.key)
  }
  return keys.sort()
}

async function revokeSessions(store: Stores, accountId: string): Promise<void> {
  const keys = await sessionKeys(store, accountId)
  for (const key of keys) {
    await store.accounts.delete(TOKEN_PREFIX + hashFromIndexKey(key))
    await store.accounts.delete(key)
  }
}

async function authenticate(store: Stores, tokenRaw: unknown): Promise<Account> {
  const token = String(tokenRaw ?? '').trim()
  if (token.length < 20 || token.length > 100) throw new HttpError(401, 'auth')
  const session = (await store.accounts.get(TOKEN_PREFIX + sha256(token), { type: 'json' })) as Session | null
  if (!session) throw new HttpError(401, 'auth')
  const account = await accountById(store, session.accountId)
  if (!account) throw new HttpError(401, 'auth')
  if (account.passwordChangedAt !== session.pwStamp) throw new HttpError(401, 'auth')
  return account
}

async function rateLimitCheck(store: Stores, email: string): Promise<void> {
  const key = RATE_PREFIX + sha256(email)
  const doc = (await store.accounts.get(key, { type: 'json' })) as { fails: number; until: number } | null
  if (doc && doc.until > Date.now() && doc.fails >= LOGIN_MAX_FAILS) {
    throw new HttpError(429, 'too_many_attempts')
  }
}

async function rateLimitFail(store: Stores, email: string): Promise<void> {
  const key = RATE_PREFIX + sha256(email)
  const doc = (await store.accounts.get(key, { type: 'json' })) as { fails: number; until: number } | null
  const now = Date.now()
  const active = doc && doc.until > now
  await store.accounts.setJSON(key, {
    fails: active ? doc.fails + 1 : 1,
    until: active ? doc.until : now + LOGIN_WINDOW_MS,
  })
}

async function rateLimitReset(store: Stores, email: string): Promise<void> {
  try {
    await store.accounts.delete(RATE_PREFIX + sha256(email))
  } catch {
    /* ignore */
  }
}

function validatePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpError(400, 'invalid_payload')
  }
  if (JSON.stringify(payload).length > MAX_PAYLOAD_BYTES) {
    throw new HttpError(413, 'payload_too_large')
  }
  return payload
}

async function createAccount(
  store: Stores,
  email: string,
  password: string,
  name: string,
): Promise<{ account: Account; recoveryCode: string }> {
  const salt = randomBytes(16)
  const recoveryCode = newRecoveryCode()
  const now = new Date().toISOString()
  const id = randomBytes(16).toString('hex')
  const account: Account = {
    id,
    uid: id,
    email,
    name,
    passHash: hashPassword(password, salt),
    passSalt: salt.toString('hex'),
    iterations: ITERATIONS,
    recoveryKeyHash: sha256(recoveryCode),
    createdAt: now,
    passwordChangedAt: now,
  }

  const claim = await store.accounts.set(EMAIL_PREFIX + sha256(email), id, { onlyIfNew: true })
  if (!claim.modified) throw new HttpError(409, 'email_in_use')

  await saveAccount(store, account)
  await store.accounts.set(RECOVERY_PREFIX + account.recoveryKeyHash, id)
  return { account, recoveryCode }
}

async function deleteAccountData(store: Stores, account: Account): Promise<void> {
  await store.data.delete(DATA_PREFIX + account.id)
  if (account.recoveryKeyHash) {
    await store.accounts.delete(RECOVERY_PREFIX + account.recoveryKeyHash)
  }
  await revokeSessions(store, account.id)
  await store.accounts.delete(EMAIL_PREFIX + sha256(account.email))
  await store.accounts.delete(ACCOUNT_PREFIX + account.id)

  // funzione amici: rimuove il documento e libera il codice amico
  const socialDoc = (await store.social.get('u/' + account.uid, { type: 'json' })) as
    | { friendCode?: string; friends?: string[] }
    | null
  if (socialDoc) {
    if (socialDoc.friendCode) await store.social.delete('code/' + socialDoc.friendCode)
    await store.social.delete('u/' + account.uid)
  }
}

export const handler = async (event: Event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, {})
  if (event.httpMethod !== 'POST') return respond(405, { error: 'method_not_allowed' })

  let body: Record<string, unknown>
  try {
    body = JSON.parse(event.body || '{}') as Record<string, unknown>
  } catch {
    return respond(400, { error: 'invalid_json' })
  }

  const action = String(body.action ?? '')
  const store = stores(event)

  try {
    if (action === 'register') {
      const email = normalizeEmail(body.email)
      const password = normalizePassword(body.password)
      const name = normalizeName(body.name, email.split('@')[0])
      const { account, recoveryCode } = await createAccount(store, email, password, name)
      const token = await issueSession(store, account)
      return respond(200, {
        token,
        account: publicAccount(account),
        recoveryCode,
        revision: 0,
      })
    }

    if (action === 'login') {
      const email = normalizeEmail(body.email)
      const password = String(body.password ?? '')
      await rateLimitCheck(store, email)
      const account = await accountByEmail(store, email)
      if (!account || !verifyPassword(password, account)) {
        // stesso tempo di risposta anche se l'email non esiste
        if (!account) hashPassword(password, Buffer.alloc(16))
        await rateLimitFail(store, email)
        throw new HttpError(401, 'invalid_credentials')
      }
      await rateLimitReset(store, email)
      const token = await issueSession(store, account)
      const data = await getData(store, account.id)
      return respond(200, {
        token,
        account: publicAccount(account),
        revision: data?.revision ?? 0,
      })
    }

    if (action === 'session') {
      const account = await authenticate(store, body.token)
      const data = await getData(store, account.id)
      return respond(200, { account: publicAccount(account), revision: data?.revision ?? 0 })
    }

    if (action === 'logout') {
      const token = String(body.token ?? '').trim()
      if (token.length >= 20) {
        const hash = sha256(token)
        const session = (await store.accounts.get(TOKEN_PREFIX + hash, { type: 'json' })) as Session | null
        await store.accounts.delete(TOKEN_PREFIX + hash)
        if (session) {
          const keys = await sessionKeys(store, session.accountId)
          for (const key of keys) {
            if (hashFromIndexKey(key) === hash) await store.accounts.delete(key)
          }
        }
      }
      return respond(200, { ok: true })
    }

    if (action === 'pull') {
      const account = await authenticate(store, body.token)
      const data = await getData(store, account.id)
      return respond(200, {
        revision: data?.revision ?? 0,
        payload: data?.payload ?? null,
        updatedAt: data?.updatedAt ?? null,
      })
    }

    if (action === 'push') {
      const account = await authenticate(store, body.token)
      const payload = validatePayload(body.payload)
      const data = await getData(store, account.id)
      const revision = data?.revision ?? 0
      const base = Number.isFinite(body.baseRevision) ? Number(body.baseRevision) : 0
      if (base !== revision) {
        return respond(409, {
          revision,
          payload: data?.payload ?? null,
          conflict: true,
        })
      }
      const next = revision + 1
      await store.data.setJSON(DATA_PREFIX + account.id, {
        revision: next,
        payload,
        updatedAt: new Date().toISOString(),
      } satisfies DataDoc)

      const payloadName = (payload as { profile?: { name?: unknown } }).profile?.name
      const name = typeof payloadName === 'string' ? payloadName.trim().slice(0, 24) : ''
      if (name.length >= 2 && name !== account.name) {
        account.name = name
        await saveAccount(store, account)
      }
      return respond(200, { revision: next, updatedAt: new Date().toISOString() })
    }

    if (action === 'rename') {
      const account = await authenticate(store, body.token)
      account.name = normalizeName(body.name, account.name)
      await saveAccount(store, account)
      return respond(200, { account: publicAccount(account) })
    }

    if (action === 'changePassword') {
      const account = await authenticate(store, body.token)
      const current = String(body.currentPassword ?? '')
      if (!verifyPassword(current, account)) throw new HttpError(401, 'invalid_credentials')
      const next = normalizePassword(body.newPassword)
      const salt = randomBytes(16)
      account.passSalt = salt.toString('hex')
      account.passHash = hashPassword(next, salt)
      account.iterations = ITERATIONS
      account.passwordChangedAt = new Date().toISOString()
      await saveAccount(store, account)
      await revokeSessions(store, account.id)
      const token = await issueSession(store, account)
      return respond(200, { token, account: publicAccount(account) })
    }

    if (action === 'rotateRecovery') {
      const account = await authenticate(store, body.token)
      if (!verifyPassword(String(body.password ?? ''), account)) {
        throw new HttpError(401, 'invalid_credentials')
      }
      const code = newRecoveryCode()
      const previous = account.recoveryKeyHash
      account.recoveryKeyHash = sha256(code)
      await saveAccount(store, account)
      if (previous) {
        try {
          await store.accounts.delete(RECOVERY_PREFIX + previous)
        } catch {
          /* ignore */
        }
      }
      await store.accounts.set(RECOVERY_PREFIX + account.recoveryKeyHash, account.id)
      return respond(200, { recoveryCode: code })
    }

    if (action === 'resetWithRecovery') {
      const email = normalizeEmail(body.email)
      const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{4})(?=.)/g, '$1-')
      await rateLimitCheck(store, email)
      const account = await accountByEmail(store, email)
      const targetId = account ? await store.accounts.get(RECOVERY_PREFIX + sha256(code)) : null
      if (!account || targetId !== account.id) {
        await rateLimitFail(store, email)
        throw new HttpError(401, 'invalid_recovery')
      }
      const next = normalizePassword(body.newPassword)
      const salt = randomBytes(16)
      const previous = account.recoveryKeyHash
      const recoveryCode = newRecoveryCode()
      account.passSalt = salt.toString('hex')
      account.passHash = hashPassword(next, salt)
      account.iterations = ITERATIONS
      account.passwordChangedAt = new Date().toISOString()
      account.recoveryKeyHash = sha256(recoveryCode)
      await saveAccount(store, account)
      if (previous) {
        try {
          await store.accounts.delete(RECOVERY_PREFIX + previous)
        } catch {
          /* ignore */
        }
      }
      await store.accounts.set(RECOVERY_PREFIX + account.recoveryKeyHash, account.id)
      await revokeSessions(store, account.id)
      await rateLimitReset(store, email)
      const token = await issueSession(store, account)
      return respond(200, { token, account: publicAccount(account), recoveryCode })
    }

    if (action === 'delete') {
      const account = await authenticate(store, body.token)
      if (!verifyPassword(String(body.password ?? ''), account)) {
        throw new HttpError(401, 'invalid_credentials')
      }
      await deleteAccountData(store, account)
      return respond(200, { ok: true })
    }

    if (action === 'claimSyncCode') {
      const account = await authenticate(store, body.token)
      const code = String(body.code ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9-]/g, '')
      if (!LEGACY_CODE_RE.test(code)) throw new HttpError(400, 'invalid_code')
      const legacy = (await store.data.get(LEGACY_PREFIX + sha256(code), { type: 'json' })) as DataDoc | null
      if (!legacy || !legacy.payload) throw new HttpError(404, 'no_data')

      // Il profilo importato porta con sé l'identità social (amici già attivi).
      const legacyProfileId = (legacy.payload as { profile?: { id?: unknown } }).profile?.id
      if (typeof legacyProfileId === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(legacyProfileId)) {
        const currentSocial = await store.social.get('u/' + account.uid, { type: 'json' })
        const legacySocial = await store.social.get('u/' + legacyProfileId, { type: 'json' })
        if (!currentSocial && legacySocial) {
          account.uid = legacyProfileId
          await saveAccount(store, account)
        }
      }

      return respond(200, {
        payload: legacy.payload,
        revision: legacy.revision ?? 0,
      })
    }

    return respond(400, { error: 'invalid_action' })
  } catch (err) {
    if (err instanceof HttpError) return respond(err.status, { error: err.error })
    console.error('[account] errore', err)
    return respond(500, { error: 'server_error' })
  }
}
