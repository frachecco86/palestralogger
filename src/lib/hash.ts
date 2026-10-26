function toHex(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes)
  crypto.getRandomValues(arr)
  return toHex(arr)
}

/** PIN mai salvato in chiaro: PBKDF2-SHA256 con salt casuale. */
export async function hashPin(pin: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const useSalt = salt ?? randomHex(16)
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(useSalt), iterations: 120_000, hash: 'SHA-256' },
    keyMaterial,
    256,
  )
  return { hash: toHex(bits), salt: useSalt }
}

export async function verifyPin(pin: string, hash: string, salt: string): Promise<boolean> {
  const res = await hashPin(pin, salt)
  if (res.hash.length !== hash.length) return false
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= res.hash.charCodeAt(i) ^ hash.charCodeAt(i)
  return diff === 0
}

export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return randomHex(16)
}
