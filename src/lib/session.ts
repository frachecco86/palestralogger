const KEY = 'palestralogger:session'

export function getSessionUserId(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setSessionUserId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id)
    else localStorage.removeItem(KEY)
  } catch {
    /* storage non disponibile: sessione solo in memoria */
  }
}

const LAST_KEY = 'palestralogger:last-profile'

export function getLastProfileId(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

export function setLastProfileId(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_KEY, id)
    else localStorage.removeItem(LAST_KEY)
  } catch {
    /* ignore */
  }
}
