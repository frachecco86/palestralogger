import { initDb, flush, getDb } from '../src/db/db'
import { applySyncPayload, buildSyncPayload } from '../src/db/sync-queries'
import {
  adoptLocalData,
  createUser,
  deleteExercisePhoto,
  getExercisePhoto,
  listExercisePhotoMeta,
  saveExercisePhoto,
  getUser,
  ensureLocalUser,
  resetLocalData,
  listUsers,
  checkPin,
  listExercises,
  saveWorkout,
  getWorkout,
  listWorkouts,
  getStats,
  lastPerformance,
  createExercise,
  updateExercise,
  deleteExercise,
  deleteWorkout,
  updateUserPin,
  renameUser,
} from '../src/db/queries'
import { migrateLegacyExercises } from '../src/lib/shared-exercises'
import { readShareQueue, writeShareQueue } from '../src/lib/shared-cache'

// localStorage minimale: serve per testare cache e coda della libreria comune
const localStore = new Map<string, string>()
;(globalThis as Record<string, unknown>).localStorage = {
  getItem: (key: string) => localStore.get(key) ?? null,
  setItem: (key: string, value: string) => {
    localStore.set(key, String(value))
  },
  removeItem: (key: string) => {
    localStore.delete(key)
  },
  clear: () => {
    localStore.clear()
  },
  key: (index: number) => [...localStore.keys()][index] ?? null,
  get length() {
    return localStore.size
  },
}

const today = '2026-10-26'

async function main() {
  await initDb()
  const user = await createUser('Marco Rossi', '4821')
  console.log('utente creato:', user.name, 'pinLength', user.pinLength)
  console.log('pin ok:', await checkPin(user, '4821'), '| pin errato:', await checkPin(user, '0000'))

  const exercises = listExercises(user.id)
  console.log('esercizi disponibili:', exercises.length, '| primi:', exercises.slice(0, 3).map((e) => e.name))
  if (exercises.length < 50) throw new Error('seed esercizi mancante')
  const deadlift = exercises.find((e) => e.id === 'def-stacco-terra')
  if (!deadlift?.alias.includes('deadlift')) throw new Error('alias dei seed mancante')
  console.log('alias seed stacco:', deadlift.alias)

  const custom = createExercise(user.id, 'Chest press inclinata', 'Petto', 'Macchina', 'reps', 'chest press, pressa petto')
  console.log('esercizio custom:', custom.name, custom.muscle, 'default?', custom.isDefault, '| alias:', custom.alias)
  if (custom.tracking !== 'reps') throw new Error('un esercizio con i pesi deve restare a ripetizioni')
  if (custom.alias !== 'chest press, pressa petto') throw new Error('alias non salvato')

  // alias nella ricerca e nella modifica (2.8.0)
  if (![custom.name, custom.alias, custom.equipment].some((v) => v.toLowerCase().includes('pressa petto'))) {
    throw new Error('la ricerca per alias non trova l’esercizio')
  }
  const customEdited = updateExercise(user.id, custom.id, { alias: 'chest press machine' })
  if (customEdited.alias !== 'chest press machine') throw new Error('alias non aggiornato')
  const syncedCustom = buildSyncPayload(user.id).exercises.find((e) => e.id === custom.id)
  if (syncedCustom?.alias !== 'chest press machine') throw new Error('alias non sincronizzato')
  updateExercise(user.id, custom.id, { alias: 'chest press, pressa petto' })

  // cardio: minuti al posto delle ripetizioni (2.6.0)
  const treadmill = exercises.find((e) => e.id === 'def-tapis-roulant')
  if (!treadmill || treadmill.tracking !== 'time') throw new Error('il cardio predefinito non è a minuti')
  const cardio = createExercise(user.id, 'Corsa in salita', 'Cardio', 'Tapis roulant')
  console.log('cardio custom:', cardio.name, '| misura:', cardio.tracking)
  if (cardio.tracking !== 'time') throw new Error('il cardio non parte in minuti')

  const switched = updateExercise(user.id, cardio.id, {
    name: 'Corsa in salita leggera',
    tracking: 'reps',
  })
  console.log('cardio modificato:', switched.name, '| misura:', switched.tracking)
  if (switched.tracking !== 'reps' || switched.name !== 'Corsa in salita leggera') {
    throw new Error('modifica della misura non applicata')
  }
  updateExercise(user.id, cardio.id, { tracking: 'time' })

  const syncedCardio = buildSyncPayload(user.id).exercises.find((e) => e.id === cardio.id)
  if (syncedCardio?.tracking !== 'time') throw new Error('la misura non viene sincronizzata')

  const cardioWorkoutId = saveWorkout(user.id, {
    date: '2026-10-23',
    name: 'Cardio',
    entries: [{ exerciseId: 'def-tapis-roulant', sets: [{ reps: 30, weight: 0 }] }],
  })
  const cardioWorkout = getWorkout(user.id, cardioWorkoutId)
  console.log(
    'cardio in allenamento: minuti',
    cardioWorkout?.entries[0].sets[0].reps,
    '| volume',
    cardioWorkout?.volume,
  )
  if (cardioWorkout?.volume !== 0) throw new Error('i minuti del cardio sporcano il volume')
  deleteWorkout(user.id, cardioWorkoutId)

  let trackedErr = ''
  try {
    updateExercise(user.id, 'def-tapis-roulant', { tracking: 'reps' })
  } catch (e) {
    trackedErr = (e as Error).message
  }
  console.log('modifica esercizio predefinito:', trackedErr)
  if (!trackedErr) throw new Error('gli esercizi predefiniti non devono essere modificabili')

  deleteExercise(user.id, cardio.id)
  console.log('cardio eliminato: ok')

  // libreria comune: l'esercizio condiviso è di tutti ma resta governato dall'autore
  const sharedId = 'shared-test-1'
  getDb().run(
    `INSERT INTO exercises (id, user_id, name, muscle, equipment, tracking, is_default, created_at, updated_at)
     VALUES (?, NULL, 'Rematore Kayak', 'Schiena', 'Manubri', 'reps', 0, ?, ?)`,
    [sharedId, '2026-01-02T10:00:00.000Z', '2026-01-02T10:00:00.000Z'],
  )
  if (!listExercises(user.id).some((e) => e.id === sharedId)) {
    throw new Error('esercizio della libreria comune non visibile')
  }
  if (buildSyncPayload(user.id).exercises.some((e) => e.id === sharedId)) {
    throw new Error('esercizio condiviso finito nel payload personale')
  }
  let sharedErr = ''
  try {
    updateExercise(user.id, sharedId, { name: 'Altro nome' })
  } catch (e) {
    sharedErr = (e as Error).message
  }
  console.log('modifica esercizio condiviso da non autore:', sharedErr)
  if (!sharedErr) throw new Error('esercizio condiviso modificabile da chiunque')
  sharedErr = ''
  try {
    deleteExercise(user.id, sharedId)
  } catch (e) {
    sharedErr = (e as Error).message
  }
  console.log('delete esercizio condiviso:', sharedErr)
  if (!sharedErr) throw new Error('esercizio condiviso eliminabile')
  getDb().run('DELETE FROM exercises WHERE id = ?', [sharedId])

  // migrazione una tantum: gli esercizi creati prima della 2.7.0 vanno in coda
  const legacyId = 'legacy-share-1'
  getDb().run(
    `INSERT INTO exercises (id, user_id, name, muscle, equipment, tracking, is_default, created_at, updated_at)
     VALUES (?, ?, 'Legacy Press', 'Petto', 'Macchina', 'reps', 0, ?, ?)`,
    [legacyId, user.id, '2026-10-01T10:00:00.000Z', '2026-10-01T10:00:00.000Z'],
  )
  localStorage.setItem('palestralogger:account-token', 'token-di-prova-0123456789abcdef')
  await migrateLegacyExercises(user.id)
  let shareQueue = readShareQueue(user.id)
  console.log('coda condivisione legacy:', shareQueue)
  if (!shareQueue.some((item) => item.exerciseId === legacyId && item.action === 'publish')) {
    throw new Error('esercizio creato prima della 2.7.0 non accodato')
  }
  // la migrazione non deve ripetersi a ogni avvio
  await migrateLegacyExercises(user.id)
  shareQueue = readShareQueue(user.id)
  if (shareQueue.filter((item) => item.exerciseId === legacyId).length !== 1) {
    throw new Error('migrazione degli esercizi legacy duplicata')
  }
  // un esercizio legacy che arriva dopo (altra copia/dispositivo) viene preso al giro dopo
  const legacyLateId = 'legacy-share-2'
  getDb().run(
    `INSERT INTO exercises (id, user_id, name, muscle, equipment, tracking, is_default, created_at, updated_at)
     VALUES (?, ?, 'Legacy Row', 'Schiena', 'Cavi', 'time', 0, ?, ?)`,
    [legacyLateId, user.id, '2026-09-15T09:00:00.000Z', '2026-09-15T09:00:00.000Z'],
  )
  await migrateLegacyExercises(user.id)
  shareQueue = readShareQueue(user.id)
  if (!shareQueue.some((item) => item.exerciseId === legacyLateId)) {
    throw new Error('esercizio legacy arrivato dopo non accodato')
  }
  getDb().run('DELETE FROM exercises WHERE id = ?', [legacyLateId])
  getDb().run('DELETE FROM exercises WHERE id = ?', [legacyId])
  writeShareQueue(user.id, [])
  localStorage.clear()
  console.log('migrazione legacy: OK')

  const id = saveWorkout(user.id, {
    date: '2026-10-24',
    name: 'Push A',
    notes: 'buone sensazioni',
    entries: [
      {
        exerciseId: 'def-panca-piana',
        notes: 'Presa larga, spalle basse',
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
  console.log('note esercizio:', JSON.stringify(detail.entries[0].notes), '| senza nota:', JSON.stringify(detail.entries[1].notes))
  if (detail.entries[0].notes !== 'Presa larga, spalle basse') throw new Error('nota esercizio persa')
  if (detail.entries[1].notes !== '') throw new Error('nota esercizio inventata')

  // aggiornando l'allenamento la nota si modifica e si può svuotare
  saveWorkout(user.id, {
    id,
    date: '2026-10-24',
    name: 'Push A',
    notes: 'buone sensazioni',
    entries: [
      { exerciseId: 'def-panca-piana', notes: '  Presa stretta  ', sets: [{ reps: 10, weight: 80 }] },
      { exerciseId: 'def-leg-press', notes: '', sets: [{ reps: 12, weight: 140 }] },
      { exerciseId: custom.id, sets: [{ reps: 15, weight: 40 }] },
    ],
  })
  const edited = getWorkout(user.id, id)
  if (edited?.entries[0].notes !== 'Presa stretta') {
    throw new Error('nota esercizio non aggiornata: ' + JSON.stringify(edited?.entries[0].notes))
  }
  if (edited.entries.some((e) => e.notes !== '' && e.exercise.id !== 'def-panca-piana')) {
    throw new Error('nota rimasta su un altro esercizio')
  }
  // ripristino i contenuti originali per i controlli successivi
  saveWorkout(user.id, {
    id,
    date: '2026-10-24',
    name: 'Push A',
    notes: 'buone sensazioni',
    entries: [
      {
        exerciseId: 'def-panca-piana',
        notes: 'Presa larga, spalle basse',
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
}

// ---- sync: costruzione payload e merge ----
async function smokeSync() {
  const users = listUsers()
  const user = users[0]
  const payload = buildSyncPayload(user.id)
  console.log('\nsync payload:', {
    profile: payload.profile.name,
    exercises: payload.exercises.length,
    workouts: payload.workouts.length,
    tombstones: payload.tombstones.length,
  })
  if (payload.profile.id !== user.id) throw new Error('profilo sync errato')

  // allenamento locale da far "vincere" al remoto
  const localId = saveWorkout(user.id, {
    date: '2026-10-01',
    name: 'Da aggiornare',
    entries: [{ exerciseId: 'def-leg-press', sets: [{ reps: 10, weight: 100 }] }],
  })
  const base = getWorkout(user.id, localId)
  if (!base) throw new Error('workout locale mancante')

  // timestamp futuro: il remoto deve vincere indipendentemente dalla data del test
  const FUTURE = new Date(Date.now() + 86_400_000).toISOString()
  const remoteNewId = 'remote-workout-1'
  const remoteExerciseId = 'remote-ex-1'
  const remote = {
    version: 1 as const,
    profile: payload.profile,
    exercises: [
      {
        id: remoteExerciseId,
        name: 'Rematore remoto',
        muscle: 'Schiena' as const,
        equipment: 'Manubri',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
    ],
    workouts: [
      {
        ...base,
        name: 'Aggiornato dal telefono',
        notes: 'nota remota',
        updatedAt: FUTURE,
        sets: base.entries.flatMap((entry, entryIndex) =>
          entry.sets.map((s, setIndex) => ({
            id: `remote-set-${entryIndex}-${setIndex}`,
            exerciseId: entry.exercise.id,
            entryIndex,
            setIndex,
            reps: 12,
            weight: 110,
            rpe: 8,
          })),
        ),
        entryNotes: base.entries.map((entry, entryIndex) => ({
          exerciseId: entry.exercise.id,
          entryIndex,
          note: entryIndex === 0 ? 'Nota remota sulla panca' : '',
        })),
      },
      {
        id: remoteNewId,
        date: '2026-10-26',
        name: 'Nuovo dal cloud',
        notes: '',
        createdAt: '2026-10-26T10:00:00.000Z',
        updatedAt: '2026-10-26T10:00:00.000Z',
        sets: [
          { id: 'rns1', exerciseId: remoteExerciseId, entryIndex: 0, setIndex: 0, reps: 8, weight: 30, rpe: null },
        ],
      },
    ],
    tombstones: [
      { kind: 'workout' as const, id: 'workout-da-eliminare', deletedAt: '2026-10-26T12:00:00.000Z' },
    ],
    savedAt: '2026-10-27T10:00:00.000Z',
  }

  // tombstone per un workout locale esistente
  const doomedId = saveWorkout(user.id, {
    date: '2026-10-02',
    entries: [{ exerciseId: 'def-panca-piana', sets: [{ reps: 5, weight: 60 }] }],
  })
  remote.tombstones.push({ kind: 'workout' as const, id: doomedId, deletedAt: FUTURE })

  const merged = applySyncPayload(user.id, remote)
  const updated = getWorkout(user.id, localId)
  console.log('merge workout aggiornato:', updated?.name, updated?.notes, updated?.sets, updated?.volume)
  if (updated?.name !== 'Aggiornato dal telefono') throw new Error('merge non ha applicato il remoto più recente')
  if (updated?.volume !== 1 * 12 * 110) throw new Error('serie remote non applicate')
  if (updated?.entries[0].notes !== 'Nota remota sulla panca') throw new Error('note esercizio remote non applicate')
  if (merged.workouts.find((w) => w.id === localId)?.entryNotes?.length !== 1) {
    throw new Error('note esercizio non propagate nel payload')
  }
  if (getWorkout(user.id, remoteNewId) === null) throw new Error('workout remoto non importato')
  if (getWorkout(user.id, doomedId) !== null) throw new Error('tombstone non applicato')
  if (!merged.exercises.some((e) => e.id === remoteExerciseId)) throw new Error('esercizio remoto non importato')
  if (!merged.tombstones.some((t) => t.id === doomedId)) throw new Error('tombstone non propagato')

  // il remoto vecchio non deve sovrascrivere il locale più recente
  const older = {
    ...remote,
    id: undefined,
    workouts: [
      {
        ...updated!,
        name: 'Vecchio remoto',
        updatedAt: '2020-01-01T00:00:00.000Z',
        sets: updated!.entries.flatMap((entry, entryIndex) =>
          entry.sets.map((s, setIndex) => ({
            id: `old-${entryIndex}-${setIndex}`,
            exerciseId: entry.exercise.id,
            entryIndex,
            setIndex,
            reps: 1,
            weight: 1,
            rpe: null,
          })),
        ),
      },
    ],
    exercises: [],
    tombstones: [],
    savedAt: '2020-01-01T00:00:00.000Z',
  }
  applySyncPayload(user.id, older as typeof remote)
  const stillNew = getWorkout(user.id, localId)
  if (stillNew?.name !== 'Aggiornato dal telefono') throw new Error('il remoto vecchio ha sovrascritto il locale')

  // profilo remoto più recente (nome)
  applySyncPayload(user.id, {
    ...payload,
    profile: {
      ...payload.profile,
      name: 'Marco Cloud',
      updatedAt: FUTURE,
    },
    exercises: [],
    workouts: [],
    tombstones: [],
    savedAt: FUTURE,
  })
  const syncedUser = listUsers().find((u) => u.id === user.id)
  console.log('profilo sync:', syncedUser?.name)
  if (syncedUser?.name !== 'Marco Cloud') {
    throw new Error('profilo remoto non applicato')
  }

  console.log('sync merge: OK')
}

// ---- account: adozione dei dati locali (profilo 1.x -> account cloud) ----
async function smokeAccount() {
  resetLocalData()
  const legacy = await createUser('Profilo Vecchio', '1234')
  saveWorkout(legacy.id, {
    date: '2026-10-01',
    name: 'Legacy A',
    entries: [{ exerciseId: 'def-panca-piana', sets: [{ reps: 8, weight: 80 }] }],
  })
  saveWorkout(legacy.id, {
    date: '2026-10-02',
    name: 'Legacy B',
    entries: [{ exerciseId: 'def-squat-bilanciere', sets: [{ reps: 5, weight: 120 }] }],
  })

  saveExercisePhoto(legacy.id, 'def-panca-piana', 'image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 1]))
  const adopted = adoptLocalData('account-1', 'Account Cloud')
  const user = getUser('account-1')
  console.log('adozione locale:', adopted, '| profilo:', user?.name, '| workout:', listWorkouts('account-1').length)
  if (!adopted) throw new Error('dati locali non adottati')
  if (user?.name !== 'Account Cloud') throw new Error('nome account non applicato')
  if (listWorkouts('account-1').length !== 2) throw new Error('allenamenti non migrati')
  if (getUser(legacy.id)) throw new Error('vecchio profilo non rimosso')
  if (listExercisePhotoMeta('account-1').length !== 1) throw new Error('foto non migrata con i dati')

  // un secondo account sullo stesso telefono non deve vedere i dati del primo
  resetLocalData()
  ensureLocalUser({ id: 'account-2', name: 'Altro' })
  if (listWorkouts('account-2').length !== 0) throw new Error('dati non azzerati')
  console.log('account switch: OK')

  saveExercisePhoto('account-2', 'def-panca-piana', 'image/jpeg', new Uint8Array([1, 2, 3, 4]))
  const photo = getExercisePhoto('account-2', 'def-panca-piana')
  console.log('foto locale:', photo?.mime, photo?.bytes.length)
  if (!photo || photo.bytes.length !== 4) throw new Error('foto non salvata')
  if (!listExercisePhotoMeta('account-2').some((m) => m.exerciseId === 'def-panca-piana')) {
    throw new Error('metadati foto mancanti')
  }
  deleteExercisePhoto('account-2', 'def-panca-piana')
  if (getExercisePhoto('account-2', 'def-panca-piana')) throw new Error('foto non eliminata')
  saveExercisePhoto('account-2', 'def-panca-piana', 'image/jpeg', new Uint8Array([9]))
  resetLocalData()
  if (listExercisePhotoMeta('account-2').length !== 0) throw new Error('reset non ha pulito le foto')
  console.log('foto locali: OK')
}

main()
  .then(() => smokeSync())
  .then(() => smokeAccount())
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('SMOKE FAIL', e)
    process.exit(1)
  })
