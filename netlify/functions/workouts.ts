import { getStore } from '@netlify/blobs'
import { createHash, randomBytes } from 'node:crypto'

/**
 * Condivisione di allenamenti fra utenti.
 *
 * Per ora tutti gli account si vedono: `users` restituisce l'elenco dei nomi
 * (senza email) e `share` consegna una copia portabile dell'allenamento nella
 * "posta in arrivo" del destinatario (`s/<uid>/<timestamp>-<id>`). Chi la
 * riceve può importarla e modificarla come un allenamento proprio.
 *
 * Del payload fanno parte solo i dati dell'allenamento (nome, note, esercizi
 * con gruppo/attrezzatura/misura e serie): nessun id personale, nessuna foto.
 */

const ACCOUNTS_STORE = 'palestralogger-accounts'
const SHARES_STORE = 'palestralogger-workout-shares'
const SHARE_PREFIX = 's/'
const MAX_BODY_BYTES = 400_000
const MAX_INBOX = 50
const MAX_USERS = 500
const UID_RE = /^[A-Za-z0-9_-]{6,80}$/
const SHARE_ID_RE = /^\d{13}-[A-Za-z0-9_-]{4,48}$/
const MUSCLES = new Set([
  'Petto',
  'Schiena',
  'Gambe',
  'Glutei',
  'Spalle',
  'Braccia',
  'Core',
  'Cardio',
  'Altro',
])

type Event = {
  httpMethod: string
  body: string | null
  blobs?: string
  headers?: Record<string, string | undefined>
}

interface AccountRecord {
  id: string
  uid: string
  name: string
  email?: string
  passwordChangedAt: string
}

interface PortableSet {
  reps: number
  weight: number
  rpe: number | null
}

interface PortableEntry {
  name: string
  muscle: string
  equipment: string
  tracking: 'reps' | 'time'
  notes: string
  sets: PortableSet[]
}

interface PortableWorkout {
  date: string
  name: string
  notes: string
  entries: PortableEntry[]
}

interface ShareRecord {
  id: string
  fromUid: string
  fromName: string
  toUid: string
  createdAt: string
  workout: PortableWorkout
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
    console.error('[workouts] contesto blobs non leggibile', err)
  }
  return base
}

function stores(event: Event) {
  const options = storeOptions(event)
  return {
    accounts: getStore({ name: ACCOUNTS_STORE, ...options }),
    shares: getStore({ name: SHARES_STORE, ...options }),
  }
}

type Stores = ReturnType<typeof stores>

async function authenticate(store: Stores, tokenRaw: unknown): Promise<AccountRecord> {
  const token = String(tokenRaw ?? '').trim()
  if (token.length < 20 || token.length > 100) throw new HttpError(401, 'auth')
  const session = (await store.accounts.get('tok/' + sha256(token), { type: 'json' })) as
    | { accountId?: string; pwStamp?: string }
    | null
  if (!session?.accountId) throw new HttpError(401, 'auth')
  const account = (await store.accounts.get('acct/' + session.accountId, { type: 'json' })) as
    | AccountRecord
    | null
  if (!account || account.passwordChangedAt !== session.pwStamp) throw new HttpError(401, 'auth')
  return account
}

const uidOf = (account: AccountRecord) => account.uid || account.id

/** Tutti gli account (utile finché "tutti gli utenti si vedono"). */
async function listAccounts(store: Stores): Promise<AccountRecord[]> {
  const { blobs } = await store.accounts.list({ prefix: 'acct/' })
  const records = await Promise.all(
    blobs.slice(0, MAX_USERS).map((blob) =>
      store.accounts.get(blob.key, { type: 'json' }).catch(() => null),
    ),
  )
  return records.filter(
    (account): account is AccountRecord =>
      !!account && typeof account.id === 'string' && typeof account.name === 'string',
  )
}

function clampNumber(value: unknown, min: number, max: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

function normalizeSet(raw: unknown): PortableSet | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>
  const rpeValue = input.rpe === null || input.rpe === undefined ? null : clampNumber(input.rpe, 0, 10)
  return {
    reps: Math.round(clampNumber(input.reps, 0, 10_000)),
    weight: Math.round(clampNumber(input.weight, 0, 9_999) * 100) / 100,
    rpe: rpeValue,
  }
}

function normalizeWorkout(raw: unknown): PortableWorkout {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'invalid_workout')
  const input = raw as Record<string, unknown>

  const name = String(input.name ?? '').trim().slice(0, 40)
  const notes = String(input.notes ?? '').trim().slice(0, 500)
  const date = String(input.date ?? '')
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    throw new HttpError(400, 'invalid_workout')
  }

  const entries: PortableEntry[] = []
  for (const rawEntry of input.entries.slice(0, 30)) {
    if (!rawEntry || typeof rawEntry !== 'object') continue
    const entry = rawEntry as Record<string, unknown>
    const entryName = String(entry.name ?? '').trim().slice(0, 48)
    const muscle = String(entry.muscle ?? '').trim()
    if (entryName.length < 2 || !MUSCLES.has(muscle)) continue
    const sets: PortableSet[] = []
    for (const rawSet of Array.isArray(entry.sets) ? entry.sets.slice(0, 30) : []) {
      const set = normalizeSet(rawSet)
      if (set && set.reps > 0) sets.push(set)
    }
    if (sets.length === 0) continue
    entries.push({
      name: entryName,
      muscle,
      equipment: String(entry.equipment ?? '').trim().slice(0, 32),
      tracking: entry.tracking === 'time' ? 'time' : 'reps',
      notes: String(entry.notes ?? '').trim().slice(0, 300),
      sets,
    })
  }
  if (entries.length === 0) throw new HttpError(400, 'invalid_workout')
  return { date, name, notes, entries }
}

async function readShare(store: Stores, uid: string, key: string): Promise<ShareRecord | null> {
  const record = (await store.shares.get(key, { type: 'json' })) as ShareRecord | null
  if (!record || record.toUid !== uid) return null
  return record
}

export const handler = async (event: Event) => {
  if (event.httpMethod === 'OPTIONS') return respond(204, {})
  if (event.httpMethod !== 'POST') return respond(405, { error: 'method_not_allowed' })

  let body: Record<string, unknown>
  try {
    if ((event.body ?? '').length > MAX_BODY_BYTES) throw new HttpError(413, 'payload_too_large')
    body = JSON.parse(event.body || '{}') as Record<string, unknown>
  } catch (err) {
    if (err instanceof HttpError) return respond(err.status, { error: err.error })
    return respond(400, { error: 'invalid_json' })
  }

  const action = String(body.action ?? '')
  const store = stores(event)

  try {
    const account = await authenticate(store, body.token)
    const me = uidOf(account)

    if (action === 'users') {
      const accounts = await listAccounts(store)
      const seen = new Set<string>()
      const users = accounts
        .map((entry) => ({ uid: uidOf(entry), name: entry.name.trim() || 'Atleta' }))
        .filter((entry) => {
          if (!UID_RE.test(entry.uid) || entry.uid === me || seen.has(entry.uid)) return false
          seen.add(entry.uid)
          return true
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'it'))
      return respond(200, { users })
    }

    if (action === 'share') {
      const toUid = String(body.toUid ?? '').trim()
      if (!UID_RE.test(toUid)) throw new HttpError(400, 'invalid_user')
      if (toUid === me) throw new HttpError(400, 'self_share')
      const accounts = await listAccounts(store)
      const recipient = accounts.find((entry) => uidOf(entry) === toUid)
      if (!recipient) throw new HttpError(404, 'unknown_user')

      const workout = normalizeWorkout(body.workout)
      const createdAt = new Date()
      const id = `${createdAt.getTime()}-${randomBytes(6).toString('hex')}`
      const record: ShareRecord = {
        id,
        fromUid: me,
        fromName: account.name.trim() || 'Atleta',
        toUid,
        createdAt: createdAt.toISOString(),
        workout,
      }
      await store.shares.setJSON(SHARE_PREFIX + toUid + '/' + id, record)

      // la posta in arrivo resta leggera: si tengono le condivisioni più recenti
      const { blobs } = await store.shares.list({ prefix: SHARE_PREFIX + toUid + '/' })
      if (blobs.length > MAX_INBOX) {
        const stale = blobs
          .map((blob) => blob.key)
          .sort()
          .slice(0, blobs.length - MAX_INBOX)
        await Promise.all(stale.map((key) => store.shares.delete(key).catch(() => undefined)))
      }
      return respond(200, { ok: true, id })
    }

    if (action === 'inbox') {
      const { blobs } = await store.shares.list({ prefix: SHARE_PREFIX + me + '/' })
      const keys = blobs
        .map((blob) => blob.key)
        .sort()
        .slice(-MAX_INBOX)
      const records = await Promise.all(keys.map((key) => readShare(store, me, key)))
      const shares = records.filter((record): record is ShareRecord => !!record)
      shares.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return respond(200, { shares })
    }

    if (action === 'delete') {
      const id = String(body.id ?? '').trim()
      if (!SHARE_ID_RE.test(id)) throw new HttpError(400, 'invalid_share')
      await store.shares.delete(SHARE_PREFIX + me + '/' + id).catch(() => undefined)
      return respond(200, { ok: true })
    }

    return respond(400, { error: 'invalid_action' })
  } catch (err) {
    if (err instanceof HttpError) return respond(err.status, { error: err.error })
    console.error('[workouts] errore', err)
    return respond(500, { error: 'server_error' })
  }
}
