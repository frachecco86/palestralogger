import { applySyncPayload, buildSyncPayload, importSyncProfile, type SyncPayload } from '../db/sync-queries'

const API_URL = '/api/sync'
const CODE_PREFIX = 'palestralogger:sync:'
const LAST_PREFIX = 'palestralogger:sync-last:'
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export interface SyncMeta {
  at: string
  ok: boolean
  error?: string
}

export interface PullResult {
  revision: number
  payload: SyncPayload | null
}

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

export function getSyncCode(userId: string): string | null {
  return readStorage(CODE_PREFIX + userId)
}

export function setSyncCode(userId: string, code: string | null): void {
  writeStorage(CODE_PREFIX + userId, code)
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

export function generateSyncCode(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < 16; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return out.replace(/(.{4})(?=.)/g, '$1-')
}

export function normalizeSyncCode(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16)
  return clean.replace(/(.{4})(?=.)/g, '$1-')
}

export function isValidSyncCode(raw: string): boolean {
  return /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(normalizeSyncCode(raw))
}

async function callApi<T>(body: Record<string, unknown>): Promise<{ status: number; data: T }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    let data: T
    try {
      data = JSON.parse(text) as T
    } catch {
      throw new Error('Servizio di sincronizzazione non disponibile')
    }
    return { status: res.status, data }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Sincronizzazione scaduta, riprova')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function errorFrom(data: unknown): string {
  const err = (data as { error?: string } | null)?.error
  switch (err) {
    case 'invalid_code':
      return 'Codice di sincronizzazione non valido'
    case 'payload_too_large':
      return 'Troppi dati da sincronizzare'
    case 'method_not_allowed':
      return 'Servizio di sincronizzazione non disponibile'
    case 'server_error':
      return 'Errore del server di sincronizzazione'
    default:
      return 'Sincronizzazione non riuscita'
  }
}

export async function pullRemote(code: string): Promise<PullResult> {
  const { status, data } = await callApi<PullResult & { error?: string }>({
    action: 'pull',
    code: normalizeSyncCode(code),
  })
  if (status !== 200) throw new Error(errorFrom(data))
  return { revision: data.revision ?? 0, payload: data.payload ?? null }
}

type PushResponse =
  | { revision: number; error?: undefined }
  | { revision: number; payload: SyncPayload | null; conflict: true }

export async function pushRemote(
  code: string,
  payload: SyncPayload,
  baseRevision: number,
): Promise<PushResponse> {
  const { status, data } = await callApi<PushResponse & { error?: string }>({
    action: 'push',
    code: normalizeSyncCode(code),
    payload,
    baseRevision,
  })
  if (status === 409) return { ...(data as object), conflict: true } as PushResponse
  if (status !== 200) throw new Error(errorFrom(data))
  return data
}

/** Pull + merge + push con risoluzione ottimistica dei conflitti. */
export async function syncNow(userId: string): Promise<SyncMeta | null> {
  const code = getSyncCode(userId)
  if (!code) return null
  if (syncing) return null
  if (Date.now() - lastAttemptAt < 1200) return null

  syncing = true
  lastAttemptAt = Date.now()
  try {
    let remote = await pullRemote(code)
    for (let attempt = 0; attempt < 3; attempt++) {
      const merged = applySyncPayload(userId, remote.payload)
      const pushed = await pushRemote(code, merged, remote.revision)
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

/** Attiva la sync per il profilo e restituisce il codice da usare sugli altri dispositivi. */
export async function activateSync(userId: string): Promise<string> {
  const existing = getSyncCode(userId)
  if (existing) return existing

  const code = generateSyncCode()
  const payload = buildSyncPayload(userId)
  const pushed = await pushRemote(code, payload, 0)
  if ('conflict' in pushed && pushed.conflict) {
    throw new Error('Codice già in uso, riprova')
  }
  setSyncCode(userId, code)
  setLastSync(userId, { at: new Date().toISOString(), ok: true })
  return code
}

/** Su un nuovo dispositivo: scarica profilo e dati dal codice e collega la sync. */
export async function linkDevice(rawCode: string): Promise<string> {
  const code = normalizeSyncCode(rawCode)
  if (!isValidSyncCode(code)) throw new Error('Inserisci un codice di 16 caratteri')
  const remote = await pullRemote(code)
  if (!remote.payload || !remote.payload.profile) {
    throw new Error('Nessun dato trovato per questo codice')
  }
  const userId = importSyncProfile(remote.payload.profile)
  applySyncPayload(userId, remote.payload)
  setSyncCode(userId, code)
  await syncNow(userId)
  return userId
}

export async function disableSync(
  userId: string,
  options: { deleteRemote: boolean },
): Promise<void> {
  const code = getSyncCode(userId)
  setSyncCode(userId, null)
  writeStorage(LAST_PREFIX + userId, null)
  if (options.deleteRemote && code) {
    await callApi({ action: 'delete', code: normalizeSyncCode(code) })
  }
}

export function formatSyncTime(iso: string): string {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'adesso'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min fa`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h fa`
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
}
