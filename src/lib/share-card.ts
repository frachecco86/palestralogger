import type { Muscle, WorkoutDetail } from './types'
import { MUSCLE_COLORS } from './types'
import { MONTHS, formatDateLong, parseISO } from './dates'
import { epley, formatKg, formatWeight } from './format'

/**
 * Immagine condivisibile di un allenamento.
 * Formato verticale 9:16 (1080 × 1920): storie, WhatsApp, chat.
 * Tre stili: completo, essenziale, social (sticker).
 */

export type ShareCardStyle = 'completo' | 'essenziale' | 'social'

export const SHARE_CARD_STYLES: ReadonlyArray<{
  id: ShareCardStyle
  label: string
  hint: string
}> = [
  { id: 'completo', label: 'Completo', hint: 'Tutti gli esercizi, le serie e le note' },
  { id: 'essenziale', label: 'Essenziale', hint: 'Solo titolo e numeri, tanto respiro' },
  { id: 'social', label: 'Sticker', hint: 'Sticker colorati, top set e gruppi muscolari' },
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
const TEXT = '#F2F5EF'
const MUTED = '#99A394'
const FAINT = '#6B7566'
const LIME = '#C8FF3D'
const LIME_DIM = '#9ECB2C'
const MINT = '#7CFFB2'
const RULE = 'rgba(51, 64, 42, 0.85)'
const ROW_RULE = 'rgba(51, 64, 42, 0.6)'
const CARD_FILL = '#151B12'
const CARD_LINE = '#33402A'

const FOOTER_RULE_Y = H - 168
const FOOTER_BASELINE = H - 104

const font = (weight: number, size: number) => `${weight} ${size}px ${FONT_STACK}`
const italicFont = (size: number) => `italic 400 ${size}px ${FONT_STACK}`

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
    if (wrapped.length <= maxLines && wrapped.every((line) => ctx.measureText(line).width <= CONTENT)) {
      return { size, lines: wrapped }
    }
  }
  const size = sizes[sizes.length - 1]
  ctx.font = font(800, size)
  const all = wrapWords(ctx, text, CONTENT)
  const lines = all.slice(0, maxLines).map((line) => truncate(ctx, line, CONTENT))
  if (all.length > maxLines) {
    const last = lines[maxLines - 1].replace(/…$/, '')
    lines[maxLines - 1] = truncate(ctx, `${last}…`, CONTENT)
  }
  return { size, lines }
}

function withRotation(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  degrees: number,
  draw: () => void,
): void {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate((degrees * Math.PI) / 180)
  draw()
  ctx.restore()
}

function drawDumbbell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 24, size / 24)
  ctx.beginPath()
  ctx.moveTo(6.5, 8)
  ctx.lineTo(6.5, 16)
  ctx.moveTo(3.5, 10)
  ctx.lineTo(3.5, 14)
  ctx.moveTo(17.5, 8)
  ctx.lineTo(17.5, 16)
  ctx.moveTo(20.5, 10)
  ctx.lineTo(20.5, 14)
  ctx.moveTo(6.5, 12)
  ctx.lineTo(17.5, 12)
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.strokeStyle = INK
  ctx.stroke()
  ctx.restore()
}

function drawMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.fillStyle = LIME
  roundRect(ctx, x, y, size, size, size * 0.28)
  ctx.fill()
  drawDumbbell(ctx, x + size * 0.07, y + size * 0.07, size * 0.86)
}

function drawBrand(ctx: CanvasRenderingContext2D, markSize: number, top: number): void {
  drawMark(ctx, MARGIN, top, markSize)
  ctx.font = font(700, Math.round(markSize * 0.485))
  ctx.fillStyle = TEXT
  spacedText(
    ctx,
    'PALESTRALOGGER',
    MARGIN + markSize + Math.round(markSize * 0.4),
    top + Math.round(markSize * 0.7),
    Math.max(3, Math.round(markSize * 0.08)),
  )
}

function shortDateUpper(iso: string): string {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3).toUpperCase()}`
}

// ---------- dati per la card ----------

interface CardExercise {
  name: string
  muscle: Muscle
  color: string
  sets: number
  reps: number[]
  topWeight: number
  volume: number
}

interface CardData {
  workout: WorkoutDetail
  userName: string
  title: string
  exercises: CardExercise[]
  muscles: Muscle[]
  totalSets: number
  totalReps: number
  volume: number
  note: string
}

interface TopSet {
  exercise: string
  weight: number
  reps: number
  e1rm: number
}

export interface ShareCardInput {
  workout: WorkoutDetail
  userName: string
  style?: ShareCardStyle
}

function buildExercises(workout: WorkoutDetail): CardExercise[] {
  return workout.entries.map((entry) => {
    const sets = entry.sets
    return {
      name: entry.exercise.name,
      muscle: entry.exercise.muscle,
      color: MUSCLE_COLORS[entry.exercise.muscle] ?? MUTED,
      sets: sets.length,
      reps: sets.map((s) => s.reps),
      topWeight: sets.reduce((max, s) => Math.max(max, s.weight), 0),
      volume: sets.reduce((sum, s) => sum + s.reps * s.weight, 0),
    }
  })
}

function setsSummary(exercise: CardExercise): string {
  const reps = exercise.reps
  const uniform = reps.every((r) => r === reps[0])
  const repsLabel = uniform ? `${exercise.sets}×${reps[0] ?? 0}` : `${exercise.sets}×${reps.join('/')}`
  return exercise.topWeight > 0 ? `${repsLabel} · ${formatWeight(exercise.topWeight)} kg` : repsLabel
}

function findTopSet(workout: WorkoutDetail): TopSet | null {
  let best: TopSet | null = null
  let mostReps: TopSet | null = null
  for (const entry of workout.entries) {
    for (const set of entry.sets) {
      const candidate: TopSet = {
        exercise: entry.exercise.name,
        weight: set.weight,
        reps: set.reps,
        e1rm: set.weight > 0 ? epley(set.weight, set.reps) : 0,
      }
      if (!best || candidate.e1rm > best.e1rm) best = candidate
      if (!mostReps || set.reps > mostReps.reps) mostReps = candidate
    }
  }
  return best && best.e1rm > 0 ? best : mostReps
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
    userName,
    title: workout.name.trim() || muscles.slice(0, 3).join(' · ') || 'Allenamento',
    exercises,
    muscles,
    totalSets: exercises.reduce((sum, e) => sum + e.sets, 0),
    totalReps: exercises.reduce((sum, e) => sum + e.reps.reduce((a, b) => a + b, 0), 0),
    volume: exercises.reduce((sum, e) => sum + e.volume, 0),
    note: workout.notes.trim(),
  }
}

// ---------- sfondi ----------

const SOCIAL_DECOR: Array<{
  x: number
  y: number
  r: number
  color: string
  ring: boolean
}> = [
  { x: W - 34, y: 430, r: 7, color: MINT, ring: true },
  { x: W - 44, y: 1600, r: 5, color: LIME, ring: true },
  { x: 40, y: 1690, r: 4, color: LIME, ring: false },
]

function drawPlus(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: string,
): void {
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x - size, y)
  ctx.lineTo(x + size, y)
  ctx.moveTo(x, y - size)
  ctx.lineTo(x, y + size)
  ctx.stroke()
}

function drawBackground(ctx: CanvasRenderingContext2D, style: ShareCardStyle): void {
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, H)

  if (style === 'essenziale') {
    const glow = ctx.createRadialGradient(W / 2, -140, 0, W / 2, -140, H * 0.85)
    glow.addColorStop(0, 'rgba(200, 255, 61, 0.17)')
    glow.addColorStop(0.5, 'rgba(200, 255, 61, 0.04)')
    glow.addColorStop(1, 'rgba(200, 255, 61, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    const mint = ctx.createRadialGradient(W, H, 0, W, H, H * 0.62)
    mint.addColorStop(0, 'rgba(124, 255, 178, 0.09)')
    mint.addColorStop(1, 'rgba(124, 255, 178, 0)')
    ctx.fillStyle = mint
    ctx.fillRect(0, 0, W, H)
    return
  }

  if (style === 'social') {
    const glow = ctx.createRadialGradient(W * 0.95, -40, 0, W * 0.95, -40, H * 0.7)
    glow.addColorStop(0, 'rgba(200, 255, 61, 0.2)')
    glow.addColorStop(0.45, 'rgba(200, 255, 61, 0.06)')
    glow.addColorStop(1, 'rgba(200, 255, 61, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)

    const mint = ctx.createRadialGradient(-80, H + 40, 0, -80, H + 40, H * 0.6)
    mint.addColorStop(0, 'rgba(124, 255, 178, 0.13)')
    mint.addColorStop(1, 'rgba(124, 255, 178, 0)')
    ctx.fillStyle = mint
    ctx.fillRect(0, 0, W, H)

    for (const item of SOCIAL_DECOR) {
      if (item.ring) {
        ctx.strokeStyle = item.color
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.arc(item.x, item.y, item.r + 6, 0, Math.PI * 2)
        ctx.stroke()
      } else {
        ctx.fillStyle = item.color
        ctx.beginPath()
        ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    drawPlus(ctx, W - 42, 700, 11, 'rgba(200, 255, 61, 0.5)')
    return
  }

  const glow = ctx.createRadialGradient(W * 0.95, -40, 0, W * 0.95, -40, H * 0.72)
  glow.addColorStop(0, 'rgba(200, 255, 61, 0.22)')
  glow.addColorStop(0.45, 'rgba(200, 255, 61, 0.07)')
  glow.addColorStop(1, 'rgba(200, 255, 61, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)

  const mint = ctx.createRadialGradient(-60, H + 60, 0, -60, H + 60, H * 0.6)
  mint.addColorStop(0, 'rgba(124, 255, 178, 0.12)')
  mint.addColorStop(1, 'rgba(124, 255, 178, 0)')
  ctx.fillStyle = mint
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = 'rgba(200, 255, 61, 0.10)'
  ctx.lineWidth = 2
  for (const radius of [520, 380]) {
    ctx.beginPath()
    ctx.arc(W + 70, -50, radius, 0, Math.PI * 2)
    ctx.stroke()
  }
}

// ---------- parti comuni ----------

interface MuscleSegment {
  muscle: Muscle
  sets: number
}

function muscleSegments(data: CardData): MuscleSegment[] {
  return data.muscles.map((muscle) => ({
    muscle,
    sets: data.workout.entries
      .filter((entry) => entry.exercise.muscle === muscle)
      .reduce((sum, entry) => sum + entry.sets.length, 0),
  }))
}

function drawMuscleBar(
  ctx: CanvasRenderingContext2D,
  data: CardData,
  x: number,
  y: number,
  width: number,
  height: number,
  gap = 5,
): void {
  const segments = muscleSegments(data)
  if (segments.length === 0) return
  const usable = width - gap * (segments.length - 1)
  let cursor = x
  for (const segment of segments) {
    const segmentWidth = Math.max(8, (segment.sets / Math.max(1, data.totalSets)) * usable)
    ctx.fillStyle = MUSCLE_COLORS[segment.muscle] ?? MUTED
    roundRect(ctx, cursor, y, Math.max(8, segmentWidth - gap), height, height / 2)
    ctx.fill()
    cursor += segmentWidth
  }
}

function drawFooter(ctx: CanvasRenderingContext2D, data: CardData): void {
  ctx.strokeStyle = RULE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(MARGIN, FOOTER_RULE_Y)
  ctx.lineTo(W - MARGIN, FOOTER_RULE_Y)
  ctx.stroke()

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = font(700, 30)
  ctx.fillStyle = TEXT
  ctx.fillText(
    truncate(ctx, data.userName.trim() || 'Il tuo diario', CONTENT - 430),
    MARGIN,
    FOOTER_BASELINE,
  )

  ctx.font = font(500, 24)
  ctx.fillStyle = FAINT
  ctx.textAlign = 'right'
  ctx.fillText('palestralogger.netlify.app', W - MARGIN, FOOTER_BASELINE)
  ctx.textAlign = 'left'

  ctx.fillStyle = LIME
  ctx.beginPath()
  ctx.arc(MARGIN, FOOTER_BASELINE + 34, 4, 0, Math.PI * 2)
  ctx.fill()
  ctx.font = font(500, 20)
  ctx.fillStyle = FAINT
  spacedText(ctx, 'DIARIO ALLENAMENTI · OFFLINE', MARGIN + 22, FOOTER_BASELINE + 41, 2.6)
}

function drawExerciseRows(
  ctx: CanvasRenderingContext2D,
  data: CardData,
  listTop: number,
  listBottom: number,
  options: {
    rowHeight: number
    nameSize: number
    summarySize: number
    dotRadius: number
    align?: 'center' | 'top'
  },
): number {
  const { rowHeight, nameSize, summarySize, dotRadius } = options
  const available = Math.max(rowHeight, listBottom - listTop)
  const maxRows = Math.max(1, Math.floor(available / rowHeight))
  let shown = data.exercises
  let hidden = 0
  if (maxRows >= 2 && data.exercises.length > maxRows) {
    shown = data.exercises.slice(0, maxRows - 1)
    hidden = data.exercises.length - shown.length
  } else if (maxRows === 1) {
    shown = data.exercises.slice(0, 1)
  }

  const rows = shown.length + (hidden > 0 ? 1 : 0)
  const listStart =
    options.align === 'top'
      ? listTop
      : listTop + Math.max(0, Math.round((available - rows * rowHeight) / 2))

  shown.forEach((exercise, index) => {
    const rowTop = listStart + index * rowHeight
    const baseline = rowTop + rowHeight / 2 + Math.round(nameSize * 0.32)
    const summary = setsSummary(exercise)

    ctx.font = font(600, summarySize)
    const summaryWidth = ctx.measureText(summary).width
    ctx.fillStyle = MUTED
    ctx.textAlign = 'right'
    ctx.fillText(summary, W - MARGIN, baseline)
    ctx.textAlign = 'left'

    ctx.font = font(700, nameSize)
    ctx.fillStyle = TEXT
    ctx.fillText(
      truncate(ctx, exercise.name, CONTENT - summaryWidth - dotRadius * 2 - 66),
      MARGIN + dotRadius * 2 + 24,
      baseline,
    )

    ctx.fillStyle = exercise.color
    ctx.beginPath()
    ctx.arc(MARGIN + dotRadius, rowTop + rowHeight / 2, dotRadius, 0, Math.PI * 2)
    ctx.fill()

    if (index < shown.length - 1 || hidden > 0) {
      ctx.strokeStyle = ROW_RULE
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(MARGIN + dotRadius * 2 + 24, rowTop + rowHeight)
      ctx.lineTo(W - MARGIN, rowTop + rowHeight)
      ctx.stroke()
    }
  })

  if (hidden > 0) {
    const rowTop = listStart + shown.length * rowHeight
    ctx.font = font(600, summarySize)
    ctx.fillStyle = LIME
    ctx.fillText(
      `+ ${hidden} ${hidden === 1 ? 'altro esercizio' : 'altri esercizi'}`,
      MARGIN + dotRadius * 2 + 24,
      rowTop + rowHeight / 2 + Math.round(summarySize * 0.34),
    )
  }

  return listStart + rows * rowHeight
}

// ---------- stile "completo" ----------

function drawCompleto(ctx: CanvasRenderingContext2D, data: CardData): void {
  drawBrand(ctx, 56, 92)

  ctx.font = font(600, 29)
  ctx.fillStyle = MUTED
  spacedText(ctx, formatDateLong(data.workout.date).toUpperCase(), MARGIN, 244, 2.4)

  const title = fitTitle(ctx, data.title, 2, [104, 96, 88, 80, 74, 68, 62, 56])
  const titleBaseline = 372
  const lineHeight = Math.round(title.size * 1.06)
  ctx.font = font(800, title.size)
  ctx.fillStyle = TEXT
  title.lines.forEach((line, index) => {
    ctx.fillText(line, MARGIN, titleBaseline + index * lineHeight)
  })

  let y = titleBaseline + (title.lines.length - 1) * lineHeight

  const hasVolume = data.volume > 0
  const bigValue = hasVolume ? formatKg(data.volume) : String(data.totalReps)
  const [amount, unit] = bigValue.split(' ')

  y += 126
  ctx.font = font(600, 26)
  ctx.fillStyle = FAINT
  spacedText(ctx, hasVolume ? 'VOLUME TOTALE' : 'RIPETIZIONI TOTALI', MARGIN, y, 4.2)

  y += 172
  ctx.font = font(800, 172)
  ctx.fillStyle = LIME
  ctx.fillText(amount, MARGIN - 5, y)
  const amountWidth = ctx.measureText(amount).width
  if (unit) {
    ctx.font = font(700, 52)
    ctx.fillStyle = LIME_DIM
    ctx.fillText(unit, MARGIN - 5 + amountWidth + 18, y)
  }

  y += 60
  ctx.strokeStyle = RULE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(MARGIN, y)
  ctx.lineTo(W - MARGIN, y)
  ctx.stroke()

  y += 76
  const stats = [
    {
      value: String(data.exercises.length),
      label: data.exercises.length === 1 ? 'ESERCIZIO' : 'ESERCIZI',
    },
    { value: String(data.totalSets), label: 'SERIE' },
    { value: String(data.totalReps), label: 'RIPETIZIONI' },
  ]
  const columnWidth = CONTENT / 3
  stats.forEach((stat, index) => {
    const x = MARGIN + columnWidth * index
    ctx.font = font(700, 54)
    ctx.fillStyle = TEXT
    ctx.fillText(stat.value, x, y)
    ctx.font = font(600, 21)
    ctx.fillStyle = FAINT
    spacedText(ctx, stat.label, x, y + 42, 3)
  })

  y += 108
  if (data.muscles.length > 0) {
    drawMuscleBar(ctx, data, MARGIN, y, CONTENT, 14)

    const segments = muscleSegments(data)
    let legendX = MARGIN
    let legendY = y + 62
    ctx.font = font(600, 24)
    for (const segment of segments) {
      const label = segment.muscle
      const itemWidth = 24 + ctx.measureText(label).width
      if (legendX + itemWidth > W - MARGIN && legendX > MARGIN) {
        legendX = MARGIN
        legendY += 38
      }
      ctx.fillStyle = MUSCLE_COLORS[segment.muscle] ?? MUTED
      ctx.beginPath()
      ctx.arc(legendX + 7, legendY - 8, 7, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = MUTED
      ctx.fillText(label, legendX + 22, legendY)
      legendX += itemWidth + 32
    }
    y = legendY + 16
  }

  let noteLines: string[] = []
  if (data.note) {
    ctx.font = italicFont(27)
    const wrapped = wrapWords(ctx, data.note, CONTENT)
    noteLines = wrapped.slice(0, 2)
    if (noteLines.length > 0) {
      noteLines[0] = `“${noteLines[0]}`
      const last = noteLines.length - 1
      const suffix = wrapped.length > 2 ? '…' : ''
      noteLines[last] = `${truncate(ctx, `${noteLines[last]}${suffix}`, CONTENT - 24)}”`
    }
  }

  const notesHeight = noteLines.length > 0 ? noteLines.length * 36 + 28 : 0

  const listTop = y + 26
  const listBottom = FOOTER_RULE_Y - 36 - notesHeight
  const listSpace = Math.max(76, listBottom - listTop)
  const rowHeight = Math.max(
    76,
    Math.min(96, Math.floor(listSpace / Math.max(1, data.exercises.length))),
  )
  drawExerciseRows(ctx, data, listTop, listBottom, {
    rowHeight,
    nameSize: rowHeight >= 88 ? 36 : 33,
    summarySize: rowHeight >= 88 ? 30 : 28,
    dotRadius: rowHeight >= 88 ? 9 : 8,
  })

  if (noteLines.length > 0) {
    ctx.font = italicFont(27)
    ctx.fillStyle = FAINT
    const firstBaseline = FOOTER_RULE_Y - 34 - (noteLines.length - 1) * 36
    noteLines.forEach((line, index) => {
      ctx.fillText(line, MARGIN, firstBaseline + index * 36)
    })
  }

  drawFooter(ctx, data)
}

// ---------- stile "essenziale" ----------

function drawEssenziale(ctx: CanvasRenderingContext2D, data: CardData): void {
  drawBrand(ctx, 44, 96)

  const hasVolume = data.volume > 0
  const bigValue = hasVolume ? formatKg(data.volume) : String(data.totalReps)
  const [amount, unit] = bigValue.split(' ')

  const title = fitTitle(ctx, data.title, 3, [150, 138, 126, 114, 100, 88])
  const lineHeight = Math.round(title.size * 1.04)
  const titleHeight = title.lines.length * lineHeight

  let bigSize = 250
  let amountWidth = 0
  let unitWidth = 0
  let unitSize = Math.round(bigSize * 0.28)
  for (const candidate of [250, 230, 210, 190, 165, 140]) {
    bigSize = candidate
    unitSize = Math.round(candidate * 0.28)
    ctx.font = font(800, candidate)
    const aw = ctx.measureText(amount).width
    ctx.font = font(700, unitSize)
    const uw = unit ? ctx.measureText(unit).width : 0
    amountWidth = aw
    unitWidth = uw
    if (aw + (unit ? 22 + uw : 0) <= CONTENT) break
  }
  const bigHeight = Math.round(bigSize * 0.86)

  const dateHeight = 34
  const ruleHeight = 6
  const labelHeight = 32
  const statsHeight = 36
  const baseGaps = [56, 46, 56, 18, 46]
  const baseGapTotal = baseGaps.reduce((sum, gap) => sum + gap, 0)
  const contentHeight =
    dateHeight + titleHeight + ruleHeight + labelHeight + bigHeight + statsHeight
  const areaTop = 260
  const areaBottom = FOOTER_RULE_Y - 90
  const available = areaBottom - areaTop
  const spread = Math.max(0, Math.min(available - contentHeight - baseGapTotal, 360))
  const extraGap = spread / baseGaps.length
  const gap = (index: number) => baseGaps[index] + extraGap
  const blockHeight = contentHeight + baseGapTotal + spread
  let y = areaTop + Math.max(0, Math.round((available - blockHeight) / 2))

  const centerX = W / 2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'

  ctx.font = font(600, 27)
  ctx.fillStyle = MUTED
  spacedText(ctx, formatDateLong(data.workout.date).toUpperCase(), centerX, y, 4, 'center')
  y += dateHeight + gap(0)

  ctx.font = font(800, title.size)
  ctx.fillStyle = TEXT
  title.lines.forEach((line, index) => {
    ctx.fillText(line, centerX, y + index * lineHeight)
  })
  y += titleHeight + gap(1)

  ctx.fillStyle = LIME
  roundRect(ctx, centerX - 70, y, 140, ruleHeight, 3)
  ctx.fill()
  y += ruleHeight + gap(2)

  ctx.font = font(600, 26)
  ctx.fillStyle = FAINT
  spacedText(ctx, hasVolume ? 'VOLUME TOTALE' : 'RIPETIZIONI TOTALI', centerX, y, 5, 'center')
  y += labelHeight + gap(3)

  const baseline = y + bigHeight
  const totalWidth = amountWidth + (unit ? 22 + unitWidth : 0)
  const startX = centerX - totalWidth / 2
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font = font(800, bigSize)
  ctx.fillStyle = LIME
  ctx.fillText(amount, startX, baseline)
  if (unit) {
    ctx.font = font(700, unitSize)
    ctx.fillStyle = LIME_DIM
    ctx.fillText(unit, startX + amountWidth + 22, baseline)
  }
  y += bigHeight + gap(4)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.font = font(600, 29)
  ctx.fillStyle = MUTED
  const exerciseLabel =
    data.exercises.length === 1 ? '1 esercizio' : `${data.exercises.length} esercizi`
  spacedText(
    ctx,
    `${exerciseLabel} · ${data.totalSets} serie · ${data.totalReps} rip`.toUpperCase(),
    centerX,
    y,
    3,
    'center',
  )

  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  if (data.muscles.length > 0) {
    drawMuscleBar(ctx, data, MARGIN, FOOTER_RULE_Y - 56, CONTENT, 8, 4)
  }
  drawFooter(ctx, data)
}

// ---------- stile "social" ----------

function drawSocial(ctx: CanvasRenderingContext2D, data: CardData): void {
  drawBrand(ctx, 52, 92)

  // sticker con la data
  const dateLabel = shortDateUpper(data.workout.date)
  let dateFontSize = 34
  ctx.font = font(800, dateFontSize)
  let dateWidth = ctx.measureText(dateLabel).width + 66
  if (dateWidth > 270) {
    dateFontSize = 28
    ctx.font = font(800, dateFontSize)
    dateWidth = ctx.measureText(dateLabel).width + 56
  }
  const dateHeight = 76
  withRotation(ctx, W - MARGIN - dateWidth / 2, 126, -7, () => {
    ctx.fillStyle = LIME
    roundRect(ctx, -dateWidth / 2, -dateHeight / 2, dateWidth, dateHeight, 24)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.font = font(800, dateFontSize)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(dateLabel, 0, 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
  })

  // titolo
  const title = fitTitle(ctx, data.title, 3, [102, 94, 86, 78, 72, 66, 60])
  const titleBaseline = 320
  const lineHeight = Math.round(title.size * 1.04)
  ctx.font = font(800, title.size)
  ctx.fillStyle = TEXT
  title.lines.forEach((line, index) => {
    ctx.fillText(line, MARGIN, titleBaseline + index * lineHeight)
  })
  let y = titleBaseline + (title.lines.length - 1) * lineHeight

  // etichetta + sticker volume
  const hasVolume = data.volume > 0
  const bigValue = hasVolume ? formatKg(data.volume) : String(data.totalReps)
  const [amount, unit] = bigValue.split(' ')

  y += 72
  ctx.font = font(600, 24)
  ctx.fillStyle = FAINT
  spacedText(ctx, hasVolume ? 'VOLUME TOTALE' : 'RIPETIZIONI TOTALI', MARGIN, y, 4.4)
  y += 30

  let valueSize = 66
  let amountWidth = 0
  let unitWidth = 0
  let unitSize = 28
  for (const candidate of [96, 88, 80, 72, 66]) {
    const candidateUnit = Math.round(candidate * 0.42)
    ctx.font = font(800, candidate)
    const aw = ctx.measureText(amount).width
    ctx.font = font(700, candidateUnit)
    const uw = unit ? ctx.measureText(unit).width : 0
    valueSize = candidate
    amountWidth = aw
    unitWidth = uw
    unitSize = candidateUnit
    if (aw + (unit ? 20 + uw : 0) + 96 <= CONTENT) break
  }

  const stickerPadding = 48
  const stickerWidth = Math.min(
    CONTENT,
    amountWidth + (unit ? 20 + unitWidth : 0) + stickerPadding * 2,
  )
  const stickerHeight = Math.round(valueSize * 1.62)
  withRotation(ctx, MARGIN + stickerWidth / 2, y + stickerHeight / 2, -2.5, () => {
    ctx.fillStyle = LIME
    roundRect(ctx, -stickerWidth / 2, -stickerHeight / 2, stickerWidth, stickerHeight, 34)
    ctx.fill()

    const contentWidth = amountWidth + (unit ? 20 + unitWidth : 0)
    let x = -contentWidth / 2
    const baseline = Math.round(valueSize * 0.35)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = font(800, valueSize)
    ctx.fillStyle = INK
    ctx.fillText(amount, x, baseline)
    x += amountWidth
    if (unit) {
      ctx.font = font(700, unitSize)
      ctx.fillStyle = 'rgba(10, 12, 9, 0.62)'
      ctx.fillText(unit, x + 20, baseline)
    }
  })
  y += stickerHeight + 52

  // pillole statistiche
  const pills = [
    {
      value: String(data.exercises.length),
      label: data.exercises.length === 1 ? 'esercizio' : 'esercizi',
    },
    { value: String(data.totalSets), label: 'serie' },
    { value: String(data.totalReps), label: 'rip' },
  ]
  const pillHeight = 74
  let pillX = MARGIN
  pills.forEach((pill, index) => {
    ctx.font = font(800, 31)
    const valueWidth = ctx.measureText(pill.value).width
    ctx.font = font(600, 27)
    const labelWidth = ctx.measureText(pill.label).width
    const pillWidth = valueWidth + labelWidth + 78
    withRotation(ctx, pillX + pillWidth / 2, y + pillHeight / 2, index === 1 ? 2.6 : -3.2, () => {
      ctx.fillStyle = CARD_FILL
      roundRect(ctx, -pillWidth / 2, -pillHeight / 2, pillWidth, pillHeight, pillHeight / 2)
      ctx.fill()
      ctx.strokeStyle = CARD_LINE
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = font(800, 31)
      ctx.fillStyle = LIME
      ctx.fillText(pill.value, -pillWidth / 2 + 30, 1)
      ctx.font = font(600, 27)
      ctx.fillStyle = MUTED
      ctx.fillText(pill.label, -pillWidth / 2 + 30 + valueWidth + 12, 2)
    })
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    pillX += pillWidth + 18
  })
  y += pillHeight + 44

  // chips gruppi muscolari
  if (data.muscles.length > 0) {
    const chips = data.muscles.slice(0, 6)
    const chipHeight = 62
    const chipGap = 16
    let chipX = MARGIN
    let chipY = y
    chips.forEach((muscle, index) => {
      ctx.font = font(700, 27)
      const chipWidth = ctx.measureText(muscle).width + 58
      if (chipX + chipWidth > W - MARGIN) {
        chipX = MARGIN
        chipY += chipHeight + chipGap
      }
      withRotation(
        ctx,
        chipX + chipWidth / 2,
        chipY + chipHeight / 2,
        index % 2 === 0 ? -3.5 : 2.8,
        () => {
          ctx.fillStyle = MUSCLE_COLORS[muscle] ?? MUTED
          roundRect(ctx, -chipWidth / 2, -chipHeight / 2, chipWidth, chipHeight, chipHeight / 2)
          ctx.fill()
          ctx.fillStyle = INK
          ctx.font = font(700, 27)
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(muscle, 0, 1)
        },
      )
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      chipX += chipWidth + chipGap
    })
    y = chipY + chipHeight + 40
  }

  const listBottom = FOOTER_RULE_Y - 30
  const top = findTopSet(data.workout)
  if (top && listBottom - y > 330) {
    const cardHeight = 132
    ctx.fillStyle = CARD_FILL
    roundRect(ctx, MARGIN, y, CONTENT, cardHeight, 28)
    ctx.fill()
    ctx.strokeStyle = CARD_LINE
    ctx.lineWidth = 2
    ctx.stroke()

    withRotation(ctx, MARGIN + 80, y + cardHeight / 2, -8, () => {
      ctx.fillStyle = LIME
      roundRect(ctx, -54, -22, 108, 44, 14)
      ctx.fill()
      ctx.fillStyle = INK
      ctx.font = font(800, 25)
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('TOP', 0, 1)
    })
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    const headline =
      top.weight > 0 ? `${formatWeight(top.weight)} kg × ${top.reps}` : `${top.reps} rip`
    const subtitle =
      top.weight > 0
        ? `${top.exercise} · 1RM stimato ${formatWeight(top.e1rm)} kg`
        : `${top.exercise} · corpo libero`

    ctx.font = font(700, 33)
    ctx.fillStyle = TEXT
    ctx.fillText(truncate(ctx, headline, CONTENT - 230), MARGIN + 150, y + 58)
    ctx.font = font(500, 26)
    ctx.fillStyle = MUTED
    ctx.fillText(truncate(ctx, subtitle, CONTENT - 230), MARGIN + 150, y + 96)

    y += cardHeight + 34
  }

  const listEnd = drawExerciseRows(ctx, data, y, listBottom, {
    rowHeight: 96,
    nameSize: 34,
    summarySize: 28,
    dotRadius: 8,
    align: 'top',
  })

  const stickerTop = listEnd + 24
  if (listBottom - stickerTop > 200) {
    drawBottomSticker(ctx, data, stickerTop, listBottom)
  }

  drawFooter(ctx, data)
}

function drawBottomSticker(
  ctx: CanvasRenderingContext2D,
  data: CardData,
  areaTop: number,
  areaBottom: number,
): void {
  const hasNote = data.note.length > 0
  const cardHeight = hasNote ? 168 : 148
  const centerY = areaTop + (areaBottom - areaTop) / 2
  withRotation(ctx, W / 2, centerY, -1.6, () => {
    ctx.fillStyle = CARD_FILL
    roundRect(ctx, -CONTENT / 2, -cardHeight / 2, CONTENT, cardHeight, 30)
    ctx.fill()
    ctx.strokeStyle = CARD_LINE
    ctx.lineWidth = 2
    ctx.stroke()

    const left = -CONTENT / 2 + 44
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'

    if (hasNote) {
      ctx.font = font(700, 22)
      ctx.fillStyle = LIME
      spacedText(ctx, 'NOTE', left, -cardHeight / 2 + 44, 4)
      ctx.font = italicFont(28)
      ctx.fillStyle = TEXT
      const maxWidth = CONTENT - 88
      const wrapped = wrapWords(ctx, data.note, maxWidth)
      const lines = wrapped.slice(0, 2)
      if (wrapped.length > 2) {
        lines[1] = truncate(ctx, `${lines[1]}…`, maxWidth)
      }
      lines.forEach((line, index) => {
        ctx.fillText(line, left, -cardHeight / 2 + 92 + index * 38)
      })
      return
    }

    ctx.font = font(800, 38)
    ctx.fillStyle = LIME
    const label = 'SESSIONE FATTA'
    ctx.fillText(label, left, 12)
    const labelWidth = ctx.measureText(label).width
    ctx.strokeStyle = LIME
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(left + labelWidth + 26, 2)
    ctx.lineTo(left + labelWidth + 40, 16)
    ctx.lineTo(left + labelWidth + 72, -18)
    ctx.stroke()
  })
}

// ---------- render ----------

export function renderWorkoutCard(input: ShareCardInput): HTMLCanvasElement {
  const style = input.style ?? 'completo'
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Immagine non disponibile su questo dispositivo')

  const data = prepare(input)

  drawBackground(ctx, style)
  if (style === 'essenziale') drawEssenziale(ctx, data)
  else if (style === 'social') drawSocial(ctx, data)
  else drawCompleto(ctx, data)

  return canvas
}

// ---------- esportazione / condivisione ----------

const STYLE_SLUG: Record<ShareCardStyle, string> = {
  completo: 'completo',
  essenziale: 'essenziale',
  social: 'sticker',
}

export function cardFileName(workout: WorkoutDetail, style: ShareCardStyle = 'completo'): string {
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
