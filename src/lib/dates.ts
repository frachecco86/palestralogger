const pad = (n: number) => String(n).padStart(2, '0')

/** Data locale in formato YYYY-MM-DD (niente sorprese di fuso orario). */
export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayISO(): string {
  return toISO(new Date())
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  return toISO(d)
}

/** Lunedì della settimana che contiene `iso`. */
export function startOfWeek(iso: string): string {
  const d = parseISO(iso)
  const dow = (d.getDay() + 6) % 7
  return addDays(iso, -dow)
}

export function startOfMonth(iso: string): string {
  const d = parseISO(iso)
  return toISO(new Date(d.getFullYear(), d.getMonth(), 1))
}

export function endOfMonth(iso: string): string {
  const d = parseISO(iso)
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000)
}

/** Griglia calendario: settimane da lunedì, 6 righe. */
export function monthGrid(year: number, month: number): string[] {
  const first = toISO(new Date(year, month, 1))
  const start = startOfWeek(first)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
export const WEEKDAYS_MIN = ['L', 'M', 'M', 'G', 'V', 'S', 'D']

export const MONTHS = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
]

export function formatDate(iso: string): string {
  const d = parseISO(iso)
  return `${WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}`
}

export function formatDateLong(iso: string): string {
  const d = parseISO(iso)
  return `${WEEKDAYS_SHORT[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()].toLowerCase()} ${d.getFullYear()}`
}

export function relativeDay(iso: string): string {
  const diff = daysBetween(iso, todayISO())
  if (diff === 0) return 'Oggi'
  if (diff === 1) return 'Ieri'
  if (diff === 2) return '2 giorni fa'
  if (diff > 2 && diff < 7) return `${diff} giorni fa`
  if (diff === -1) return 'Domani'
  return formatDate(iso)
}

/** Etichetta settimana: "6 ott" (lunedì). */
export function weekLabel(iso: string): string {
  const d = parseISO(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3).toLowerCase()}`
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}
