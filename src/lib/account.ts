import type { SyncPayload } from '../db/sync-queries'

/**
 * Account cloud: email + password, sessione persistente e database online.
 * Il token viene salvato localmente per riaprire l'app offline; se lo storage
 * del telefono viene svuotato basta rifare l'accesso e i dati tornano dal cloud.
 */

const TOKEN_KEY = 'palestralogger:account-token'
const ACCOUNT_KEY = 'palestralogger:account-info'
const API_URL = '/api/account'

export type AccountRole = 'admin' | 'user'

export interface Account {
  id: string
  uid: string
  email: string
  name: string
  createdAt: string
  role?: AccountRole
}

/**
 * Email con ruolo amministratore (le stesse della funzione cloud). Il ruolo
 * arriva dal server, ma il controllo sull'email vale anche per le copie in
 * cache salvate prima dell'introduzione dei ruoli.
 */
const ADMIN_EMAILS = ['francescochecco@gmail.com']

export function isAdmin(account: Account | null = getCachedAccount()): boolean {
  if (!account) return false
  if (account.role === 'admin') return true
  return ADMIN_EMAILS.includes(String(account.email ?? '').trim().toLowerCase())
}

export interface PullResult {
  revision: number
  payload: SyncPayload | null
  updatedAt?: string | null
}

export class AccountError extends Error {
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
    case 'invalid_credentials':
      return 'Email o password non corretti'
    case 'invalid_recovery':
      return 'Codice di recupero non valido'
    case 'invalid_email':
      return 'Inserisci un indirizzo email valido'
    case 'weak_password':
      return 'La password deve avere almeno 8 caratteri'
    case 'invalid_password':
      return 'Password non valida'
    case 'invalid_name':
      return 'Il nome deve avere da 2 a 24 caratteri'
    case 'email_in_use':
      return 'Esiste già un account con questa email'
    case 'too_many_attempts':
      return 'Troppi tentativi: riprova tra 15 minuti'
    case 'auth':
      return 'Sessione scaduta, accedi di nuovo'
    case 'no_data':
      return 'Nessun dato trovato per questo codice'
    case 'invalid_code':
      return 'Codice non valido'
    case 'invalid_payload':
    case 'payload_too_large':
      return 'Troppi dati da salvare'
    case 'not_found':
      return 'Account non trovato'
    case 'admin_only':
      return 'Solo l’amministratore può gestire le foto degli esercizi'
    case 'offline':
      return 'Server non raggiungibile: i dati restano sul telefono e verranno sincronizzati'
    case 'server_error':
      return 'Errore del server, riprova'
    default:
      return 'Operazione non riuscita, riprova'
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* storage non disponibile */
  }
}

export function getToken(): string | null {
  return read(TOKEN_KEY)
}

export function getCachedAccount(): Account | null {
  const raw = read(ACCOUNT_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Account
    return parsed?.id ? parsed : null
  } catch {
    return null
  }
}

export function saveSession(token: string, account: Account): void {
  write(TOKEN_KEY, token)
  write(ACCOUNT_KEY, JSON.stringify(account))
}

export function saveAccount(account: Account): void {
  write(ACCOUNT_KEY, JSON.stringify(account))
}

export function clearSession(): void {
  write(TOKEN_KEY, null)
  write(ACCOUNT_KEY, null)
}

export function isLoggedIn(): boolean {
  return !!getToken() && !!getCachedAccount()
}

function notifyExpired() {
  clearSession()
  try {
    window.dispatchEvent(new CustomEvent('palestralogger:auth-expired'))
  } catch {
    /* ignore */
  }
}

type CallOptions = { auth?: boolean; expireOn401?: boolean; allowStatus?: number[] }

async function call<T>(
  action: string,
  body: Record<string, unknown> = {},
  options: CallOptions = {},
): Promise<T> {
  const token = getToken()
  if (options.auth && !token) throw new AccountError('auth', 401)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...(token && options.auth ? { token } : {}), ...body }),
      signal: controller.signal,
    })
    const text = await res.text()
    let data: { error?: string } & Record<string, unknown>
    try {
      data = JSON.parse(text) as { error?: string } & Record<string, unknown>
    } catch {
      throw new AccountError('server_error', res.status)
    }

    if (!res.ok) {
      if (res.status === 401 && options.auth && options.expireOn401 !== false) notifyExpired()
      if (!options.allowStatus?.includes(res.status)) {
        throw new AccountError(data.error ?? `http_${res.status}`, res.status)
      }
    }
    return data as T
  } catch (err) {
    if (err instanceof AccountError) throw err
    if (err instanceof Error && err.name === 'AbortError') throw new AccountError('offline', 0)
    throw new AccountError('offline', 0)
  } finally {
    clearTimeout(timer)
  }
}

export interface AuthResponse {
  token: string
  account: Account
  recoveryCode?: string
  revision: number
}

export async function register(email: string, password: string, name: string): Promise<AuthResponse> {
  const res = await call<AuthResponse>('register', { email, password, name }, { auth: false })
  saveSession(res.token, res.account)
  return res
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await call<AuthResponse>('login', { email, password }, { auth: false })
  saveSession(res.token, res.account)
  return res
}

export async function logout(): Promise<void> {
  const token = getToken()
  clearSession()
  if (!token) return
  try {
    await call('logout', { token }, { auth: false })
  } catch {
    /* offline: la sessione locale è comunque chiusa */
  }
}

/** Verifica il token salvato. Se offline restituisce l'account in cache. */
export async function validateSession(): Promise<Account | null> {
  if (!getToken()) return null
  try {
    const res = await call<{ account: Account }>('session', {}, { auth: true })
    saveAccount(res.account)
    return res.account
  } catch (err) {
    if (err instanceof AccountError && err.code === 'offline') return getCachedAccount()
    return null
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await call<{ token: string; account: Account }>(
    'changePassword',
    { currentPassword, newPassword },
    { auth: true, expireOn401: false },
  )
  saveSession(res.token, res.account)
}

export async function rotateRecoveryCode(password: string): Promise<string> {
  const res = await call<{ recoveryCode: string }>(
    'rotateRecovery',
    { password },
    { auth: true, expireOn401: false },
  )
  return res.recoveryCode
}

export async function resetWithRecovery(
  email: string,
  code: string,
  newPassword: string,
): Promise<AuthResponse> {
  const res = await call<AuthResponse>(
    'resetWithRecovery',
    { email, code, newPassword },
    { auth: false },
  )
  saveSession(res.token, res.account)
  return res
}

export async function deleteAccount(password: string): Promise<void> {
  await call('delete', { password }, { auth: true, expireOn401: false })
  clearSession()
}

export async function renameAccount(name: string): Promise<Account> {
  const res = await call<{ account: Account }>('rename', { name }, { auth: true })
  saveAccount(res.account)
  return res.account
}

export async function pullRemote(): Promise<PullResult> {
  return call<PullResult>('pull', {}, { auth: true })
}

export type PushResult =
  | { revision: number; updatedAt: string; conflict?: undefined }
  | { revision: number; payload: SyncPayload | null; conflict: true }

export async function pushRemote(
  payload: SyncPayload,
  baseRevision: number,
): Promise<PushResult> {
  return call<PushResult>('push', { payload, baseRevision }, { auth: true, allowStatus: [409] })
}

/** Recupera i dati di un vecchio profilo dal suo codice sync (16 caratteri). */
export async function claimLegacyCode(code: string): Promise<PullResult> {
  return call<PullResult>('claimSyncCode', { code }, { auth: true })
}

export function isValidLegacyCode(raw: string): boolean {
  return /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(normalizeLegacyCode(raw))
}

export function normalizeLegacyCode(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16)
  return clean.replace(/(.{4})(?=.)/g, '$1-')
}
