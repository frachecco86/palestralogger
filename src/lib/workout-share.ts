import {
  createExercise,
  getWorkout,
  listExercises,
  saveWorkout,
} from '../db/queries'
import { getToken } from './account'
import { todayISO } from './dates'
import type { Exercise, ExerciseTracking, Muscle, WorkoutEntryInput } from './types'

/**
 * Condivisione di un allenamento con un altro utente.
 *
 * Si invia una copia "portabile" (nomi, gruppi, serie): nessun id dei propri
 * esercizi e nessuna foto. Chi la riceve la importa come allenamento nuovo di
 * oggi, con gli esercizi abbinati per nome (o creati al volo), e poi la modifica
 * come preferisce.
 */

const API = '/api/workouts'

export interface PortableSet {
  reps: number
  weight: number
  rpe: number | null
}

export interface PortableEntry {
  name: string
  muscle: Muscle
  equipment: string
  tracking: ExerciseTracking
  notes: string
  sets: PortableSet[]
}

export interface PortableWorkout {
  date: string
  name: string
  notes: string
  entries: PortableEntry[]
}

export interface IncomingWorkout {
  id: string
  fromUid: string
  fromName: string
  createdAt: string
  workout: PortableWorkout
}

export interface ShareUser {
  uid: string
  name: string
}

export class WorkoutShareError extends Error {
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
    case 'unknown_user':
      return 'Questo utente non esiste più'
    case 'self_share':
      return 'Non puoi condividere un allenamento con te stesso'
    case 'invalid_workout':
      return 'Allenamento non valido'
    case 'payload_too_large':
      return 'Allenamento troppo grande da inviare'
    case 'offline':
      return 'Server non raggiungibile: riprova con la rete'
    default:
      return 'Operazione non riuscita, riprova'
  }
}

async function call<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = getToken()
  if (!token) throw new WorkoutShareError('auth', 401)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
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
      throw new WorkoutShareError('server_error', res.status)
    }
    if (!res.ok) throw new WorkoutShareError(data.error ?? `http_${res.status}`, res.status)
    return data as T
  } catch (err) {
    if (err instanceof WorkoutShareError) throw err
    throw new WorkoutShareError('offline', 0)
  } finally {
    clearTimeout(timer)
  }
}

/** Elenco degli utenti con cui condividere (per ora tutti gli account). */
export async function listShareUsers(): Promise<ShareUser[]> {
  const data = await call<{ users?: ShareUser[] }>('users')
  return Array.isArray(data.users) ? data.users : []
}

/** Invia una copia dell'allenamento al destinatario scelto. */
export async function sendWorkoutToUser(
  userId: string,
  workoutId: string,
  toUid: string,
): Promise<void> {
  const detail = getWorkout(userId, workoutId)
  if (!detail) throw new WorkoutShareError('invalid_workout', 400)
  const workout: PortableWorkout = {
    date: detail.date,
    name: detail.name,
    notes: detail.notes,
    entries: detail.entries.map((entry) => ({
      name: entry.exercise.name,
      muscle: entry.exercise.muscle,
      equipment: entry.exercise.equipment,
      tracking: entry.exercise.tracking,
      notes: entry.notes,
      sets: entry.sets.map((set) => ({
        reps: set.reps,
        weight: set.weight,
        rpe: set.rpe ?? null,
      })),
    })),
  }
  if (workout.entries.length === 0) throw new WorkoutShareError('invalid_workout', 400)
  await call('share', { toUid, workout })
}

/** Allenamenti ricevuti e non ancora importati. */
export async function listIncomingWorkouts(): Promise<IncomingWorkout[]> {
  const data = await call<{ shares?: IncomingWorkout[] }>('inbox')
  return Array.isArray(data.shares) ? data.shares : []
}

export async function deleteIncomingWorkout(id: string): Promise<void> {
  await call('delete', { id })
}

/** Abbinare (o creare) l'esercizio locale che corrisponde a quello ricevuto. */
function resolveExercise(userId: string, entry: PortableEntry): Exercise {
  const name = entry.name.trim()
  const all = listExercises(userId)
  const byName = all.find((exercise) => exercise.name.toLowerCase() === name.toLowerCase())
  if (byName) return byName
  try {
    return createExercise(
      userId,
      name,
      entry.muscle,
      entry.equipment,
      entry.tracking,
    )
  } catch {
    const retry = listExercises(userId).find(
      (exercise) => exercise.name.toLowerCase() === name.toLowerCase(),
    )
    if (retry) return retry
    throw new Error(`Impossibile importare l’esercizio «${name}»`)
  }
}

/**
 * Importa un allenamento ricevuto come nuovo allenamento di oggi e restituisce
 * il suo id: da lì si apre l'editor per modificarlo e salvarlo.
 */
export async function importIncomingWorkout(
  userId: string,
  share: IncomingWorkout,
): Promise<string> {
  const workout = share.workout
  if (!workout || !Array.isArray(workout.entries) || workout.entries.length === 0) {
    throw new Error('Allenamento ricevuto non valido')
  }

  const entries: WorkoutEntryInput[] = []
  for (const entry of workout.entries) {
    const exercise = resolveExercise(userId, entry)
    entries.push({
      exerciseId: exercise.id,
      notes: entry.notes ?? '',
      sets: entry.sets.map((set) => ({
        reps: set.reps,
        weight: exercise.tracking === 'time' ? 0 : set.weight,
        rpe: set.rpe ?? null,
      })),
    })
  }
  if (entries.length === 0) throw new Error('Nessun esercizio da importare')

  const id = saveWorkout(userId, {
    date: todayISO(),
    name: (workout.name ?? '').trim().slice(0, 40),
    notes: (workout.notes ?? '').trim(),
    entries,
  })

  // se la rete manca resta nella posta: si potrà eliminare più tardi
  try {
    await deleteIncomingWorkout(share.id)
  } catch {
    /* import già fatto in locale */
  }
  return id
}
