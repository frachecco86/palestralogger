/**
 * Stato locale legato al dispositivo.
 * La sessione vera è il token dell'account (src/lib/account.ts); qui teniamo
 * solo a quale account appartengono i dati SQLite presenti sul telefono.
 */

const OWNER_KEY = 'palestralogger:local-owner'

export function getLocalOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY)
  } catch {
    return null
  }
}

export function setLocalOwner(id: string | null): void {
  try {
    if (id) localStorage.setItem(OWNER_KEY, id)
    else localStorage.removeItem(OWNER_KEY)
  } catch {
    /* storage non disponibile */
  }
}
