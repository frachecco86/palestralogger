import { getStore } from '@netlify/blobs'
import { createHash } from 'node:crypto'

/**
 * Libreria condivisa degli esercizi creati dagli utenti.
 *
 * Gli esercizi pre-caricati (`def-*`) vivono nel client. Qui invece finiscono
 * quelli che un utente sceglie di rendere disponibili a tutti: la funzione li
 * conserva in un unico blob e ogni dispositivo li unisce nella propria cache
 * SQLite, così compaiono nella libreria di ogni account.
 *
 * Regole:
 * - chiunque abbia un account può leggere la libreria;
 * - l'autore può aggiornare o ritirare il proprio esercizio;
 * - l'amministratore può ritirare qualsiasi esercizio;
 * - gli id `def-*` sono riservati agli esercizi pre-caricati.
 */

const ACCOUNTS_STORE = 'palestralogger-accounts'
const EXERCISES_STORE = 'palestralogger-exercises'
const LIBRARY_KEY = 'library'
const DEFAULT_EXERCISE_PREFIX = 'def-'
const MAX_EXERCISES = 500
const MAX_BODY_BYTES = 16_000
const EXERCISE_RE = /^[A-Za-z0-9_-]{1,80}$/
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
const TRACKINGS = new Set(['reps', 'time'])

const ADMIN_EMAILS = new Set(['francescochecco@gmail.com'])

interface AccountRecord {
  id: string
  uid: string
  name: string
  email?: string
  passwordChangedAt: string
}

interface SharedExercise {
  id: string
  name: string
  alias: string
  muscle: string
  equipment: string
  tracking: 'reps' | 'time'
  authorId: string
  authorName: string
  createdAt: string
  updatedAt: string
}

interface LibraryDoc {
  version: 1
  updatedAt: string
  exercises: SharedExercise[]
  /**
   * Esercizi pre-caricati (`def-*`) eliminati dall'amministratore: restano
   * nell'app ma spariscono dalla libreria di ogni account. La lista vive sul
   * server perché i pre-caricati non stanno nel database degli utenti.
   */
  hiddenDefaults: string[]
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
    console.error('[exercises] contesto blobs non leggibile', err)
  }
  return base
}

function stores(event: Event) {
  const options = storeOptions(event)
  return {
    accounts: getStore({ name: ACCOUNTS_STORE, ...options }),
    exercises: getStore({ name: EXERCISES_STORE, ...options }),
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

function isAdmin(account: AccountRecord): boolean {
  return ADMIN_EMAILS.has(String(account.email ?? '').trim().toLowerCase())
}

function isDefaultExercise(exerciseId: string): boolean {
  return exerciseId.startsWith(DEFAULT_EXERCISE_PREFIX)
}

async function readLibrary(store: Stores): Promise<LibraryDoc> {
  const doc = (await store.exercises.get(LIBRARY_KEY, { type: 'json' })) as
    | Partial<LibraryDoc>
    | null
  const exercises = Array.isArray(doc?.exercises)
    ? (doc.exercises as SharedExercise[]).filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          typeof e.name === 'string' &&
          typeof e.authorId === 'string',
      )
    : []
  const hiddenDefaults = Array.isArray(doc?.hiddenDefaults)
    ? [...new Set(
        doc.hiddenDefaults.filter(
          (id): id is string => typeof id === 'string' && isDefaultExercise(id),
        ),
      )]
    : []
  return {
    version: 1,
    updatedAt: typeof doc?.updatedAt === 'string' ? doc.updatedAt : '',
    exercises,
    hiddenDefaults,
  }
}

function libraryResponse(library: LibraryDoc) {
  return {
    ok: true,
    exercises: library.exercises,
    hiddenDefaults: library.hiddenDefaults,
    updatedAt: library.updatedAt,
  }
}

async function writeLibrary(store: Stores, doc: LibraryDoc): Promise<void> {
  await store.exercises.setJSON(LIBRARY_KEY, doc)
}

function isoDate(raw: unknown, fallback: string): string {
  const value = String(raw ?? '')
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return fallback
  return new Date(time).toISOString()
}

/** Valida il payload di pubblicazione e restituisce i campi modificabili. */
function normalizeExercise(raw: unknown): {
  id: string
  name: string
  alias: string
  muscle: string
  equipment: string
  tracking: 'reps' | 'time'
  createdAt: string
  updatedAt: string
} {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'invalid_exercise')
  const input = raw as Record<string, unknown>

  const id = String(input.id ?? '').trim()
  if (!EXERCISE_RE.test(id) || isDefaultExercise(id)) throw new HttpError(400, 'invalid_exercise')

  const name = String(input.name ?? '').trim()
  if (name.length < 2 || name.length > 48) throw new HttpError(400, 'invalid_name')

  // alias facoltativo: altri nomi per la ricerca, separati da virgola
  const alias = String(input.alias ?? '').trim().slice(0, 64)

  const muscle = String(input.muscle ?? '').trim()
  if (!MUSCLES.has(muscle)) throw new HttpError(400, 'invalid_muscle')

  const equipment = String(input.equipment ?? '').trim().slice(0, 32)
  const tracking = String(input.tracking ?? '') === 'time' ? 'time' : 'reps'
  if (!TRACKINGS.has(tracking)) throw new HttpError(400, 'invalid_tracking')

  const now = new Date().toISOString()
  return {
    id,
    name,
    alias,
    muscle,
    equipment,
    tracking,
    createdAt: isoDate(input.createdAt, now),
    updatedAt: isoDate(input.updatedAt, now),
  }
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
    const library = await readLibrary(store)

    if (action === 'list') {
      return respond(200, libraryResponse(library))
    }

    if (action === 'publish') {
      const input = normalizeExercise(body.exercise)
      const index = library.exercises.findIndex((e) => e.id === input.id)
      const existing = index >= 0 ? library.exercises[index] : null

      if (existing && existing.authorId !== account.id && !isAdmin(account)) {
        throw new HttpError(403, 'not_author')
      }
      if (!existing && library.exercises.length >= MAX_EXERCISES) {
        throw new HttpError(409, 'library_full')
      }
      if (
        !existing &&
        library.exercises.some((e) => e.name.toLowerCase() === input.name.toLowerCase())
      ) {
        // un omonimo esiste già: meglio non duplicare la libreria comune
        throw new HttpError(409, 'duplicate_name')
      }

      const record: SharedExercise = {
        id: input.id,
        name: input.name,
        alias: input.alias,
        muscle: input.muscle,
        equipment: input.equipment,
        tracking: input.tracking,
        authorId: existing?.authorId ?? account.id,
        authorName: existing?.authorName ?? account.name,
        createdAt: existing?.createdAt ?? input.createdAt,
        updatedAt: input.updatedAt,
      }
      if (existing) library.exercises[index] = record
      else library.exercises.push(record)
      library.updatedAt = new Date().toISOString()
      await writeLibrary(store, library)
      return respond(200, libraryResponse(library))
    }

    if (action === 'delete') {
      const id = String(body.exerciseId ?? '').trim()
      if (!EXERCISE_RE.test(id)) throw new HttpError(400, 'invalid_exercise')

      // gli esercizi pre-caricati vivono nel client: si nascondono a tutti
      // tramite questa lista, e solo l'amministratore può farlo
      if (isDefaultExercise(id)) {
        if (!isAdmin(account)) throw new HttpError(403, 'admin_only')
        if (!library.hiddenDefaults.includes(id)) library.hiddenDefaults.push(id)
        library.updatedAt = new Date().toISOString()
        await writeLibrary(store, library)
        return respond(200, libraryResponse(library))
      }

      const entry = library.exercises.find((e) => e.id === id)
      if (!entry) return respond(200, libraryResponse(library))
      if (entry.authorId !== account.id && !isAdmin(account)) {
        throw new HttpError(403, 'not_author')
      }
      library.exercises = library.exercises.filter((e) => e.id !== id)
      library.updatedAt = new Date().toISOString()
      await writeLibrary(store, library)
      return respond(200, libraryResponse(library))
    }

    return respond(400, { error: 'invalid_action' })
  } catch (err) {
    if (err instanceof HttpError) return respond(err.status, { error: err.error })
    console.error('[exercises] errore', err)
    return respond(500, { error: 'server_error' })
  }
}
