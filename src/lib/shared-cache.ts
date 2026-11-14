import type { ExerciseTracking, Muscle } from './types'

/**
 * Copia locale (localStorage) della libreria comune degli esercizi.
 * La usa l'interfaccia per sapere chi ha condiviso un esercizio e per non
 * rifare la richiesta al server a ogni apertura.
 */

export interface SharedExerciseRecord {
  id: string
  name: string
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
}

const CACHE_KEY = 'palestralogger:shared-exercises'

export function readSharedCache(): SharedExerciseCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { savedAt: 0, items: [] }
    const parsed = JSON.parse(raw) as Partial<SharedExerciseCache>
    return {
      savedAt: Number(parsed?.savedAt) || 0,
      items: Array.isArray(parsed?.items) ? parsed.items : [],
    }
  } catch {
    return { savedAt: 0, items: [] }
  }
}

export function writeSharedCache(items: SharedExerciseRecord[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items }))
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

export type ShareAction = 'publish' | 'unpublish'

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
        (item.action === 'publish' || item.action === 'unpublish'),
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
