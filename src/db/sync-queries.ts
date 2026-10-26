import { query, queryOne, tx } from './db'
import type { Muscle } from '../lib/types'
import { addDays, todayISO } from '../lib/dates'

export interface SyncProfile {
  id: string
  name: string
  pinHash: string
  pinSalt: string
  pinLength: number
  createdAt: string
}

export interface SyncExercise {
  id: string
  name: string
  muscle: Muscle
  equipment: string
  createdAt: string
  updatedAt: string
}

export interface SyncSet {
  id: string
  exerciseId: string
  entryIndex: number
  setIndex: number
  reps: number
  weight: number
  rpe: number | null
}

export interface SyncWorkout {
  id: string
  date: string
  name: string
  notes: string
  createdAt: string
  updatedAt: string
  sets: SyncSet[]
}

export interface SyncTombstone {
  kind: 'workout' | 'exercise'
  id: string
  deletedAt: string
}

export interface SyncPayload {
  version: 1
  profile: SyncProfile
  exercises: SyncExercise[]
  workouts: SyncWorkout[]
  tombstones: SyncTombstone[]
  savedAt: string
}

interface RawProfile {
  id: string
  name: string
  pin_hash: string
  pin_salt: string
  pin_length: number
  created_at: string
}

interface RawExercise {
  id: string
  name: string
  muscle: string
  equipment: string
  created_at: string
  updated_at: string
}

interface RawWorkout {
  id: string
  date: string
  name: string
  notes: string
  created_at: string
  updated_at: string
}

interface RawSet {
  id: string
  workout_id: string
  exercise_id: string
  entry_index: number
  set_index: number
  reps: number
  weight: number
  rpe: number | null
}

interface RawTombstone {
  kind: 'workout' | 'exercise'
  record_id: string
  deleted_at: string
}

const TOMBSTONE_TTL_DAYS = 365

export function buildSyncPayload(userId: string): SyncPayload {
  const profile = queryOne<RawProfile>('SELECT * FROM users WHERE id = ?', [userId])
  if (!profile) throw new Error('Profilo non trovato')

  const exercises = query<RawExercise>(
    'SELECT * FROM exercises WHERE user_id = ? AND is_default = 0',
    [userId],
  ).map((e) => ({
    id: e.id,
    name: e.name,
    muscle: e.muscle as Muscle,
    equipment: e.equipment,
    createdAt: e.created_at,
    updatedAt: e.updated_at || e.created_at,
  }))

  const workouts = query<RawWorkout>(
    'SELECT * FROM workouts WHERE user_id = ?',
    [userId],
  )
  const sets = query<RawSet>(
    `SELECT s.* FROM workout_sets s
     JOIN workouts w ON w.id = s.workout_id
     WHERE w.user_id = ?
     ORDER BY s.entry_index ASC, s.set_index ASC`,
    [userId],
  )

  const setsByWorkout = new Map<string, SyncSet[]>()
  for (const s of sets) {
    const list = setsByWorkout.get(s.workout_id) ?? []
    list.push({
      id: s.id,
      exerciseId: s.exercise_id,
      entryIndex: s.entry_index,
      setIndex: s.set_index,
      reps: s.reps,
      weight: s.weight,
      rpe: s.rpe,
    })
    setsByWorkout.set(s.workout_id, list)
  }

  const tombstones = query<RawTombstone>(
    'SELECT kind, record_id, deleted_at FROM deleted_records WHERE user_id = ? AND deleted_at >= ?',
    [userId, addDays(todayISO(), -TOMBSTONE_TTL_DAYS)],
  ).map((t) => ({ kind: t.kind, id: t.record_id, deletedAt: t.deleted_at }))

  return {
    version: 1,
    profile: {
      id: profile.id,
      name: profile.name,
      pinHash: profile.pin_hash,
      pinSalt: profile.pin_salt,
      pinLength: profile.pin_length,
      createdAt: profile.created_at,
    },
    exercises,
    workouts: workouts.map((w) => ({
      id: w.id,
      date: w.date,
      name: w.name,
      notes: w.notes,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
      sets: setsByWorkout.get(w.id) ?? [],
    })),
    tombstones,
    savedAt: new Date().toISOString(),
  }
}

/**
 * Unisce il payload remoto nel database locale (last-write-wins per entità)
 * e restituisce lo snapshot locale risultante, pronto da ripubblicare.
 */
export function applySyncPayload(userId: string, remote: SyncPayload | null): SyncPayload {
  if (remote) {
    const localTombstones = new Map<string, string>()
    for (const t of query<RawTombstone>(
      'SELECT kind, record_id, deleted_at FROM deleted_records WHERE user_id = ?',
      [userId],
    )) {
      localTombstones.set(`${t.kind}:${t.record_id}`, t.deleted_at)
    }

    const localExercises = new Map(
      query<RawExercise>('SELECT * FROM exercises WHERE user_id = ?', [userId]).map((e) => [
        e.id,
        e.updated_at || e.created_at,
      ]),
    )
    const localWorkouts = new Map(
      query<RawWorkout>('SELECT * FROM workouts WHERE user_id = ?', [userId]).map((w) => [
        w.id,
        w.updated_at,
      ]),
    )

    tx((db) => {
      const insertTombstone = db.prepare(
        `INSERT INTO deleted_records (kind, record_id, user_id, deleted_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(kind, record_id) DO UPDATE SET deleted_at = excluded.deleted_at
         WHERE excluded.deleted_at > deleted_records.deleted_at`,
      )

      // 1. tombstone remoti
      for (const t of remote.tombstones ?? []) {
        const updatedAt = t.kind === 'workout' ? localWorkouts.get(t.id) : localExercises.get(t.id)
        const localTomb = localTombstones.get(`${t.kind}:${t.id}`)
        if (localTomb && localTomb >= t.deletedAt) continue
        if (updatedAt && updatedAt > t.deletedAt) continue // locale più recente: vince
        if (t.kind === 'workout') {
          db.run('DELETE FROM workout_sets WHERE workout_id = ?', [t.id])
          db.run('DELETE FROM workouts WHERE id = ? AND user_id = ?', [t.id, userId])
        } else {
          db.run('DELETE FROM exercises WHERE id = ? AND user_id = ? AND is_default = 0', [t.id, userId])
        }
        insertTombstone.run([t.kind, t.id, userId, t.deletedAt])
      }
      insertTombstone.free()

      // 2. esercizi remoti
      for (const e of remote.exercises ?? []) {
        const localTomb = localTombstones.get(`exercise:${e.id}`)
        if (localTomb && localTomb > (e.updatedAt || e.createdAt)) continue
        const localUpdated = localExercises.get(e.id)
        if (localUpdated && localUpdated >= e.updatedAt) continue
        db.run(
          `INSERT INTO exercises (id, user_id, name, muscle, equipment, is_default, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 0, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, muscle = excluded.muscle, equipment = excluded.equipment,
             updated_at = excluded.updated_at`,
          [e.id, userId, e.name, e.muscle, e.equipment, e.createdAt, e.updatedAt || e.createdAt],
        )
      }

      // 3. allenamenti remoti (con le loro serie)
      for (const w of remote.workouts ?? []) {
        const localTomb = localTombstones.get(`workout:${w.id}`)
        if (localTomb && localTomb > w.updatedAt) continue
        const localUpdated = localWorkouts.get(w.id)
        if (localUpdated && localUpdated >= w.updatedAt) continue

        db.run(
          `INSERT INTO workouts (id, user_id, date, name, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             date = excluded.date, name = excluded.name, notes = excluded.notes,
             updated_at = excluded.updated_at`,
          [w.id, userId, w.date, w.name ?? '', w.notes ?? '', w.createdAt, w.updatedAt],
        )
        db.run('DELETE FROM workout_sets WHERE workout_id = ?', [w.id])
        for (const s of w.sets ?? []) {
          const exercise = queryOne<{ id: string }>('SELECT id FROM exercises WHERE id = ?', [
            s.exerciseId,
          ])
          if (!exercise) {
            db.run(
              `INSERT OR IGNORE INTO exercises (id, user_id, name, muscle, equipment, is_default, created_at, updated_at)
               VALUES (?, ?, ?, 'Altro', '', 0, ?, ?)`,
              [s.exerciseId, userId, 'Esercizio sincronizzato', new Date().toISOString(), new Date().toISOString()],
            )
          }
          db.run(
            `INSERT INTO workout_sets (id, workout_id, exercise_id, entry_index, set_index, reps, weight, rpe)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              s.id,
              w.id,
              s.exerciseId,
              s.entryIndex ?? 0,
              s.setIndex ?? 0,
              Math.max(0, Math.round(s.reps)),
              Math.max(0, s.weight),
              s.rpe ?? null,
            ],
          )
        }
      }
    })
  }

  return buildSyncPayload(userId)
}

/** Inserisce/aggiorna un profilo proveniente dalla sync (nuovo dispositivo). */
export function importSyncProfile(profile: SyncProfile): string {
  const existing = queryOne<RawProfile>('SELECT * FROM users WHERE id = ?', [profile.id])
  if (existing) {
    tx((db) => {
      db.run('UPDATE users SET name = ?, pin_hash = ?, pin_salt = ?, pin_length = ? WHERE id = ?', [
        profile.name,
        profile.pinHash,
        profile.pinSalt,
        profile.pinLength || 4,
        profile.id,
      ])
    })
    return profile.id
  }

  let name = profile.name || 'Profilo sync'
  const clash = queryOne<{ id: string }>('SELECT id FROM users WHERE lower(name) = lower(?)', [name])
  if (clash) name = `${name} (sync)`

  const id = profile.id
  tx((db) => {
    db.run(
      'INSERT INTO users (id, name, pin_hash, pin_salt, pin_length, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, name, profile.pinHash, profile.pinSalt, profile.pinLength || 4, profile.createdAt],
    )
  })
  return id
}
