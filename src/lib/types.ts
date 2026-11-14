export type Muscle =
  | 'Petto'
  | 'Schiena'
  | 'Gambe'
  | 'Glutei'
  | 'Spalle'
  | 'Braccia'
  | 'Core'
  | 'Cardio'
  | 'Altro'

export const MUSCLES: Muscle[] = [
  'Petto',
  'Schiena',
  'Gambe',
  'Glutei',
  'Spalle',
  'Braccia',
  'Core',
  'Cardio',
  'Altro',
]

export const MUSCLE_COLORS: Record<Muscle, string> = {
  Petto: '#C8FF3D',
  Schiena: '#7CFFB2',
  Gambe: '#5FD4FF',
  Glutei: '#FFB86B',
  Spalle: '#FFE066',
  Braccia: '#FF8FB1',
  Core: '#B79BFF',
  Cardio: '#FF6B5A',
  Altro: '#9AA396',
}

export interface User {
  id: string
  name: string
  pinHash: string
  pinSalt: string
  pinLength: number
  createdAt: string
  updatedAt: string
}

/**
 * Come si misura una serie:
 * - `reps`: ripetizioni con peso (panca, squat…);
 * - `time`: minuti (cardio: tapis roulant, cyclette, vogatore…).
 */
export type ExerciseTracking = 'reps' | 'time'

/** Etichetta breve della misura, es. «rip» / «min». */
export const TRACKING_SHORT: Record<ExerciseTracking, string> = {
  reps: 'rip',
  time: 'min',
}

/** Etichetta estesa, es. «Ripetizioni» / «Minuti». */
export const TRACKING_LABEL: Record<ExerciseTracking, string> = {
  reps: 'Ripetizioni',
  time: 'Minuti',
}

/** Il cardio parte in minuti; si può comunque cambiare a mano. */
export function defaultTracking(muscle: Muscle): ExerciseTracking {
  return muscle === 'Cardio' ? 'time' : 'reps'
}

export interface Exercise {
  id: string
  userId: string | null
  name: string
  muscle: Muscle
  equipment: string
  /** Ripetizioni o minuti (vedi ExerciseTracking). */
  tracking: ExerciseTracking
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Esercizio della libreria comune: non pre-caricato (`is_default` 0) e senza
 * proprietario (`user_id` NULL). Lo vede e lo usa ogni account.
 */
export function isSharedExercise(exercise: {
  userId: string | null
  isDefault: boolean
}): boolean {
  return !exercise.isDefault && exercise.userId === null
}

export interface Workout {
  id: string
  userId: string
  date: string // YYYY-MM-DD
  name: string
  notes: string
  createdAt: string
  updatedAt: string
}

export interface WorkoutSet {
  id: string
  workoutId: string
  exerciseId: string
  setIndex: number
  reps: number
  weight: number
  rpe: number | null
}

export interface WorkoutSummary extends Workout {
  exercises: number
  sets: number
  volume: number
  muscles: string
}

export interface WorkoutEntryInput {
  exerciseId: string
  /** Note libere sull'esercizio (tecnica, sensazioni, presa…). */
  notes?: string
  sets: Array<{ reps: number; weight: number; rpe?: number | null }>
}

export interface WorkoutDetail extends Workout {
  exercises: number
  sets: number
  volume: number
  muscles: string
  entries: Array<{
    exercise: Exercise
    notes: string
    sets: Array<{ id: string; setIndex: number; reps: number; weight: number; rpe: number | null }>
  }>
}
