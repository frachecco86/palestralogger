import { applySyncPayload, buildSyncPayload, type SyncPayload } from '../db/sync-queries'
import { getCachedAccount, pushRemote, pullRemote } from './account'

/**
 * Sync con il database online: pull → merge last-write-wins → push con
 * revisione ottimistica. La copia locale SQLite è solo una cache: se il
 * telefono la perde, al prossimo accesso i dati tornano dal cloud.
 */

export interface SyncMeta {
  at: string
  ok: boolean
  error?: string
}

const LAST_PREFIX = 'palestralogger:sync-last:'

let syncing = false
let lastAttemptAt = 0

export function isSyncing(): boolean {
  return syncing
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function getLastSync(userId: string): SyncMeta | null {
  const raw = readStorage(LAST_PREFIX + userId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SyncMeta
  } catch {
    return null
  }
}

function setLastSync(userId: string, meta: SyncMeta) {
  writeStorage(LAST_PREFIX + userId, JSON.stringify(meta))
  try {
    window.dispatchEvent(new CustomEvent('palestralogger:sync', { detail: meta }))
  } catch {
    /* ignore */
  }
}

/** Confronto senza il timestamp di generazione: evita push inutili. */
function samePayload(a: unknown, b: unknown): boolean {
  if (!a || !b) return false
  const strip = (value: unknown) => {
    const { savedAt: _savedAt, ...rest } = value as Record<string, unknown>
    return JSON.stringify(rest)
  }
  return strip(a) === strip(b)
}

/**
 * Allinea il dispositivo con il cloud. Se il cloud è vuoto (primo accesso)
 * carica i dati locali; se il locale è vuoto scarica tutto dal cloud.
 */
export async function syncNow(userId: string): Promise<SyncMeta | null> {
  if (!getCachedAccount()) return null
  if (syncing) return null
  if (Date.now() - lastAttemptAt < 1200) return null

  syncing = true
  lastAttemptAt = Date.now()
  try {
    let remote = await pullRemote()
    for (let attempt = 0; attempt < 4; attempt++) {
      const merged = applySyncPayload(userId, remote.payload)
      if (samePayload(merged, remote.payload)) {
        const meta: SyncMeta = { at: new Date().toISOString(), ok: true }
        setLastSync(userId, meta)
        return meta
      }
      const pushed = await pushRemote(merged, remote.revision)
      if (!('conflict' in pushed) || !pushed.conflict) {
        const meta: SyncMeta = { at: new Date().toISOString(), ok: true }
        setLastSync(userId, meta)
        return meta
      }
      remote = { revision: pushed.revision, payload: pushed.payload }
    }
    throw new Error('Conflitto di sincronizzazione, riprova')
  } catch (err) {
    const meta: SyncMeta = {
      at: new Date().toISOString(),
      ok: false,
      error: err instanceof Error ? err.message : 'Sincronizzazione non riuscita',
    }
    setLastSync(userId, meta)
    throw err
  } finally {
    syncing = false
  }
}

/** Forza un push immediato dei soli dati locali (usato dopo l'import di un backup). */
export async function pushLocal(userId: string): Promise<void> {
  const remote = await pullRemote()
  let revision = remote.revision
  for (let attempt = 0; attempt < 3; attempt++) {
    const payload: SyncPayload = buildSyncPayload(userId)
    const pushed = await pushRemote(payload, revision)
    if (!('conflict' in pushed) || !pushed.conflict) return
    revision = pushed.revision
  }
  throw new Error('Conflitto di sincronizzazione, riprova')
}

export function formatSyncTime(iso: string): string {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'adesso'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min fa`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h fa`
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}
