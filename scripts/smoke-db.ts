import { initDb, flush } from '../src/db/db'
import {
  createUser,
  listUsers,
  checkPin,
  listExercises,
  saveWorkout,
  getWorkout,
  listWorkouts,
  getStats,
  lastPerformance,
  createExercise,
  deleteExercise,
  deleteWorkout,
  updateUserPin,
  renameUser,
} from '../src/db/queries'

const today = '2026-10-26'

async function main() {
  await initDb()
  const user = await createUser('Marco Rossi', '4821')
  console.log('utente creato:', user.name, 'pinLength', user.pinLength)
  console.log('pin ok:', await checkPin(user, '4821'), '| pin errato:', await checkPin(user, '0000'))

  const exercises = listExercises(user.id)
  console.log('esercizi disponibili:', exercises.length, '| primi:', exercises.slice(0, 3).map((e) => e.name))
  if (exercises.length < 50) throw new Error('seed esercizi mancante')

  const custom = createExercise(user.id, 'Chest press inclinata', 'Petto', 'Macchina')
  console.log('esercizio custom:', custom.name, custom.muscle, 'default?', custom.isDefault)

  const id = saveWorkout(user.id, {
    date: '2026-10-24',
    name: 'Push A',
    notes: 'buone sensazioni',
    entries: [
      {
        exerciseId: 'def-panca-piana',
        sets: [
          { reps: 10, weight: 80 },
          { reps: 8, weight: 85 },
          { reps: 6, weight: 90 },
        ],
      },
      { exerciseId: 'def-leg-press', sets: [{ reps: 12, weight: 140 }] },
      { exerciseId: custom.id, sets: [{ reps: 15, weight: 40 }] },
    ],
  })
  console.log('workout id:', id)

  const detail = getWorkout(user.id, id)
  if (!detail) throw new Error('dettaglio non trovato')
  console.log('dettaglio: esercizi', detail.entries.length, 'serie', detail.sets, 'volume', detail.volume)
  if (detail.volume !== 80 * 10 + 85 * 8 + 90 * 6 + 140 * 12 + 40 * 15) throw new Error('volume errato')
  if (detail.entries[0].sets.length !== 3) throw new Error('serie perse')

  const list = listWorkouts(user.id)
  console.log('lista allenamenti:', list.map((w) => [w.date, w.name, w.sets, w.volume, w.muscles]))

  const stats = getStats(user.id, today)
  console.log('stats:', {
    workouts: stats.totalWorkouts,
    volume: stats.totalVolume,
    sets: stats.totalSets,
    week: stats.weekWorkouts,
    streak: stats.currentStreak,
    bestStreak: stats.bestStreak,
    muscles: stats.muscles.map((m) => [m.muscle, m.volume]),
    top: stats.topExercises.map((e) => [e.name, e.volume, e.bestWeight]),
  })
  if (stats.totalWorkouts !== 1) throw new Error('conteggio allenamenti errato')
  if (stats.muscles.length !== 2) throw new Error('gruppi muscolari errati')

  const last = lastPerformance(user.id, 'def-panca-piana')
  console.log('ultima performance panca:', last)

  // eliminazione esercizio usato bloccata
  let err = ''
  try {
    deleteExercise(user.id, custom.id)
  } catch (e) {
    err = (e as Error).message
  }
  console.log('delete esercizio usato:', err)
  if (!err) throw new Error('delete non bloccato')

  // modifica allenamento
  saveWorkout(user.id, {
    id,
    date: '2026-10-25',
    name: 'Push B',
    entries: [{ exerciseId: 'def-panca-piana', sets: [{ reps: 5, weight: 100 }] }],
  })
  const updated = getWorkout(user.id, id)
  console.log('dopo modifica:', updated?.date, updated?.name, updated?.sets, updated?.volume)
  if (updated?.volume !== 500) throw new Error('modifica non applicata')

  // errori attesi
  err = ''
  try {
    saveWorkout(user.id, { date: 'xx', entries: [] })
  } catch (e) {
    err = (e as Error).message
  }
  console.log('validazione data:', err)
  if (!err) throw new Error('data non validata')

  err = ''
  try {
    saveWorkout(user.id, { date: '2026-10-25', entries: [{ exerciseId: 'def-panca-piana', sets: [] }] })
  } catch (e) {
    err = (e as Error).message
  }
  console.log('validazione serie:', err)
  if (!err) throw new Error('serie vuote non validate')

  // ora l'esercizio custom non è più usato: si può eliminare
  deleteExercise(user.id, custom.id)
  console.log('delete esercizio libero: ok')

  // rinomina e pin
  renameUser(user.id, 'Marco R.')
  await updateUserPin(user.id, '999999')
  const u2 = listUsers()[0]
  console.log('rinomina + pin:', u2.name, '| nuovo pin ok:', await checkPin(u2, '999999'))

  deleteWorkout(user.id, id)
  console.log('dopo delete workout:', listWorkouts(user.id).length)

  await flush()
  console.log('\nSMOKE OK')
  process.exit(0)
}

main().catch((e) => {
  console.error('SMOKE FAIL', e)
  process.exit(1)
})
