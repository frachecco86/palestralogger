import {
  deleteExercisePhoto,
  getExercisePhoto,
  listExercisePhotoMeta,
  saveExercisePhoto,
} from '../db/queries'
import { getToken, isAdmin } from './account'

/**
 * Foto esercizio: compressa sul telefono, salvata in SQLite (cache offline) e
 * caricata come blob separato, così non gonfia il payload di sincronizzazione.
 *
 * Le immagini sono una libreria unica condivisa da tutti gli account: le
 * scrive solo l'amministratore (aggiunta, sostituzione, rimozione), tutti gli
 * altri le leggono e ne tengono una copia locale per l'offline.
 */

const API = '/api/photo'
const MAX_UPLOAD_BYTES = 1_450_000
const MAX_UPLOAD_BASE64 = MAX_UPLOAD_BYTES * 2
const MAX_SIDE = 520

interface RemotePhotoMeta {
  updatedAt: string
  size: number
  mime: string
}

export interface RemotePhotoIndex {
  photos: Record<string, RemotePhotoMeta>
  deleted: Record<string, string>
}

export class PhotoError extends Error {
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
    case 'photo_too_large':
      return 'Foto troppo grande, scegline una più piccola'
    case 'invalid_mime':
      return 'Formato immagine non supportato'
    case 'invalid_exercise':
      return 'Esercizio non valido'
    case 'admin_only':
      return 'Solo l’amministratore può gestire le foto degli esercizi'
    case 'not_found':
      return 'Foto non trovata'
    case 'offline':
      return 'Server non raggiungibile: la foto resta sul telefono'
    default:
      return 'Operazione non riuscita, riprova'
  }
}

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = getToken()
  if (!token) throw new PhotoError('auth', 401)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
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
      throw new PhotoError('server_error', res.status)
    }
    if (!res.ok) throw new PhotoError(data.error ?? `http_${res.status}`, res.status)
    return data as T
  } catch (err) {
    if (err instanceof PhotoError) throw err
    throw new PhotoError('offline', 0)
  } finally {
    clearTimeout(timer)
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(data: string): Uint8Array {
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function loadImage(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if (typeof createImageBitmap === 'function') {
    return await createImageBitmap(file)
  }
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Immagine non leggibile'))
      img.src = url
    })
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5_000)
  }
}

/** Ridimensiona e comprime in JPEG: le foto da telefono passano da MB a ~30-60 kB. */
export async function compressImage(file: File): Promise<{ mime: string; bytes: Uint8Array }> {
  if (!file.type.startsWith('image/')) throw new Error('Il file scelto non è un’immagine')
  const supported = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)

  try {
    const image = await loadImage(file)
    const width = 'width' in image ? image.width : 0
    const height = 'height' in image ? image.height : 0
    if (!width || !height) throw new Error('Dimensioni non disponibili')
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height))
    const w = Math.max(1, Math.round(width * scale))
    const h = Math.max(1, Math.round(height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas non disponibile')
    // sfondo bianco: le PNG trasparenti non diventano nere
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(image as CanvasImageSource, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.72),
    )
    if (!blob) throw new Error('Compressione non riuscita')
    if (blob.size > MAX_UPLOAD_BYTES) throw new Error('Foto troppo grande, scegline una più piccola')
    return { mime: 'image/jpeg', bytes: new Uint8Array(await blob.arrayBuffer()) }
  } catch (err) {
    // fallback: file originale, solo se già piccolo e in un formato accettato
    if (err instanceof Error && err.message.includes('troppo grande')) throw err
    if (!supported) throw new Error('Formato immagine non supportato')
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('Foto troppo grande, scegline una più piccola')
    return { mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
  }
}

/** Aggiunge/sostituisce la foto: prima in locale, poi sul cloud (se possibile). */
export async function addExercisePhoto(
  userId: string,
  exerciseId: string,
  file: File,
): Promise<{ updatedAt: string; uploaded: boolean }> {
  if (!isAdmin()) throw new PhotoError('admin_only', 403)
  const { mime, bytes } = await compressImage(file)
  const updatedAt = saveExercisePhoto(userId, exerciseId, mime, bytes)
  let uploaded = true
  try {
    await call('put', {
      exerciseId,
      mime,
      updatedAt,
      data: bytesToBase64(bytes),
    })
  } catch {
    uploaded = false
  }
  return { updatedAt, uploaded }
}

/** Rimuove la foto: dal cloud prima, così non "risorge" da un altro dispositivo. */
export async function removeExercisePhoto(userId: string, exerciseId: string): Promise<void> {
  if (!isAdmin()) throw new PhotoError('admin_only', 403)
  await call('delete', { exerciseId })
  deleteExercisePhoto(userId, exerciseId)
}

export async function listRemotePhotos(): Promise<RemotePhotoIndex> {
  return call<RemotePhotoIndex>('list')
}

export async function downloadExercisePhoto(exerciseId: string) {
  return call<{ exerciseId: string; mime: string; updatedAt: string; data: string }>('get', {
    exerciseId,
  })
}

/**
 * Riconcilia le foto locali e cloud:
 * - applica le cancellazioni fatte altrove;
 * - carica le foto locali nuove o più recenti;
 * - scarica quelle richieste (es. esercizi dell'allenamento aperto).
 * Restituisce gli id degli esercizi le cui foto sono cambiate localmente.
 */
export async function syncPhotos(userId: string, downloadFor: string[] = []): Promise<string[]> {
  if (!getToken()) return []
  const remote = await listRemotePhotos()
  const changed = new Set<string>()
  const localMeta = new Map(listExercisePhotoMeta(userId).map((p) => [p.exerciseId, p.updatedAt]))
  const deleted = remote.deleted ?? {}
  const photos = remote.photos ?? {}

  // 1. cancellazioni remoti
  for (const [exerciseId, deletedAt] of Object.entries(deleted)) {
    const localAt = localMeta.get(exerciseId)
    if (!localAt || localAt > deletedAt) continue
    deleteExercisePhoto(userId, exerciseId)
    localMeta.delete(exerciseId)
    changed.add(exerciseId)
  }

  // 2. upload delle foto locali nuove o più recenti (solo l'amministratore
  //    può scrivere nel cloud: gli altri si limitano a leggere)
  if (isAdmin()) {
    for (const [exerciseId, localAt] of localMeta) {
      const remoteMeta = photos[exerciseId]
      if (remoteMeta && remoteMeta.updatedAt >= localAt) continue
      const local = getExercisePhoto(userId, exerciseId)
      if (!local) continue
      if (local.bytes.length > MAX_UPLOAD_BYTES) continue
      try {
        const result = await call<{ ignored?: boolean }>('put', {
          exerciseId,
          mime: local.mime,
          updatedAt: localAt,
          data: bytesToBase64(local.bytes),
        })
        if (result.ignored) {
          // cancellata altrove dopo questa copia: si rimuove anche in locale
          deleteExercisePhoto(userId, exerciseId)
        }
        changed.add(exerciseId)
      } catch {
        /* offline o troppo grande: si riprova al prossimo giro */
      }
    }
  }

  // 3. download richiesti
  for (const exerciseId of downloadFor) {
    const remoteMeta = photos[exerciseId]
    if (!remoteMeta) continue
    const localAt = localMeta.get(exerciseId)
    if (localAt && localAt >= remoteMeta.updatedAt) continue
    try {
      const photo = await downloadExercisePhoto(exerciseId)
      if (photo.data.length > MAX_UPLOAD_BASE64) continue
      saveExercisePhoto(userId, exerciseId, photo.mime, base64ToBytes(photo.data), photo.updatedAt)
      changed.add(exerciseId)
    } catch {
      /* riprova quando l'esercizio viene riaperto */
    }
  }

  return [...changed]
}
