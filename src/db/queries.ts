import { mutate, query, queryOne, tx, getDb } from './db'
import { hashPin, newId, verifyPin } from '../lib/hash'
import type {
  Exercise,
  Muscle,
  User,
  WorkoutDetail,
  WorkoutEntryInput,
  WorkoutSummary,
} from '../lib/types'
import { addDays, parseISO, startOfMonth, startOfWeek, todayISO } from '../lib/dates'

// ---------- Users ----------

interface RawUser {
  id: string
  name: string
  pin_hash: string
  pin_salt: string
  pin_length: number
  created_at: string
}

const mapUser = (r: RawUser): User => ({
  id: r.id,
  name: r.name,
  pinHash: r.pin_hash,
  pinSalt: r.pin_salt,
  pinLength: r.pin_length ?? 4,
  createdAt: r.created_at,
})

export function listUsers(): User[] {
  return query<RawUser>('SELECT * FROM users ORDER BY created_at ASC').map(mapUser)
}

export function getUser(id: string): User | null {
  const r = queryOne<RawUser>('SELECT * FROM users WHERE id = ?', [id])
  return r ? mapUser(r) : null
}

export async function createUser(name: string, pin: string): Promise<User> {
  const clean = name.trim()
  if (clean.length < 2) throw new Error('Il nome deve avere almeno 2 caratteri')
  if (!/^\d{4,6}$/.test(pin)) throw new Error('Il PIN deve avere 4-6 cifre')
  const exists = queryOne<{ id: string }>('SELECT id FROM users WHERE lower(name) = lower(?)', [clean])
  if (exists) throw new Error('Esiste già un profilo con questo nome')

  const { hash, salt } = await hashPin(pin)
  const user: User = {
    id: newId(),
    name: clean,
    pinHash: hash,
    pinSalt: salt,
    pinLength: pin.length,
    createdAt: new Date().toISOString(),
  }
  mutate(
    'INSERT INTO users (id, name, pin_hash, pin_salt, pin_length, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [user.id, user.name, user.pinHash, user.pinSalt, user.pinLength, user.createdAt],
  )
  return user
}

export function checkPin(user: User, pin: string): Promise<boolean> {
  return verifyPin(pin, user.pinHash, user.pinSalt)
}

export async function updateUserPin(userId: string, pin: string): Promise<void> {
  if (!/^\d{4,6}$/.test(pin)) throw new Error('Il PIN deve avere 4-6 cifre')
  const { hash, salt } = await hashPin(pin)
  mutate('UPDATE users SET pin_hash = ?, pin_salt = ?, pin_length = ? WHERE id = ?', [
    hash,
    salt,
    pin.length,
    userId,
  ])
}

export function renameUser(userId: string, name: string): void {
  const clean = name.trim()
  if (clean.length < 2) throw new Error('Il nome deve avere almeno 2 caratteri')
  const exists = queryOne<{ id: string }>(
    'SELECT id FROM users WHERE lower(name) = lower(?) AND id <> ?',
    [clean, userId],
  )
  if (exists) throw new Error('Esiste già un profilo con questo nome')
  mutate('UPDATE users SET name = ? WHERE id = ?', [clean, userId])
}

export function deleteUser(userId: string): void {
  tx((db) => {
    db.run('DELETE FROM workout_sets WHERE workout_id IN (SELECT id FROM workouts WHERE user_id = ?)', [userId])
    db.run('DELETE FROM workouts WHERE user_id = ?', [userId])
    db.run('DELETE FROM exercises WHERE user_id = ?', [userId])
    db.run('DELETE FROM users WHERE id = ?', [userId])
  })
}

export function countWorkouts(userId: string): number {
  const r = queryOne<{ n: number }>('SELECT COUNT(*) AS n FROM workouts WHERE user_id = ?', [userId])
  return r?.n ?? 0
}

// ---------- Exercises ----------

interface RawExercise {
  id: string
  user_id: string | null
  name: string
  muscle: string
  equipment: string
  is_default: number
  created_at: string
}

const mapExercise = (r: RawExercise): Exercise => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  muscle: r.muscle as Muscle,
  equipment: r.equipment,
  isDefault: r.is_default === 1,
  createdAt: r.created_at,
})

export function listExercises(userId: string): Exercise[] {
  return query<RawExercise>(
    `SELECT * FROM exercises
     WHERE user_id IS NULL OR user_id = ?
     ORDER BY is_default DESC, name COLLATE NOCASE ASC`,
    [userId],
  ).map(mapExercise)
}

export function getExercise(id: string): Exercise | null {
  const r = queryOne<RawExercise>('SELECT * FROM exercises WHERE id = ?', [id])
  return r ? mapExercise(r) : null
}

export function createExercise(
  userId: string,
  name: string,
  muscle: Muscle,
  equipment = '',
): Exercise {
  const clean = name.trim()
  if (clean.length < 2) throw new Error('Nome esercizio troppo corto')
  const dup = queryOne<{ id: string }>(
    'SELECT id FROM exercises WHERE (user_id IS NULL OR user_id = ?) AND lower(name) = lower(?)',
    [userId, clean],
  )
  if (dup) throw new Error('Questo esercizio esiste già')

  const ex: Exercise = {
    id: newId(),
    userId,
    name: clean,
    muscle,
    equipment: equipment.trim(),
    isDefault: false,
    createdAt: new Date().toISOString(),
  }
  mutate(
    'INSERT INTO exercises (id, user_id, name, muscle, equipment, is_default, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)',
    [ex.id, ex.userId, ex.name, ex.muscle, ex.equipment, ex.createdAt],
  )
  return ex
}

export function deleteExercise(userId: string, id: string): void {
  const used = queryOne<{ n: number }>(
    'SELECT COUNT(*) AS n FROM workout_sets s JOIN workouts w ON w.id = s.workout_id WHERE w.user_id = ? AND s.exercise_id = ?',
    [userId, id],
  )
  if ((used?.n ?? 0) > 0) {
    throw new Error('Esercizio usato in allenamenti passati: non può essere eliminato')
  }
  mutate('DELETE FROM exercises WHERE id = ? AND user_id = ? AND is_default = 0', [id, userId])
}

// ---------- Workouts ----------

interface RawWorkout {
  id: string
  user_id: string
  date: string
  name: string
  notes: string
  created_at: string
  updated_at: string
}

const mapWorkout = (r: RawWorkout): WorkoutSummary => ({
  id: r.id,
  userId: r.user_id,
  date: r.date,
  name: r.name,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  exercises: 0,
  sets: 0,
  volume: 0,
  muscles: '',
})

const isValidDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(parseISO(d).getTime())

export interface ListWorkoutsOptions {
  from?: string
  to?: string
  limit?: number
}

interface RawWorkoutSummary extends RawWorkout {
  exercises: number
  sets: number
  volume: number
  muscles: string | null
}

export function listWorkouts(userId: string, opts: ListWorkoutsOptions = {}): WorkoutSummary[] {
  const where = ['w.user_id = ?']
  const params: Array<string | number> = [userId]
  if (opts.from) {
    where.push('w.date >= ?')
    params.push(opts.from)
  }
  if (opts.to) {
    where.push('w.date <= ?')
    params.push(opts.to)
  }
  const limit = opts.limit ? ' LIMIT ' + Math.max(1, Math.floor(opts.limit)) : ''
  const rows = query<RawWorkoutSummary>(
    `SELECT w.*,
            COUNT(DISTINCT s.exercise_id) AS exercises,
            COUNT(s.id) AS sets,
            COALESCE(SUM(s.reps * s.weight), 0) AS volume,
            GROUP_CONCAT(DISTINCT e.muscle) AS muscles
     FROM workouts w
     LEFT JOIN workout_sets s ON s.workout_id = w.id
     LEFT JOIN exercises e ON e.id = s.exercise_id
     WHERE ${where.join(' AND ')}
     GROUP BY w.id
     ORDER BY w.date DESC, w.created_at DESC${limit}`,
    params,
  )
  return rows.map((r) => ({
    ...mapWorkout(r),
    exercises: r.exercises,
    sets: r.sets,
    volume: r.volume,
    muscles: r.muscles ?? '',
  }))
}

export function getWorkout(userId: string, workoutId: string): WorkoutDetail | null {
  const raw = queryOne<RawWorkout>('SELECT * FROM workouts WHERE id = ? AND user_id = ?', [
    workoutId,
    userId,
  ])
  if (!raw) return null

  const setRows = query<{
    id: string
    workout_id: string
    exercise_id: string
    entry_index: number
    set_index: number
    reps: number
    weight: number
    rpe: number | null
  }>(
    `SELECT * FROM workout_sets WHERE workout_id = ?
     ORDER BY entry_index ASC, set_index ASC`,
    [workoutId],
  )

  const exercises = listExercises(userId)
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const entries: WorkoutDetail['entries'] = []
  for (const row of setRows) {
    let entry = entries.find((e) => e.exercise.id === row.exercise_id)
    if (!entry) {
      const exercise = byId.get(row.exercise_id) ?? {
        id: row.exercise_id,
        userId: null,
        name: 'Esercizio eliminato',
        muscle: 'Altro' as Muscle,
        equipment: '',
        isDefault: true,
        createdAt: '',
      }
      entry = { exercise, sets: [] }
      entries.push(entry)
    }
    entry.sets.push({
      id: row.id,
      setIndex: row.set_index,
      reps: row.reps,
      weight: row.weight,
      rpe: row.rpe,
    })
  }

  const workout = mapWorkout(raw)
  return {
    ...workout,
    exercises: entries.length,
    sets: setRows.length,
    volume: setRows.reduce((sum, s) => sum + s.reps * s.weight, 0),
    muscles: [...new Set(entries.map((e) => e.exercise.muscle))].join(','),
    entries,
  }
}

export interface SaveWorkoutInput {
  id?: string
  date: string
  name?: string
  notes?: string
  entries: WorkoutEntryInput[]
}

export function saveWorkout(userId: string, input: SaveWorkoutInput): string {
  if (!isValidDate(input.date)) throw new Error('Data non valida')
  const entries = input.entries
    .map((e) => ({
      ...e,
      sets: e.sets.filter((s) => Number.isFinite(s.reps) && Number.isFinite(s.weight) && s.reps > 0),
    }))
    .filter((e) => e.sets.length > 0)

  if (entries.length === 0) throw new Error("Inserisci almeno una serie con ripetizioni maggiori di zero")

  const now = new Date().toISOString()
  let workoutId = input.id ?? ''

  tx((db) => {
    if (workoutId) {
      const exists = queryOne<{ id: string }>('SELECT id FROM workouts WHERE id = ? AND user_id = ?', [
        workoutId,
        userId,
      ])
      if (!exists) throw new Error('Allenamento non trovato')
      db.run('UPDATE workouts SET date = ?, name = ?, notes = ?, updated_at = ? WHERE id = ?', [
        input.date,
        (input.name ?? '').trim(),
        (input.notes ?? '').trim(),
        now,
        workoutId,
      ])
      db.run('DELETE FROM workout_sets WHERE workout_id = ?', [workoutId])
    } else {
      workoutId = newId()
      db.run(
        'INSERT INTO workouts (id, user_id, date, name, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [workoutId, userId, input.date, (input.name ?? '').trim(), (input.notes ?? '').trim(), now, now],
      )
    }

    const stmt = db.prepare(
      'INSERT INTO workout_sets (id, workout_id, exercise_id, entry_index, set_index, reps, weight, rpe) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    try {
      entries.forEach((entry, entryIndex) => {
        entry.sets.forEach((set, setIndex) => {
          stmt.run([
            newId(),
            workoutId,
            entry.exerciseId,
            entryIndex,
            setIndex,
            Math.round(set.reps),
            Math.max(0, set.weight),
            set.rpe ?? null,
          ])
        })
      })
    } finally {
      stmt.free()
    }
  })

  return workoutId
}

export function deleteWorkout(userId: string, workoutId: string): void {
  tx((db) => {
    db.run('DELETE FROM workout_sets WHERE workout_id = ?', [workoutId])
    db.run('DELETE FROM workouts WHERE id = ? AND user_id = ?', [workoutId, userId])
  })
}

export function lastWorkoutDate(userId: string): string | null {
  const r = queryOne<{ date: string }>('SELECT MAX(date) AS date FROM workouts WHERE user_id = ?', [userId])
  return r?.date ?? null
}

export function lastPerformance(
  userId: string,
  exerciseId: string,
): { date: string; sets: Array<{ reps: number; weight: number }> } | null {
  const last = queryOne<{ date: string }>(
    `SELECT MAX(w.date) AS date FROM workout_sets s
     JOIN workouts w ON w.id = s.workout_id
     WHERE w.user_id = ? AND s.exercise_id = ?`,
    [userId, exerciseId],
  )
  if (!last?.date) return null
  const sets = query<{ reps: number; weight: number }>(
    `SELECT s.reps, s.weight FROM workout_sets s
     JOIN workouts w ON w.id = s.workout_id
     WHERE w.user_id = ? AND s.exercise_id = ? AND w.date = ?
     ORDER BY s.set_index ASC`,
    [userId, exerciseId, last.date],
  )
  return { date: last.date, sets }
}

// ---------- Statistiche ----------

export interface DayAggregate {
  date: string
  volume: number
  sets: number
  workouts: number
}

export function getDayAggregates(
  userId: string,
  from?: string,
  to?: string,
): DayAggregate[] {
  const where = ['w.user_id = ?']
  const params: Array<string | number> = [userId]
  if (from) {
    where.push('w.date >= ?')
    params.push(from)
  }
  if (to) {
    where.push('w.date <= ?')
    params.push(to)
  }
  return query<DayAggregate>(
    `SELECT w.date AS date,
            COALESCE(SUM(s.reps * s.weight), 0) AS volume,
            COUNT(s.id) AS sets,
            COUNT(DISTINCT w.id) AS workouts
     FROM workouts w
     LEFT JOIN workout_sets s ON s.workout_id = w.id
     WHERE ${where.join(' AND ')}
     GROUP BY w.date
     ORDER BY w.date ASC`,
    params,
  )
}

export interface MuscleAggregate {
  muscle: Muscle
  volume: number
  sets: number
  sessions: number
}

export function getMuscleAggregates(userId: string): MuscleAggregate[] {
  return query<MuscleAggregate>(
    `SELECT e.muscle AS muscle,
            COALESCE(SUM(s.reps * s.weight), 0) AS volume,
            COUNT(s.id) AS sets,
            COUNT(DISTINCT w.id) AS sessions
     FROM workout_sets s
     JOIN workouts w ON w.id = s.workout_id
     JOIN exercises e ON e.id = s.exercise_id
     WHERE w.user_id = ?
     GROUP BY e.muscle
     ORDER BY volume DESC, sets DESC`,
    [userId],
  )
}

export interface ExerciseAggregate {
  exerciseId: string
  name: string
  muscle: Muscle
  equipment: string
  volume: number
  sets: number
  sessions: number
  bestWeight: number
  bestE1rm: number
  lastDate: string
}

export function getExerciseAggregates(userId: string, limit = 8): ExerciseAggregate[] {
  return query<ExerciseAggregate>(
    `SELECT e.id AS exerciseId,
            e.name AS name,
            e.muscle AS muscle,
            e.equipment AS equipment,
            COALESCE(SUM(s.reps * s.weight), 0) AS volume,
            COUNT(s.id) AS sets,
            COUNT(DISTINCT w.id) AS sessions,
            MAX(s.weight) AS bestWeight,
            MAX(CASE WHEN s.reps > 0 THEN s.weight * (1 + s.reps / 30.0) ELSE 0 END) AS bestE1rm,
            MAX(w.date) AS lastDate
     FROM workout_sets s
     JOIN workouts w ON w.id = s.workout_id
     JOIN exercises e ON e.id = s.exercise_id
     WHERE w.user_id = ?
     GROUP BY e.id
     ORDER BY volume DESC, sets DESC
     LIMIT ?`,
    [userId, limit],
  )
}

export interface ExerciseHistoryPoint {
  date: string
  volume: number
  sets: number
  bestWeight: number
  bestE1rm: number
}

export function getExerciseHistory(
  userId: string,
  exerciseId: string,
  limit = 12,
): ExerciseHistoryPoint[] {
  const rows = query<ExerciseHistoryPoint>(
    `SELECT w.date AS date,
            COALESCE(SUM(s.reps * s.weight), 0) AS volume,
            COUNT(s.id) AS sets,
            MAX(s.weight) AS bestWeight,
            MAX(CASE WHEN s.reps > 0 THEN s.weight * (1 + s.reps / 30.0) ELSE 0 END) AS bestE1rm
     FROM workout_sets s
     JOIN workouts w ON w.id = s.workout_id
     WHERE w.user_id = ? AND s.exercise_id = ?
     GROUP BY w.date
     ORDER BY w.date DESC
     LIMIT ?`,
    [userId, exerciseId, limit],
  )
  return rows.reverse()
}

export interface Stats {
  totalWorkouts: number
  totalVolume: number
  totalSets: number
  totalReps: number
  activeDays: number
  weekWorkouts: number
  weekVolume: number
  monthWorkouts: number
  monthVolume: number
  currentStreak: number
  bestStreak: number
  firstDate: string | null
  lastDate: string | null
  weekly: Array<{ weekStart: string; volume: number; workouts: number; sets: number }>
  muscles: MuscleAggregate[]
  topExercises: ExerciseAggregate[]
  days: Map<string, DayAggregate>
}

export function getStats(userId: string, today = todayISO()): Stats {
  const days = getDayAggregates(userId)
  const dayMap = new Map(days.map((d) => [d.date, d]))

  const totalWorkouts = days.reduce((s, d) => s + d.workouts, 0)
  const totalVolume = days.reduce((s, d) => s + d.volume, 0)
  const totalSets = days.reduce((s, d) => s + d.sets, 0)

  const totalRepsRow = queryOne<{ reps: number }>(
    `SELECT COALESCE(SUM(s.reps), 0) AS reps FROM workout_sets s
     JOIN workouts w ON w.id = s.workout_id WHERE w.user_id = ?`,
    [userId],
  )

  const sortedAsc = days.map((d) => d.date).sort()
  const sortedDesc = [...sortedAsc].reverse()

  // streak attuale: serie di giorni consecutivi che termina oggi o ieri
  let currentStreak = 0
  if (sortedDesc.length > 0) {
    const last = sortedDesc[0]
    const gapToToday = Math.round(
      (parseISO(today).getTime() - parseISO(last).getTime()) / 86400000,
    )
    if (gapToToday <= 1) {
      currentStreak = 1
      for (let i = 1; i < sortedDesc.length; i++) {
        const diff = Math.round(
          (parseISO(sortedDesc[i - 1]).getTime() - parseISO(sortedDesc[i]).getTime()) / 86400000,
        )
        if (diff === 1) currentStreak++
        else break
      }
    }
  }

  // streak migliore
  let bestStreak = 0
  let run = 0
  let prev: string | null = null
  for (const day of sortedAsc) {
    if (!prev) run = 1
    else {
      const diff = Math.round((parseISO(day).getTime() - parseISO(prev).getTime()) / 86400000)
      run = diff === 1 ? run + 1 : 1
    }
    bestStreak = Math.max(bestStreak, run)
    prev = day
  }

  const weekStart = startOfWeek(today)
  const monthStart = startOfMonth(today)
  let weekWorkouts = 0
  let weekVolume = 0
  let monthWorkouts = 0
  let monthVolume = 0
  for (const d of days) {
    if (d.date >= weekStart && d.date <= today) {
      weekWorkouts += d.workouts
      weekVolume += d.volume
    }
    if (d.date >= monthStart && d.date <= today) {
      monthWorkouts += d.workouts
      monthVolume += d.volume
    }
  }

  const weekly: Stats['weekly'] = []
  for (let i = 7; i >= 0; i--) {
    const start = addDays(weekStart, -7 * i)
    const end = addDays(start, 6)
    let volume = 0
    let workouts = 0
    let sets = 0
    for (const d of days) {
      if (d.date >= start && d.date <= end) {
        volume += d.volume
        workouts += d.workouts
        sets += d.sets
      }
    }
    weekly.push({ weekStart: start, volume, workouts, sets })
  }

  return {
    totalWorkouts,
    totalVolume,
    totalSets,
    totalReps: totalRepsRow?.reps ?? 0,
    activeDays: days.length,
    weekWorkouts,
    weekVolume,
    monthWorkouts,
    monthVolume,
    currentStreak,
    bestStreak,
    firstDate: sortedAsc[0] ?? null,
    lastDate: sortedDesc[0] ?? null,
    weekly,
    muscles: getMuscleAggregates(userId),
    topExercises: getExerciseAggregates(userId, 6),
    days: dayMap,
  }
}

/** Import rapido: id esercizio disponibile (per evitare FK orfane). */
export function exerciseExists(id: string): boolean {
  return !!queryOne<{ id: string }>('SELECT id FROM exercises WHERE id = ?', [id])
}

export function dbFileSize(): number {
  return getDb().export().length
}
