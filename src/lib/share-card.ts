import type { Muscle, WorkoutDetail } from './types'
import { MUSCLE_COLORS } from './types'
import { formatDateLong } from './dates'
import { formatKg, formatWeight } from './format'

/**
 * Immagine condivisibile di un allenamento.
 * Formato verticale 9:16 (1080 × 1920): storie, WhatsApp, chat.
 *
 * Due stili soli:
 * - «Con foto»: una foto scelta dall'utente fa da sfondo (stile Strava);
 * - «Solo dati»: sfondo scuro, nessuna immagine.
 *
 * Il contenuto è lo stesso: nome della persona, data, nome dell'allenamento,
 * numero di serie, esercizi con il dettaglio dei carichi (es. «3 da 10 kg ·
 * 2 da 40 kg») e, in fondo, il nome dell'app e il testo del footer.
 */

export type ShareCardStyle = 'foto' | 'dati'

export const SHARE_CARD_STYLES: ReadonlyArray<{
  id: ShareCardStyle
  label: string
  hint: string
}> = [
  {
    id: 'foto',
    label: 'Con foto',
    hint: 'La tua foto come sfondo, in stile Strava: puoi caricarla qui sotto',
  },
  {
    id: 'dati',
    label: 'Solo dati',
    hint: 'Sfondo scuro, nessuna immagine: allenamento, serie e carichi',
  },
]

export const SHARE_CARD_WIDTH = 1080
export const SHARE_CARD_HEIGHT = 1920

const W = SHARE_CARD_WIDTH
const H = SHARE_CARD_HEIGHT
const MARGIN = 80
const CONTENT = W - MARGIN * 2

const FONT_STACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const INK = '#0A0C09'
const TEXT = '#F4F7F1'
const MUTED = '#C2CCBA'
const FAINT = '#8B9585'
const LIME = '#C8FF3D'
const RULE = 'rgba(255, 255, 255, 0.16)'
const ROW_RULE = 'rgba(255, 255, 255, 0.10)'

const APP_NAME = 'PalestraLogger'
const FOOTER_TEXT = 'CHECCO digital creaction 2026'

const FOOTER_RULE_Y = H - 236
const FOOTER_NAME_BASELINE = H - 158
const FOOTER_TEXT_BASELINE = H - 100

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT_STACK}`

// ---------- helper canvas ----------

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** Testo con spaziatura tra le lettere (uniforme su tutti i browser). */
function spacedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
  align: 'left' | 'center' | 'right' = 'left',
): number {
  const chars = [...text]
  const widths = chars.map((char) => ctx.measureText(char).width)
  const total = widths.reduce((sum, width) => sum + width, 0) + spacing * Math.max(0, chars.length - 1)
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  chars.forEach((char, index) => {
    ctx.fillText(char, cursor, y)
    cursor += widths[index] + spacing
  })
  return total
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text
  if (maxWidth <= 0) return ''
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1)
  }
  return `${out.trimEnd()}…`
}

function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate
    } else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

interface FittedTitle {
  size: number
  lines: string[]
}

/** Titolo su più righe con la dimensione più grande che ci sta. */
function fitTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxLines: number,
  sizes: number[],
): FittedTitle {
  for (const size of sizes) {
    ctx.font = font(800, size)
    const wrapped = wrapWords(ctx, text, CONTENT)
    if (
      wrapped.length <= maxLines &&
      wrapped.every((line) => ctx.measureText(line).width <= CONTENT)
    ) {
      return { size, lines: wrapped }
    }
  }
  const size = sizes[sizes.length - 1]
  ctx.font = font(800, size)
  const wrapped = wrapWords(ctx, text, CONTENT).slice(0, maxLines)
  return { size, lines: wrapped.map((line) => truncate(ctx, line, CONTENT)) }
}

function sourceSize(source: CanvasImageSource): { width: number; height: number } {
  const value = source as unknown as {
    width?: number
    height?: number
    naturalWidth?: number
    naturalHeight?: number
    videoWidth?: number
    videoHeight?: number
  }
  return {
    width: value.naturalWidth || value.videoWidth || value.width || 0,
    height: value.naturalHeight || value.videoHeight || value.height || 0,
  }
}

/** Disegna la foto riempiendo il formato 9:16 (ritaglio centrale). */
function drawCover(ctx: CanvasRenderingContext2D, photo: CanvasImageSource): void {
  const { width, height } = sourceSize(photo)
  if (!width || !height) return
  const scale = Math.max(W / width, H / height)
  const drawW = width * scale
  const drawH = height * scale
  ctx.drawImage(photo, (W - drawW) / 2, (H - drawH) / 2, drawW, drawH)
}

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save()
  ctx.fillStyle = LIME
  roundRect(ctx, x, y, size, size, size * 0.28)
  ctx.fill()
  ctx.strokeStyle = INK
  ctx.lineWidth = Math.max(2, size * 0.075)
  ctx.lineCap = 'round'
  const cx = x + size / 2
  const cy = y + size / 2
  const bar = size * 0.24
  const arm = size * 0.16
  ctx.beginPath()
  ctx.moveTo(cx - bar, cy - arm)
  ctx.lineTo(cx - bar, cy + arm)
  ctx.moveTo(cx - bar - size * 0.1, cy - arm * 0.55)
  ctx.lineTo(cx - bar - size * 0.1, cy + arm * 0.55)
  ctx.moveTo(cx + bar, cy - arm)
  ctx.lineTo(cx + bar, cy + arm)
  ctx.moveTo(cx + bar + size * 0.1, cy - arm * 0.55)
  ctx.lineTo(cx + bar + size * 0.1, cy + arm * 0.55)
  ctx.moveTo(cx - bar, cy)
  ctx.lineTo(cx + bar, cy)
  ctx.stroke()
  ctx.restore()
}

// ---------- dati per la card ----------

interface SetGroup {
  /** numero di serie con questo carico */
  count: number
  weight: number
  reps: number[]
}

interface CardExercise {
  name: string
  muscle: Muscle
  color: string
  sets: number
  groups: SetGroup[]
  volume: number
}

interface CardData {
  workout: WorkoutDetail
  userName: string
  title: string
  dateLabel: string
  exercises: CardExercise[]
  totalSets: number
  volume: number
}

export interface ShareCardInput {
  workout: WorkoutDetail
  userName: string
  style?: ShareCardStyle
  /** Foto di sfondo (già caricata): usata solo dallo stile «foto». */
  photo?: CanvasImageSource | null
}

function startCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function buildGroups(sets: Array<{ reps: number; weight: number }>): SetGroup[] {
  const map = new Map<string, SetGroup>()
  for (const set of sets) {
    const key = set.weight.toFixed(1)
    const group = map.get(key)
    if (group) {
      group.count += 1
      group.reps.push(set.reps)
    } else {
      map.set(key, { count: 1, weight: set.weight, reps: [set.reps] })
    }
  }
  // carichi più alti per primi: è quello che interessa di più
  return [...map.values()].sort((a, b) => b.weight - a.weight)
}

function buildExercises(workout: WorkoutDetail): CardExercise[] {
  return workout.entries.map((entry) => {
    const sets = entry.sets
    return {
      name: entry.exercise.name,
      muscle: entry.exercise.muscle,
      color: MUSCLE_COLORS[entry.exercise.muscle] ?? MUTED,
      sets: sets.length,
      groups: buildGroups(sets),
      volume: sets.reduce((sum, s) => sum + s.reps * s.weight, 0),
    }
  })
}

/**
 * Riepilogo dei carichi di un esercizio, es. «3 da 10 kg · 2 da 40 kg».
 * Per gli esercizi a corpo libero mostra le ripetizioni: «3 × 12».
 */
function setsDetail(exercise: CardExercise): string {
  if (exercise.groups.length === 0) return 'nessuna serie'
  return exercise.groups
    .map((group) => {
      if (group.weight > 0) return `${group.count} da ${formatWeight(group.weight)} kg`
      const uniform = group.reps.every((reps) => reps === group.reps[0])
      const reps = uniform ? `${group.reps[0]}` : group.reps.join('/')
      return `${group.count} × ${reps} rip`
    })
    .join(' · ')
}

function prepare(input: ShareCardInput): CardData {
  const { workout, userName } = input
  const exercises = buildExercises(workout)
  const muscles: Muscle[] = []
  for (const entry of workout.entries) {
    if (!muscles.includes(entry.exercise.muscle)) muscles.push(entry.exercise.muscle)
  }
  return {
    workout,
    userName: userName.trim() || 'Atleta',
    title: workout.name.trim() || muscles.slice(0, 3).join(' · ') || 'Allenamento',
    dateLabel: startCase(formatDateLong(workout.date)).toUpperCase(),
    exercises,
    totalSets: exercises.reduce((sum, e) => sum + e.sets, 0),
    volume: exercises.reduce((sum, e) => sum + e.volume, 0),
  }
}

// ---------- sfondi ----------

function drawPhotoBackground(ctx: CanvasRenderingContext2D, photo: CanvasImageSource): void {
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)
  drawCover(ctx, photo)

  // scurisce l'alto (testo leggibile) e molto il basso (dati e footer)
  const top = ctx.createLinearGradient(0, 0, 0, H * 0.45)
  top.addColorStop(0, 'rgba(6, 8, 5, 0.72)')
  top.addColorStop(1, 'rgba(6, 8, 5, 0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, H * 0.45)

  const bottom = ctx.createLinearGradient(0, H * 0.28, 0, H)
  bottom.addColorStop(0, 'rgba(6, 8, 5, 0)')
  bottom.addColorStop(0.42, 'rgba(6, 8, 5, 0.56)')
  bottom.addColorStop(1, 'rgba(6, 8, 5, 0.88)')
  ctx.fillStyle = bottom
  ctx.fillRect(0, H * 0.28, W, H * 0.72)
}

function drawPlainBackground(ctx: CanvasRenderingContext2D): void {
  const base = ctx.createLinearGradient(0, 0, W * 0.4, H)
  base.addColorStop(0, '#11160E')
  base.addColorStop(0.55, INK)
  base.addColorStop(1, '#0C100A')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, W, H)

  const glow = ctx.createRadialGradient(W * 0.82, -80, 0, W * 0.82, -80, 760)
  glow.addColorStop(0, 'rgba(200, 255, 61, 0.16)')
  glow.addColorStop(1, 'rgba(200, 255, 61, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const mint = ctx.createRadialGradient(W * 0.1, H * 0.72, 0, W * 0.1, H * 0.72, 620)
  mint.addColorStop(0, 'rgba(124, 255, 178, 0.07)')
  mint.addColorStop(1, 'rgba(124, 255, 178, 0)')
  ctx.fillStyle = mint
  ctx.fillRect(0, 0, W, H)
}

// ---------- disegno del contenuto ----------

function drawHeader(ctx: CanvasRenderingContext2D, data: CardData): number {
  let y = 132

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = TEXT
  ctx.font = font(700, 58)
  ctx.fillText(truncate(ctx, data.userName, CONTENT), MARGIN, y + 58)

  y += 104
  ctx.fillStyle = MUTED
  ctx.font = font(600, 32)
  spacedText(ctx, truncate(ctx, data.dateLabel, CONTENT), MARGIN, y, 3)

  return y + 74
}

function drawTitle(ctx: CanvasRenderingContext2D, data: CardData, y: number): number {
  const fitted = fitTitle(ctx, data.title, 2, [96, 84, 72, 60])
  ctx.fillStyle = TEXT
  ctx.font = font(800, fitted.size)
  ctx.textAlign = 'left'
  const lineHeight = Math.round(fitted.size * 1.06)
  let baseline = y + fitted.size
  for (const line of fitted.lines) {
    ctx.fillText(line, MARGIN, baseline)
    baseline += lineHeight
  }
  const lastBaseline = baseline - lineHeight
  // spazio sotto l'ultima riga: i numeri non devono toccare il titolo
  return lastBaseline + Math.round(fitted.size * 0.34) + 46
}

function drawMeta(ctx: CanvasRenderingContext2D, data: CardData, y: number): number {
  ctx.fillStyle = LIME
  ctx.font = font(700, 36)
  ctx.textAlign = 'left'

  const pieces: Array<{ text: string; color: string }> = [
    { text: `${data.totalSets} serie`, color: LIME },
    {
      text: `${data.exercises.length} ${data.exercises.length === 1 ? 'esercizio' : 'esercizi'}`,
      color: MUTED,
    },
  ]
  if (data.volume > 0) pieces.push({ text: formatKg(data.volume), color: MUTED })

  let cursor = MARGIN
  pieces.forEach((piece, index) => {
    if (index > 0) {
      ctx.fillStyle = FAINT
      ctx.font = font(600, 36)
      ctx.fillText('·', cursor, y)
      cursor += ctx.measureText('·').width + 22
    }
    ctx.fillStyle = piece.color
    ctx.font = font(700, 36)
    ctx.fillText(piece.text, cursor, y)
    cursor += ctx.measureText(piece.text).width + 22
  })

  return y + 46
}

function exerciseRowHeight(ctx: CanvasRenderingContext2D, exercise: CardExercise): number {
  const detail = setsDetail(exercise)
  ctx.font = font(600, 32)
  const detailLines = wrapWords(ctx, detail, CONTENT - 190).slice(0, 2)
  return 96 + detailLines.length * 44
}

function drawExerciseRow(
  ctx: CanvasRenderingContext2D,
  exercise: CardExercise,
  y: number,
  first: boolean,
): number {
  if (!first) {
    ctx.fillStyle = ROW_RULE
    ctx.fillRect(MARGIN, y, CONTENT, 2)
  }

  ctx.textAlign = 'left'
  ctx.fillStyle = exercise.color
  ctx.beginPath()
  ctx.arc(MARGIN + 9, y + 42, 9, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = TEXT
  ctx.font = font(700, 42)
  ctx.fillText(truncate(ctx, exercise.name, CONTENT - 190), MARGIN + 36, y + 56)

  ctx.textAlign = 'right'
  ctx.fillStyle = MUTED
  ctx.font = font(600, 30)
  ctx.fillText(`${exercise.sets} serie`, W - MARGIN, y + 56)
  ctx.textAlign = 'left'

  const detailLines = wrapWords(ctx, setsDetail(exercise), CONTENT - 190).slice(0, 2)
  let cursor = y + 104
  ctx.font = font(600, 33)
  for (const line of detailLines) {
    ctx.fillStyle = MUTED
    ctx.fillText(line, MARGIN + 36, cursor)
    cursor += 44
  }

  return y + 96 + detailLines.length * 44
}

function drawExercises(
  ctx: CanvasRenderingContext2D,
  data: CardData,
  y: number,
  bottom: number,
): void {
  if (data.exercises.length === 0) {
    ctx.fillStyle = MUTED
    ctx.font = font(600, 34)
    ctx.fillText('Nessun esercizio registrato', MARGIN, y + 60)
    return
  }

  // Preventivo: lascia spazio alla riga «altri N esercizi» se serve
  ctx.font = font(600, 32)
  let total = 0
  for (const exercise of data.exercises) total += exerciseRowHeight(ctx, exercise)

  const fits = total <= bottom - y
  const overflowLine = !fits ? 74 : 0
  const available = bottom - y - overflowLine

  let cursor = y
  let shown = 0
  for (const exercise of data.exercises) {
    const height = exerciseRowHeight(ctx, exercise)
    if (cursor + height > y + available) break
    cursor = drawExerciseRow(ctx, exercise, cursor, shown === 0)
    shown += 1
  }

  if (shown < data.exercises.length) {
    ctx.fillStyle = FAINT
    ctx.font = font(600, 32)
    ctx.textAlign = 'left'
    ctx.fillText(`+ altri ${data.exercises.length - shown} esercizi`, MARGIN + 36, cursor + 54)
  }
}

function drawFooter(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = RULE
  ctx.fillRect(MARGIN, FOOTER_RULE_Y, CONTENT, 2)

  drawMark(ctx, MARGIN, FOOTER_NAME_BASELINE - 40, 44)
  ctx.textAlign = 'left'
  ctx.fillStyle = TEXT
  ctx.font = font(700, 38)
  ctx.fillText(APP_NAME, MARGIN + 64, FOOTER_NAME_BASELINE)

  ctx.fillStyle = FAINT
  ctx.font = font(600, 25)
  spacedText(ctx, FOOTER_TEXT, MARGIN, FOOTER_TEXT_BASELINE, 2.4)
}

// ---------- render ----------

export function renderWorkoutCard(input: ShareCardInput): HTMLCanvasElement {
  const style = input.style ?? 'dati'
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Immagine non disponibile su questo dispositivo')

  const data = prepare(input)

  if (style === 'foto' && input.photo) drawPhotoBackground(ctx, input.photo)
  else drawPlainBackground(ctx)

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  let y = drawHeader(ctx, data)
  y = drawTitle(ctx, data, y)
  y = drawMeta(ctx, data, y)

  y += 26
  ctx.fillStyle = RULE
  ctx.fillRect(MARGIN, y, CONTENT, 2)
  y += 44

  drawExercises(ctx, data, y, FOOTER_RULE_Y - 40)
  drawFooter(ctx)

  return canvas
}

// ---------- esportazione / condivisione ----------

const STYLE_SLUG: Record<ShareCardStyle, string> = {
  foto: 'con-foto',
  dati: 'solo-dati',
}

export function cardFileName(workout: WorkoutDetail, style: ShareCardStyle = 'dati'): string {
  const slug = (workout.name.trim() || 'allenamento')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `palestralogger-${workout.date}-${slug || 'allenamento'}-${STYLE_SLUG[style]}.png`
}

export function cardShareText(workout: WorkoutDetail): string {
  const title = workout.name.trim() || 'Allenamento'
  return `${title} · ${formatDateLong(workout.date)} · ${formatKg(workout.volume)}`
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Impossibile creare l’immagine'))
    }, 'image/png')
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled'

export async function shareImage(
  blob: Blob,
  filename: string,
  title: string,
  text: string,
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: 'image/png' })
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
  }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled'
      // se la condivisione nativa fallisce, si scarica l'immagine
    }
  }
  downloadBlob(blob, filename)
  return 'downloaded'
}
