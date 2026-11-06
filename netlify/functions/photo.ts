import { getStore } from '@netlify/blobs'
import { createHash } from 'node:crypto'

/**
 * Foto degli esercizi: salvate come blob separati (non nel payload di sync,
 * che resterebbe enorme). Il client tiene una copia locale in SQLite per
 * l'uso offline; qui c'è la copia cloud per il recupero su altri dispositivi.
 *
 * Due spazi separati:
 * - gli esercizi pre-caricati (id `def-*`) usano una libreria condivisa fra
 *   tutti gli account, gestita solo dall'amministratore: la foto della macchina
 *   viene caricata una volta e la vedono tutti;
 * - gli esercizi creati da un utente (id casuale) hanno foto private nel suo
 *   spazio: le può aggiungere, sostituire e rimuovere lui stesso.
 */

const ACCOUNTS_STORE = 'palestralogger-accounts'
const PHOTOS_STORE = 'palestralogger-photos'
const PHOTO_PREFIX = 'p/'
/** Proprietario logico della libreria condivisa (non è un id account). */
const LIBRARY_ID = 'library'
/** Gli esercizi pre-caricati hanno id `def-*`; quelli creati hanno id casuale. */
const DEFAULT_EXERCISE_PREFIX = 'def-'
const DELETED_PREFIX = 'x/'
const INDEX_PREFIX = 'idx/'
const MAX_BYTES = 1_500_000
const MAX_INDEX_ENTRIES = 500
const TOMBSTONE_TTL_DAYS = 365
const EXERCISE_RE = /^[A-Za-z0-9_-]{1,80}$/
const MIME_RE = /^image\/(jpeg|png|webp)$/

interface AccountRecord {
  id: string
  uid: string
  name: string
  email?: string
  passwordChangedAt: string
}

/** Stesse email amministratrici della funzione account (ruolo derivato). */
const ADMIN_EMAILS = new Set(['francescochecco@gmail.com'])

function isAdmin(account: AccountRecord): boolean {
  return ADMIN_EMAILS.has(String(account.email ?? '').trim().toLowerCase())
}

function isDefaultExercise(exerciseId: string): boolean {
  return exerciseId.startsWith(DEFAULT_EXERCISE_PREFIX)
}

/** Spazio in cui vivono le foto di un esercizio: libreria o account privato. */
function ownerFor(account: AccountRecord, exerciseId: string): string {
  return isDefaultExercise(exerciseId) ? LIBRARY_ID : account.id
}

interface PhotoMeta {
  updatedAt: string
  size: number
  mime: string
}

interface PhotoIndex {
  photos: Record<string, PhotoMeta>
  deleted: Record<string, string>
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
    console.error('[photo] contesto blobs non leggibile', err)
  }
  return base
}

function stores(event: Event) {
  const options = storeOptions(event)
  return {
    accounts: getStore({ name: ACCOUNTS_STORE, ...options }),
    photos: getStore({ name: PHOTOS_STORE, ...options }),
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

function normalizeExerciseId(raw: unknown): string {
  const id = String(raw ?? '')
  if (!EXERCISE_RE.test(id)) throw new HttpError(400, 'invalid_exercise')
  return id
}

function normalizeUpdatedAt(raw: unknown): string {
  const value = String(raw ?? '')
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return new Date().toISOString()
  return new Date(time).toISOString()
}

function sniffMime(bytes: Buffer): string | null {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  )
    return 'image/png'
  if (
    bytes.length > 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  )
    return 'image/webp'
  return null
}

async function readIndex(store: Stores, accountId: string): Promise<PhotoIndex> {
  const doc = (await store.photos.get(INDEX_PREFIX + accountId, { type: 'json' })) as
    | Partial<PhotoIndex>
    | null
  return {
    photos: doc?.photos && typeof doc.photos === 'object' ? doc.photos : {},
    deleted: doc?.deleted && typeof doc.deleted === 'object' ? doc.deleted : {},
  }
}

async function writeIndex(store: Stores, accountId: string, index: PhotoIndex): Promise<void> {
  const cutoff = Date.now() - TOMBSTONE_TTL_DAYS * 86_400_000
  for (const [exerciseId, deletedAt] of Object.entries(index.deleted)) {
    if (Date.parse(deletedAt) < cutoff) delete index.deleted[exerciseId]
  }
  const entries = Object.entries(index.photos)
  if (entries.length > MAX_INDEX_ENTRIES) {
    entries
      .sort((a, b) => Date.parse(a[1].updatedAt) - Date.parse(b[1].updatedAt))
      .slice(0, entries.length - MAX_INDEX_ENTRIES)
      .forEach(([exerciseId]) => delete index.photos[exerciseId])
  }
  await store.photos.setJSON(INDEX_PREFIX + accountId, index)
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
    const account = await authenticate(store, body.token)

    if (action === 'list') {
      // libreria condivisa + foto private degli esercizi creati dall'utente
      const [library, own] = await Promise.all([
        readIndex(store, LIBRARY_ID),
        readIndex(store, account.id),
      ])
      const photos: PhotoIndex['photos'] = { ...library.photos }
      const deleted: PhotoIndex['deleted'] = { ...library.deleted }
      for (const [exerciseId, meta] of Object.entries(own.photos)) {
        if (!isDefaultExercise(exerciseId)) photos[exerciseId] = meta
      }
      for (const [exerciseId, at] of Object.entries(own.deleted)) {
        if (!isDefaultExercise(exerciseId)) deleted[exerciseId] = at
      }
      return respond(200, { photos, deleted })
    }

    if (action === 'get') {
      const exerciseId = normalizeExerciseId(body.exerciseId)
      const ownerId = ownerFor(account, exerciseId)
      const index = await readIndex(store, ownerId)
      const meta = index.photos[exerciseId]
      if (!meta) throw new HttpError(404, 'not_found')
      const bytes = await store.photos.get(PHOTO_PREFIX + ownerId + '/' + exerciseId, {
        type: 'arrayBuffer',
      })
      if (!bytes) throw new HttpError(404, 'not_found')
      return respond(200, {
        exerciseId,
        mime: meta.mime,
        updatedAt: meta.updatedAt,
        data: Buffer.from(bytes).toString('base64'),
      })
    }

    if (action === 'put') {
      const exerciseId = normalizeExerciseId(body.exerciseId)
      // gli esercizi della libreria li gestisce solo l'amministratore;
      // quelli creati da un utente li gestisce il proprietario
      if (isDefaultExercise(exerciseId) && !isAdmin(account)) {
        throw new HttpError(403, 'admin_only')
      }
      const ownerId = ownerFor(account, exerciseId)
      const mime = String(body.mime ?? '')
      if (!MIME_RE.test(mime)) throw new HttpError(400, 'invalid_mime')
      const raw = String(body.data ?? '')
      if (!raw || raw.length > MAX_BYTES * 2) throw new HttpError(413, 'photo_too_large')
      const bytes = Buffer.from(raw, 'base64')
      if (bytes.length === 0) throw new HttpError(400, 'invalid_data')
      if (bytes.length > MAX_BYTES) throw new HttpError(413, 'photo_too_large')
      const sniffed = sniffMime(bytes)
      if (sniffed && sniffed !== mime) throw new HttpError(400, 'invalid_mime')

      const updatedAt = normalizeUpdatedAt(body.updatedAt)
      const index = await readIndex(store, ownerId)
      // una foto cancellata su un altro dispositivo non deve "risorgere" da una copia vecchia
      const tombstone = index.deleted[exerciseId]
      if (tombstone && Date.parse(tombstone) > Date.parse(updatedAt)) {
        return respond(200, { ok: true, ignored: true, deletedAt: tombstone })
      }
      await store.photos.set(PHOTO_PREFIX + ownerId + '/' + exerciseId, bytes)
      delete index.deleted[exerciseId]
      index.photos[exerciseId] = { updatedAt, size: bytes.length, mime }
      await writeIndex(store, ownerId, index)
      return respond(200, { ok: true, exerciseId, updatedAt, size: bytes.length })
    }

    if (action === 'delete') {
      const exerciseId = normalizeExerciseId(body.exerciseId)
      if (isDefaultExercise(exerciseId) && !isAdmin(account)) {
        throw new HttpError(403, 'admin_only')
      }
      const ownerId = ownerFor(account, exerciseId)
      const index = await readIndex(store, ownerId)
      delete index.photos[exerciseId]
      index.deleted[exerciseId] = new Date().toISOString()
      await writeIndex(store, ownerId, index)
      try {
        await store.photos.delete(PHOTO_PREFIX + ownerId + '/' + exerciseId)
      } catch {
        /* la foto potrebbe non esistere */
      }
      return respond(200, { ok: true, deletedAt: index.deleted[exerciseId] })
    }

    return respond(400, { error: 'invalid_action' })
  } catch (err) {
    if (err instanceof HttpError) return respond(err.status, { error: err.error })
    console.error('[photo] errore', err)
    return respond(500, { error: 'server_error' })
  }
}
