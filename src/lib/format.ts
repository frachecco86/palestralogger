export function formatKg(kg: number): string {
  if (!Number.isFinite(kg)) return '—'
  if (kg === 0) return '0 kg'
  if (kg >= 10000) return `${(kg / 1000).toFixed(1).replace('.', ',')} t`
  return `${Math.round(kg).toLocaleString('it-IT')} kg`
}

export function formatWeight(kg: number): string {
  if (!Number.isFinite(kg)) return '—'
  return Number.isInteger(kg) ? `${kg}` : `${kg.toFixed(1).replace('.', ',')}`
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('it-IT')
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Stima 1RM (Epley), arrotondata a 0,5 kg. */
export function epley(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  if (reps === 1) return weight
  return Math.round((weight * (1 + reps / 30)) * 2) / 2
}
