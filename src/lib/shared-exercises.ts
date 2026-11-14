import { query, tx } from '../db/db'
import { getExercise, parseTracking } from '../db/queries'
import { getToken } from './account'
import { uploadLocalExercisePhoto } from './photo'
import {
  readMigratedLegacy,
  readSharedCache,
  readShareQueue,
  writeMigratedLegacy,
  writeSharedCache,
  writeShareQueue,
  type SharedExerciseRecord,
} from './shared-cache'
import type { ExerciseTracking, Muscle } from './types'

/**
 * Libreria comune degli esercizi creati dagli utenti.
 *
 * Il client pubblica un esercizio sul server (`/api/exercises`) e poi lo
 * trasforma in una riga «di tutti» (`user_id` NULL), esattamente come i
 * pre-caricati: da quel momento compare nella libreria di ogni account.
 * Se la rete non c'è, la condivisione resta in coda e riparte da sola.
 */

const API = '/api/exercises'
const CACHE_TTL = 5 * 60_000
/** Massimo di pubblicazioni per giro: le altre restano in coda. */
const MAX_PER_RUN = 15
/**
 * Data del rilascio 2.7.0 (prima push della libreria comune): gli esercizi
 * creati prima sono quelli da portare automaticamente nella libreria comune.
 */
const LEGACY_CUTOFF = '2026-11-14T16:30:21.000Z'
const MUSCLES = new Set<Muscle>([
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

export class SharedError extends Error {
  code: string
  status: number
  constructor(code: string, status: number) {
    super(messageFor(code))
    this.code = code
    this.status = status
  }
}

function messageFor(code: string): string {
  switch (code) {
    case 'auth':
      return 'Sessione scaduta, accedi di nuovo'
    case 'duplicate_name':
      return 'Nella libreria comune esiste già un esercizio con questo nome'
    case 'library_full':
      return 'La libreria comune è piena: non è possibile aggiungere altri esercizi'
    case 'not_author':
      return 'Solo chi ha condiviso l’esercizio può modificarlo o ritirarlo'
    case 'invalid_exercise':
    case 'invalid_name':
    case 'invalid_muscle':
      return 'Esercizio non valido'
    case 'payload_too_large':
      return 'Dati troppo grandi'
    case 'offline':
      return 'Server non raggiungibile: la condivisione riparte appena torni online'
    default:
      return 'Condivisione non riuscita, riprova'
  }
}

interface LibraryResponse {
  exercises?: unknown
  updatedAt?: string
}

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = getToken()
  if (!token) throw new SharedError('auth', 401)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, token, ...body }),
      signal: controller.signal,
    })
    const text = await res.text()
    let data: { error?: string } & Record<string, unknown>
    try {
      data = JSON.parse(text) as { error?: string } & Record<string, unknown>
    } catch {
      throw new SharedError('server_error', res.status)
    }
    if (!res.ok) throw new SharedError(data.error ?? `http_${res.status}`, res.status)
    return data as T
  } catch (err) {
    if (err instanceof SharedError) throw err
    throw new SharedError('offline', 0)
  } finally {
    clearTimeout(timer)
  }
}

function isOffline(err: unknown): boolean {
  return (
    err instanceof SharedError &&
    (err.code === 'offline' || err.code === 'auth' || err.status === 0 || err.status >= 500)
  )
}

function normalizeItems(raw: unknown): SharedExerciseRecord[] {
  if (!Array.isArray(raw)) return []
  const items: SharedExerciseRecord[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Record<string, unknown>
    const id = String(e.id ?? '')
    const name = String(e.name ?? '')
    const muscle = String(e.muscle ?? '')
    const authorId = String(e.authorId ?? '')
    if (!id || !name || !authorId || !MUSCLES.has(muscle as Muscle)) continue
    items.push({
      id,
      name,
      alias: String(e.alias ?? '').slice(0, 64),
      muscle: muscle as Muscle,
      equipment: String(e.equipment ?? ''),
      tracking: (e.tracking === 'time' ? 'time' : 'reps') as ExerciseTracking,
      authorId,
      authorName: String(e.authorName ?? ''),
      createdAt: String(e.createdAt ?? ''),
      updatedAt: String(e.updatedAt ?? ''),
    })
  }
  return items
}

/** Scrive la libreria remota nella cache locale (solo se qualcosa è cambiato). */
function applySharedLibrary(items: SharedExerciseRecord[]): boolean {
  const local = query<{
    id: string
    name: string
    alias: string | null
    muscle: string
    equipment: string
    tracking: string | null
    updated_at: string
  }>(
    `SELECT id, name, alias, muscle, equipment, tracking, updated_at
       FROM exercises WHERE user_id IS NULL AND is_default = 0`,
  )
  const localById = new Map(local.map((row) => [row.id, row]))
  const remoteById = new Map(items.map((item) => [item.id, item]))

  let changed = local.length !== items.length
  for (const item of items) {
    if (changed) break
    const row = localById.get(item.id)
    if (!row) {
      changed = true
      break
    }
    // modifica locale in attesa di essere pubblicata: non va sovrascritta
    if (row.updated_at > item.updatedAt) continue
    if (
      row.name !== item.name ||
      (row.alias ?? '') !== item.alias ||
      row.muscle !== item.muscle ||
      row.equipment !== item.equipment ||
      parseTracking(row.tracking, row.muscle) !== item.tracking ||
      row.updated_at !== item.updatedAt
    ) {
      changed = true
    }
  }
  if (!changed) {
    for (const row of local) {
      if (!remoteById.has(row.id)) {
        changed = true
        break
      }
    }
  }
  if (!changed) return false

  tx((db) => {
    const upsert = db.prepare(
      `INSERT INTO exercises (id, user_id, name, alias, muscle, equipment, tracking, is_default, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name, alias = excluded.alias, muscle = excluded.muscle,
         equipment = excluded.equipment, tracking = excluded.tracking,
         user_id = NULL, is_default = 0, updated_at = excluded.updated_at
       WHERE excluded.updated_at >= exercises.updated_at`,
    )
    try {
      for (const item of items) {
        upsert.run([
          item.id,
          item.name,
          item.alias,
          item.muscle,
          item.equipment,
          item.tracking,
          item.createdAt || item.updatedAt || new Date().toISOString(),
          item.updatedAt || item.createdAt || new Date().toISOString(),
        ])
      }
      // esercizi ritirati dalla libreria comune: si tolgono da questa copia
      const stale = local.filter((row) => !remoteById.has(row.id)).map((row) => row.id)
      if (stale.length > 0) {
        db.run(
          `DELETE FROM exercises WHERE user_id IS NULL AND is_default = 0 AND id IN (${stale
            .map(() => '?')
            .join(',')})`,
          stale,
        )
      }
    } finally {
      upsert.free()
    }
  })
  return true
}

async function publishNow(userId: string, exerciseId: string): Promise<void> {
  const exercise = getExercise(exerciseId)
  if (!exercise) throw new SharedError('not_found', 404)
  if (exercise.isDefault) throw new SharedError('invalid_exercise', 400)

  const res = await call<LibraryResponse>('publish', {
    exercise: {
      id: exercise.id,
      name: exercise.name,
      alias: exercise.alias,
      muscle: exercise.muscle,
      equipment: exercise.equipment,
      tracking: exercise.tracking,
      createdAt: exercise.createdAt,
      updatedAt: exercise.updatedAt,
    },
  })
  const items = normalizeItems(res.exercises)
  if (items.length > 0) writeSharedCache(items)

  // da esercizio personale a esercizio della libreria comune
  if (exercise.userId !== null) {
    tx((db) => {
      db.run('UPDATE exercises SET user_id = NULL WHERE id = ? AND user_id = ?', [exerciseId, userId])
    })
  }
  // la foto (se c'è) passa nella libreria condivisa
  await uploadLocalExercisePhoto(userId, exerciseId).catch(() => false)
}

async function unpublishNow(userId: string, exerciseId: string): Promise<void> {
  const res = await call<LibraryResponse>('delete', { exerciseId })
  const items = normalizeItems(res.exercises)
  writeSharedCache(items)
  // l'esercizio torna privato per chi l'aveva condiviso
  tx((db) => {
    db.run('UPDATE exercises SET user_id = ? WHERE id = ? AND user_id IS NULL', [userId, exerciseId])
  })
}

/**
 * Porta nella libreria comune gli esercizi privati creati prima del rilascio
 * 2.7.0. Gira a ogni allineamento (economica), ma ogni id viene provato una
 * volta sola: gli esercizi un po' alla volta arrivati da altri dispositivi
 * vengono comunque presi, e un esercizio ritirato non viene ripubblicato.
 * I nomi già presenti nella libreria vengono saltati dal server.
 */
export async function migrateLegacyExercises(userId: string): Promise<void> {
  if (!getToken()) return

  const attempted = new Set(readMigratedLegacy(userId))
  const rows = query<{ id: string }>(
    `SELECT id FROM exercises
      WHERE user_id = ? AND is_default = 0
        AND created_at <> '' AND created_at < ?
      ORDER BY created_at ASC`,
    [userId, LEGACY_CUTOFF],
  ).filter((row) => !attempted.has(row.id))
  if (rows.length === 0) return

  const queue = readShareQueue(userId)
  const queued = new Set(queue.map((item) => item.exerciseId))
  for (const row of rows) {
    if (!queued.has(row.id)) queue.push({ action: 'publish', exerciseId: row.id })
    queued.add(row.id)
    attempted.add(row.id)
  }
  writeShareQueue(userId, queue)
  writeMigratedLegacy(userId, [...attempted])
}

/** Pubblica/subisce le condivisioni rimaste in coda (chiamata all'avvio e on focus). */
export async function flushShareQueue(userId: string): Promise<void> {
  const queue = readShareQueue(userId)
  if (queue.length === 0) return
  let index = 0
  for (; index < queue.length; index++) {
    // con molte condivisioni da fare si procede a blocchi, senza bloccare l'app
    if (index >= MAX_PER_RUN) break
    const item = queue[index]
    try {
      if (item.action === 'publish') await publishNow(userId, item.exerciseId)
      else await unpublishNow(userId, item.exerciseId)
    } catch (err) {
      if (isOffline(err)) break // si riprova al prossimo giro
      // errore definitivo (nome duplicato, esercizio sparito…): si scarta
      console.warn('[shared] condivisione ignorata', item, err)
    }
  }
  writeShareQueue(userId, queue.slice(index))
}

/**
 * Allinea la libreria comune: prima spinge le condivisioni in coda, poi
 * scarica quella remota (con cache di 5 minuti per non pesare sulla rete).
 */
export async function syncSharedExercises(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  if (!getToken()) return
  // una tantum: gli esercizi già creati entrano nella libreria comune
  await migrateLegacyExercises(userId)
  await flushShareQueue(userId)

  const cache = readSharedCache()
  if (opts.force || !cache.savedAt || Date.now() - cache.savedAt > CACHE_TTL) {
    const res = await call<LibraryResponse>('list')
    const items = normalizeItems(res.exercises)
    writeSharedCache(items)
    applySharedLibrary(items)
    return
  }
  // cache ancora valida: la si riapplica (economico) per i database nuovi
  applySharedLibrary(cache.items)
}

/** Rende l'esercizio disponibile a tutti (o lo mette in coda se si è offline). */
export async function shareExercise(
  userId: string,
  exerciseId: string,
): Promise<'published' | 'queued'> {
  try {
    await publishNow(userId, exerciseId)
    return 'published'
  } catch (err) {
    if (isOffline(err)) {
      const queue = readShareQueue(userId).filter((item) => item.exerciseId !== exerciseId)
      queue.push({ action: 'publish', exerciseId })
      writeShareQueue(userId, queue)
      return 'queued'
    }
    throw err
  }
}

/** Toglie l'esercizio dalla libreria comune (torna privato per l'autore). */
export async function unshareExercise(
  userId: string,
  exerciseId: string,
): Promise<'removed' | 'queued'> {
  try {
    await unpublishNow(userId, exerciseId)
    return 'removed'
  } catch (err) {
    if (isOffline(err)) {
      const queue = readShareQueue(userId).filter((item) => item.exerciseId !== exerciseId)
      queue.push({ action: 'unpublish', exerciseId })
      writeShareQueue(userId, queue)
      return 'queued'
    }
    throw err
  }
}
