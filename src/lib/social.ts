import { getWorkout, getStats, listWorkouts } from '../db/queries'
import { getSyncCode } from './sync'
import { epley } from './format'
import type { Muscle } from './types'

// ---------- Tipi condivisi ----------

export interface SharedSet {
  reps: number
  weight: number
}

export interface SharedExercise {
  name: string
  muscle: Muscle
  equipment: string
  sets: SharedSet[]
}

export interface SharedWorkout {
  id: string
  date: string
  name: string
  muscles: Muscle[]
  volume: number
  sets: number
  exercises: SharedExercise[]
  note?: string
}

export interface SharedStats {
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
  muscles: Array<{ muscle: Muscle; volume: number; sets: number }>
  topExercises: Array<{
    name: string
    muscle: Muscle
    volume: number
    sets: number
    bestWeight: number
    bestE1rm: number
    lastDate: string
  }>
  weekly: Array<{ weekStart: string; volume: number; workouts: number }>
}

export interface SharedSnapshot {
  version: 1
  generatedAt: string
  stats: SharedStats
  workouts: SharedWorkout[]
}

export interface SocialFriend {
  uid: string
  name: string
  snapshot: SharedSnapshot | null
  updatedAt: string
}

export interface FriendRequest {
  uid: string
  name: string
  at: string
}

export interface SocialMe {
  uid: string
  name: string
  friendCode: string
  snapshot: SharedSnapshot | null
  updatedAt: string
}

export interface SocialState {
  exists: true
  me: SocialMe
  friends: SocialFriend[]
  incoming: FriendRequest[]
  outgoing: FriendRequest[]
}

export type SocialMeResult = SocialState | { exists: false }

// ---------- Storage locale ----------

const enabledKey = (uid: string) => `palestralogger:social-enabled:${uid}`
const cacheKey = (uid: string) => `palestralogger:social-cache:${uid}`
const notesKey = (uid: string) => `palestralogger:social-notes:${uid}`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export function isSocialEnabled(uid: string): boolean {
  return read(enabledKey(uid)) === '1'
}

export function isShareNotesEnabled(uid: string): boolean {
  return read(notesKey(uid)) === '1'
}

export function setShareNotesEnabled(uid: string, value: boolean): void {
  write(notesKey(uid), value ? '1' : null)
}

export function getCachedSocial(uid: string): { at: string; state: SocialState } | null {
  const raw = read(cacheKey(uid))
  if (!raw) return null
  try {
    return JSON.parse(raw) as { at: string; state: SocialState }
  } catch {
    return null
  }
}

function cacheState(uid: string, state: SocialState): void {
  write(cacheKey(uid), JSON.stringify({ at: new Date().toISOString(), state }))
}

function clearCache(uid: string): void {
  write(cacheKey(uid), null)
  write(enabledKey(uid), null)
}

// ---------- Snapshot ----------

export function buildSharedSnapshot(uid: string): SharedSnapshot {
  const stats = getStats(uid)
  const shareNotes = isShareNotesEnabled(uid)
  const workouts = listWorkouts(uid, { limit: 20 })

  const items: SharedWorkout[] = []
  for (const w of workouts) {
    const detail = getWorkout(uid, w.id)
    if (!detail) continue
    const muscles = [...new Set(detail.entries.map((e) => e.exercise.muscle))]
    items.push({
      id: w.id,
      date: w.date,
      name: w.name,
      muscles,
      volume: w.volume,
      sets: w.sets,
      exercises: detail.entries.map((e) => ({
        name: e.exercise.name,
        muscle: e.exercise.muscle,
        equipment: e.exercise.equipment,
        sets: e.sets.map((s) => ({ reps: s.reps, weight: s.weight })),
      })),
      ...(shareNotes && w.notes ? { note: w.notes } : {}),
    })
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    stats: {
      totalWorkouts: stats.totalWorkouts,
      totalVolume: stats.totalVolume,
      totalSets: stats.totalSets,
      totalReps: stats.totalReps,
      activeDays: stats.activeDays,
      weekWorkouts: stats.weekWorkouts,
      weekVolume: stats.weekVolume,
      monthWorkouts: stats.monthWorkouts,
      monthVolume: stats.monthVolume,
      currentStreak: stats.currentStreak,
      bestStreak: stats.bestStreak,
      firstDate: stats.firstDate,
      lastDate: stats.lastDate,
      muscles: stats.muscles.slice(0, 6).map((m) => ({
        muscle: m.muscle,
        volume: m.volume,
        sets: m.sets,
      })),
      topExercises: stats.topExercises.map((e) => ({
        name: e.name,
        muscle: e.muscle,
        volume: e.volume,
        sets: e.sets,
        bestWeight: e.bestWeight,
        bestE1rm: e.bestE1rm,
        lastDate: e.lastDate,
      })),
      weekly: stats.weekly.map((w) => ({
        weekStart: w.weekStart,
        volume: w.volume,
        workouts: w.workouts,
      })),
    },
    workouts: items,
  }
}

// ---------- API ----------

const API = '/api/social'

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15_000)
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      throw new Error('Servizio amici non disponibile')
    }
    if (!res.ok) {
      const err = (data as { error?: string } | null)?.error
      throw new SocialError(err, res.status)
    }
    return data as T
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Connessione scaduta, riprova')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export class SocialError extends Error {
  code: string
  status: number
  constructor(code: string | undefined, status: number) {
    super(messageFor(code))
    this.code = code ?? 'unknown'
    this.status = status
  }
}

function messageFor(code: string | undefined): string {
  switch (code) {
    case 'auth':
      return 'Attiva prima la sync cloud dal Profilo'
    case 'not_found':
      return 'Nessun profilo con questo codice amico'
    case 'self':
      return 'Questo è il tuo stesso codice'
    case 'already_friends':
      return 'Siete già amici'
    case 'invalid_code':
      return 'Codice amico non valido (formato XXXX-XXXX-XXXX)'
    case 'too_many_requests':
    case 'too_many_friends':
      return 'Limite di amici/richieste raggiunto'
    case 'not_active':
      return 'Funzione amici non attiva'
    case 'snapshot_too_large':
      return 'Dati troppo grandi da condividere'
    default:
      return 'Operazione non riuscita, riprova'
  }
}

function requireSyncCode(uid: string): string {
  const code = getSyncCode(uid)
  if (!code) throw new Error('Attiva prima la sync cloud dal Profilo')
  return code
}

export async function socialMe(uid: string): Promise<SocialMeResult> {
  const result = await call<SocialMeResult>({ action: 'me', code: requireSyncCode(uid) })
  if (result.exists) {
    cacheState(uid, result)
    write(enabledKey(uid), '1')
  }
  return result
}

export async function activateSocial(uid: string): Promise<SocialState> {
  const state = await call<SocialState>({ action: 'activate', code: requireSyncCode(uid) })
  cacheState(uid, state)
  write(enabledKey(uid), '1')
  return state
}

export async function publishSocial(uid: string): Promise<SharedSnapshot | null> {
  if (!isSocialEnabled(uid)) return null
  const snapshot = buildSharedSnapshot(uid)
  const res = await call<{ ok: boolean; updatedAt: string }>({
    action: 'publish',
    code: requireSyncCode(uid),
    snapshot,
  })
  const cached = getCachedSocial(uid)
  if (cached) {
    cached.state.me.snapshot = snapshot
    cached.state.me.updatedAt = res.updatedAt
    cacheState(uid, cached.state)
  }
  return snapshot
}

export async function sendFriendRequest(
  uid: string,
  friendCode: string,
): Promise<{ status: 'requested' | 'already_friends'; target: { uid: string; name: string } }> {
  return call({
    action: 'request',
    code: requireSyncCode(uid),
    friendCode: normalizeFriendCode(friendCode),
  })
}

export async function respondFriendRequest(
  uid: string,
  fromUid: string,
  accept: boolean,
): Promise<SocialState> {
  const state = await call<SocialState>({
    action: 'respond',
    code: requireSyncCode(uid),
    fromUid,
    accept,
  })
  cacheState(uid, state)
  return state
}

export async function removeFriend(uid: string, friendUid: string): Promise<SocialState> {
  const state = await call<SocialState>({
    action: 'remove',
    code: requireSyncCode(uid),
    friendUid,
  })
  cacheState(uid, state)
  return state
}

export async function deleteSocial(uid: string): Promise<void> {
  try {
    await call({ action: 'delete', code: requireSyncCode(uid) })
  } finally {
    clearCache(uid)
  }
}

export async function refreshSocial(uid: string): Promise<SocialState | null> {
  const result = await socialMe(uid)
  return result.exists ? result : null
}

// ---------- Utility ----------

export function normalizeFriendCode(raw: string): string {
  const clean = raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)
  return clean.replace(/(.{4})(?=.)/g, '$1-')
}

export function isValidFriendCode(raw: string): boolean {
  return /^[A-Z0-9]{4}(-[A-Z0-9]{4}){2}$/.test(normalizeFriendCode(raw))
}

/** Migliore stima 1RM dalle serie condivise (solo per la UI amico). */
export function bestSharedE1rm(sets: SharedSet[]): number {
  return Math.max(0, ...sets.map((s) => epley(s.weight, s.reps)))
}
