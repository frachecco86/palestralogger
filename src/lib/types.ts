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

export interface Exercise {
  id: string
  userId: string | null
  name: string
  muscle: Muscle
  equipment: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
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
  sets: Array<{ reps: number; weight: number; rpe?: number | null }>
}

export interface WorkoutDetail extends Workout {
  exercises: number
  sets: number
  volume: number
  muscles: string
  entries: Array<{
    exercise: Exercise
    sets: Array<{ id: string; setIndex: number; reps: number; weight: number; rpe: number | null }>
  }>
}
