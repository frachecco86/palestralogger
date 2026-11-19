import type { ExerciseTracking, Muscle } from './types'

/**
 * Copia locale (localStorage) della libreria comune degli esercizi.
 * La usa l'interfaccia per sapere chi ha condiviso un esercizio e per non
 * rifare la richiesta al server a ogni apertura.
 */

export interface SharedExerciseRecord {
  id: string
  name: string
  alias: string
  muscle: Muscle
  equipment: string
  tracking: ExerciseTracking
  authorId: string
  authorName: string
  createdAt: string
  updatedAt: string
}

export interface SharedExerciseCache {
  savedAt: number
  items: SharedExerciseRecord[]
  /** Esercizi pre-caricati eliminati dall'amministratore (visibili a tutti). */
  hiddenDefaults: string[]
}

const CACHE_KEY = 'palestralogger:shared-exercises'

export function readSharedCache(): SharedExerciseCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { savedAt: 0, items: [], hiddenDefaults: [] }
    const parsed = JSON.parse(raw) as Partial<SharedExerciseCache>
    return {
      savedAt: Number(parsed?.savedAt) || 0,
      items: Array.isArray(parsed?.items) ? parsed.items : [],
      hiddenDefaults: Array.isArray(parsed?.hiddenDefaults)
        ? parsed.hiddenDefaults.filter((id) => typeof id === 'string')
        : [],
    }
  } catch {
    return { savedAt: 0, items: [], hiddenDefaults: [] }
  }
}

export function writeSharedCache(
  items: SharedExerciseRecord[],
  savedAt = Date.now(),
  hiddenDefaults: string[] = [],
): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt, items, hiddenDefaults }))
  } catch {
    /* storage non disponibile */
  }
}

export function findSharedRecord(exerciseId: string): SharedExerciseRecord | null {
  return readSharedCache().items.find((item) => item.id === exerciseId) ?? null
}

/** L'utente indicato è l'autore dell'esercizio condiviso? */
export function isSharedAuthor(
  exerciseId: string,
  authorId: string | null | undefined,
): boolean {
  if (!authorId) return false
  return findSharedRecord(exerciseId)?.authorId === authorId
}

export function sharedAuthorName(exerciseId: string): string {
  return findSharedRecord(exerciseId)?.authorName ?? ''
}

// ---------- coda delle condivisioni (funziona offline) ----------

export type ShareAction = 'publish' | 'unpublish' | 'delete'

export interface ShareQueueItem {
  action: ShareAction
  exerciseId: string
}

const QUEUE_PREFIX = 'palestralogger:share-queue:'

export function readShareQueue(userId: string): ShareQueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_PREFIX + userId)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ShareQueueItem[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) =>
        item &&
        typeof item.exerciseId === 'string' &&
        (item.action === 'publish' || item.action === 'unpublish' || item.action === 'delete'),
    )
  } catch {
    return []
  }
}

export function writeShareQueue(userId: string, items: ShareQueueItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(QUEUE_PREFIX + userId)
    else localStorage.setItem(QUEUE_PREFIX + userId, JSON.stringify(items))
  } catch {
    /* storage non disponibile */
  }
}

export function hasPendingShare(userId: string, exerciseId: string): boolean {
  return readShareQueue(userId).some((item) => item.exerciseId === exerciseId)
}

// ---------- migrazione una tantum degli esercizi creati prima della 2.7.0 ----------

const MIGRATION_PREFIX = 'palestralogger:shared-migration:'

/** Id degli esercizi legacy già passati dalla migrazione (pubblicati o saltati). */
export function readMigratedLegacy(userId: string): string[] {
  try {
    const raw = localStorage.getItem(MIGRATION_PREFIX + userId)
    if (!raw || raw === '1') return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function writeMigratedLegacy(userId: string, ids: string[]): void {
  try {
    localStorage.setItem(MIGRATION_PREFIX + userId, JSON.stringify([...new Set(ids)]))
  } catch {
    /* storage non disponibile */
  }
}
