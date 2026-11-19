import { useEffect, useMemo, useRef, useState } from 'react'
import type { Exercise, ExerciseTracking, Muscle, User } from '../lib/types'
import { MUSCLES, MUSCLE_COLORS, defaultTracking, isSharedExercise } from '../lib/types'
import {
  createExercise,
  deleteExercise,
  getExercise,
  getExerciseAggregates,
  getExerciseHistory,
  getExercisePhoto,
  listExercisePhotoMeta,
  listExercises,
  updateExercise,
  type ExercisePhoto,
} from '../db/queries'
import { addExercisePhoto, canManagePhoto, removeExercisePhoto, syncPhotos } from '../lib/photo'
import { isAdmin } from '../lib/account'
import { isSharedAuthor, sharedAuthorName } from '../lib/shared-cache'
import {
  deleteSharedExercise,
  shareExercise,
  syncSharedExercises,
  unshareExercise,
} from '../lib/shared-exercises'
import { formatDate } from '../lib/dates'
import { formatKg, formatWeight, plural } from '../lib/format'
import { toast, useLiveData } from '../lib/live'
import { ExercisePhotoLarge, ExerciseThumb } from '../components/ExercisePhoto'
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Icon,
  Sheet,
  Toggle,
  TrackingPicker,
  TrackingTag,
  cx,
  inputClass,
} from '../components/ui'

export function ExercisesScreen({
  user,
  onQuickAdd,
}: {
  user: User
  onQuickAdd: (exerciseId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'Tutti'>('Tutti')
  const [detail, setDetail] = useState<Exercise | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMuscle, setNewMuscle] = useState<Muscle>('Altro')
  const [newEquipment, setNewEquipment] = useState('')
  // alias: altri nomi per trovare l'esercizio nella ricerca
  const [newAlias, setNewAlias] = useState('')
  // Ripetizioni o minuti: il cardio parte in minuti, poi si può cambiare.
  const [newTracking, setNewTracking] = useState<ExerciseTracking>('reps')
  const [newTrackingTouched, setNewTrackingTouched] = useState(false)
  // di base i nuovi esercizi entrano nella libreria comune
  const [newShared, setNewShared] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  // Modifica di un esercizio personale (nome, gruppo, attrezzatura, misura)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editMuscle, setEditMuscle] = useState<Muscle>('Altro')
  const [editEquipment, setEditEquipment] = useState('')
  const [editAlias, setEditAlias] = useState('')
  const [editTracking, setEditTracking] = useState<ExerciseTracking>('reps')
  const [editShared, setEditShared] = useState(false)
  const [editErr, setEditErr] = useState<string | null>(null)
  // Foto: l'amministratore gestisce quelle della libreria, ogni utente quelle
  // degli esercizi che ha creato (vedi canManagePhoto).
  const photoInputRef = useRef<HTMLInputElement>(null)
  const photoTarget = useRef<string | null>(null)
  const newPhotoInputRef = useRef<HTMLInputElement>(null)
  const [newPhoto, setNewPhoto] = useState<{ file: File; url: string } | null>(null)

  function readLocalPhotos(): Record<string, ExercisePhoto> {
    const map: Record<string, ExercisePhoto> = {}
    for (const meta of listExercisePhotoMeta(user.id)) {
      const photo = getExercisePhoto(user.id, meta.exerciseId)
      if (photo) map[meta.exerciseId] = photo
    }
    return map
  }

  const [photos, setPhotos] = useState<Record<string, ExercisePhoto>>(readLocalPhotos)

  // L'amministratore può eliminare qualsiasi esercizio, anche quelli della
  // libreria comune proposti da altri account (moderazione).
  const admin = isAdmin()

  const exercises = useLiveData(() => listExercises(user.id), [user.id])
  const aggregates = useLiveData(() => getExerciseAggregates(user.id, 500), [user.id])
  const aggMap = useMemo(() => new Map(aggregates.map((a) => [a.exerciseId, a])), [aggregates])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    return exercises
      .filter((e) => (muscle === 'Tutti' ? true : e.muscle === muscle))
      .filter((e) =>
        q
          ? [e.name, e.alias, e.equipment].some((value) => value.toLowerCase().includes(q))
          : true,
      )
      .sort((a, b) => {
        if (a.muscle !== b.muscle) return MUSCLES.indexOf(a.muscle) - MUSCLES.indexOf(b.muscle)
        const la = aggMap.get(a.id)?.lastDate ?? ''
        const lb = aggMap.get(b.id)?.lastDate ?? ''
        if (la !== lb) return lb.localeCompare(la)
        return a.name.localeCompare(b.name, 'it')
      })
  }, [exercises, muscle, q, aggMap])

  const grouped = useMemo(() => {
    const groups: Array<{ muscle: Muscle; items: Exercise[] }> = []
    for (const e of filtered) {
      let g = groups.find((x) => x.muscle === e.muscle)
      if (!g) {
        g = { muscle: e.muscle, items: [] }
        groups.push(g)
      }
      g.items.push(e)
    }
    return groups
  }, [filtered])

  const usedCount = exercises.filter((e) => aggMap.has(e.id)).length

  // Libreria comune: all'apertura si allinea (la cache evita richieste continue)
  useEffect(() => {
    void syncSharedExercises(user.id).catch(() => {
      /* offline: si riprova dal ciclo di sincronizzazione */
    })
  }, [user.id])

  // Scarica dal cloud le foto mancanti degli esercizi visibili (a blocchi,
  // per non pesare sulla rete con l'intera libreria).
  const visibleIds = useMemo(() => filtered.slice(0, 24).map((e) => e.id), [filtered])
  const visibleKey = visibleIds.join('|')
  useEffect(() => {
    if (visibleIds.length === 0) return
    let alive = true
    // attesa breve: mentre si cerca non si martella il server a ogni tasto
    const timer = setTimeout(() => {
      void syncPhotos(user.id, visibleIds)
        .then((changed) => {
          if (alive && changed.length > 0) setPhotos(readLocalPhotos())
        })
        .catch(() => {
          /* offline: restano le foto già presenti */
        })
    }, 700)
    return () => {
      alive = false
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, visibleKey])

  // Aprendo l'esercizio si assicura che la sua foto sia aggiornata.
  const detailId = detail?.id
  useEffect(() => {
    if (!detailId) return
    let alive = true
    void syncPhotos(user.id, [detailId])
      .then((changed) => {
        if (alive && changed.length > 0) setPhotos(readLocalPhotos())
      })
      .catch(() => {
        /* offline */
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, detailId])

  function pickPhoto(exerciseId: string) {
    photoTarget.current = exerciseId
    photoInputRef.current?.click()
  }

  async function handlePhotoFile(file: File) {
    const exerciseId = photoTarget.current
    photoTarget.current = null
    if (!exerciseId) return
    try {
      const { uploaded } = await addExercisePhoto(user.id, exerciseId, file)
      const photo = getExercisePhoto(user.id, exerciseId)
      if (photo) setPhotos((prev) => ({ ...prev, [exerciseId]: photo }))
      toast(
        uploaded
          ? 'Foto salvata'
          : 'Foto salvata sul telefono: sarà caricata appena torni online',
      )
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Foto non salvata', 'err')
    }
  }

  async function handleRemovePhoto(exerciseId: string) {
    try {
      await removeExercisePhoto(user.id, exerciseId)
      setPhotos((prev) => {
        const next = { ...prev }
        delete next[exerciseId]
        return next
      })
      toast('Foto rimossa')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Rimozione non riuscita', 'err')
    }
  }

  function resetCreate() {
    setCreating(false)
    setNewName('')
    setNewMuscle('Altro')
    setNewEquipment('')
    setNewAlias('')
    setNewTracking('reps')
    setNewTrackingTouched(false)
    setNewShared(true)
    setErr(null)
    clearNewPhoto()
  }

  /** Cambiando gruppo muscolare la misura si adegua finché non la scegli a mano. */
  function chooseNewMuscle(m: Muscle) {
    setNewMuscle(m)
    if (!newTrackingTouched) setNewTracking(defaultTracking(m))
  }

  function startEdit(exercise: Exercise) {
    setEditName(exercise.name)
    setEditMuscle(exercise.muscle)
    setEditEquipment(exercise.equipment)
    setEditAlias(exercise.alias)
    setEditTracking(exercise.tracking)
    setEditShared(isSharedExercise(exercise))
    setEditErr(null)
    setEditing(true)
  }

  async function handleEdit() {
    if (!detail) return
    const wasShared = isSharedExercise(detail)
    try {
      const updated = updateExercise(user.id, detail.id, {
        name: editName,
        alias: editAlias,
        muscle: editMuscle,
        equipment: editEquipment,
        tracking: editTracking,
      })
      setDetail(updated)
      setEditing(false)

      let message = 'Esercizio aggiornato'
      if (editShared) {
        try {
          const outcome = await shareExercise(user.id, updated.id)
          message =
            outcome === 'published'
              ? 'Esercizio aggiornato e disponibile a tutti'
              : 'Esercizio aggiornato: condivisione in coda, riparte online'
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Condivisione non riuscita', 'err')
        }
      } else if (wasShared) {
        try {
          const outcome = await unshareExercise(user.id, updated.id)
          message =
            outcome === 'removed'
              ? 'Esercizio non più condiviso con tutti'
              : 'Esercizio aggiornato: ritiro in coda, riparte online'
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Ritiro non riuscito', 'err')
        }
      }
      toast(message)
      const fresh = getExercise(updated.id)
      if (fresh) setDetail(fresh)
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : 'Errore')
    }
  }

  function chooseNewPhoto(file: File) {
    if (!file.type.startsWith('image/')) {
      setErr('Il file scelto non è un’immagine')
      return
    }
    setErr(null)
    setNewPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return { file, url: URL.createObjectURL(file) }
    })
  }

  function clearNewPhoto() {
    setNewPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url)
      return null
    })
  }

  function handleCreate() {
    // il File resta valido anche dopo aver liberato l'anteprima
    const file = newPhoto?.file ?? null
    const shareNow = newShared
    try {
      const ex = createExercise(
        user.id,
        newName,
        newMuscle,
        newEquipment,
        newTracking,
        newAlias,
      )
      toast('Esercizio aggiunto')
      resetCreate()
      setDetail(ex)
      void (async () => {
        if (file) {
          // compressione e caricamento in background: non bloccano la creazione
          try {
            await addExercisePhoto(user.id, ex.id, file)
            const photo = getExercisePhoto(user.id, ex.id)
            if (photo) setPhotos((prev) => ({ ...prev, [ex.id]: photo }))
            toast('Foto salvata')
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Foto non salvata', 'err')
          }
        }
        if (!shareNow) return
        try {
          const outcome = await shareExercise(user.id, ex.id)
          toast(
            outcome === 'published'
              ? 'Esercizio disponibile a tutti'
              : 'Condivisione in coda: riparte appena torni online',
          )
        } catch (e) {
          toast(e instanceof Error ? e.message : 'Condivisione non riuscita', 'err')
        }
        const fresh = getExercise(ex.id)
        if (fresh) setDetail((prev) => (prev?.id === ex.id ? fresh : prev))
      })()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Errore')
    }
  }

  async function handleDelete() {
    if (!detail) return
    const target = detail
    setConfirmDelete(false)
    try {
      if (isSharedExercise(target) || target.isDefault) {
        const outcome = await deleteSharedExercise(user.id, target.id)
        toast(
          outcome === 'queued'
            ? 'Eliminazione in coda: riparte appena torni online'
            : target.isDefault
              ? 'Esercizio rimosso per tutti gli account'
              : 'Esercizio eliminato dalla libreria comune',
        )
      } else {
        deleteExercise(user.id, target.id)
        toast('Esercizio eliminato')
      }
      setDetail(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Errore', 'err')
    }
  }

  const detailAgg = detail ? aggMap.get(detail.id) : undefined
  const history = useLiveData(
    () => (detail ? getExerciseHistory(user.id, detail.id, 12) : []),
    [user.id, detail?.id],
  )
  // il cardio non ha carichi: il grafico mostra i minuti per sessione
  const timedDetail = detail?.tracking === 'time'
  const historyValue = (h: { bestWeight: number; reps: number }) =>
    timedDetail ? h.reps : h.bestWeight
  const maxHistory = Math.max(1, ...history.map(historyValue))

  // Esercizio della libreria comune: solo l'autore (o l'admin) lo può modificare
  const detailShared = detail ? isSharedExercise(detail) : false
  const detailMine = !!detail && detail.userId === user.id
  const detailAuthor = !!detail && detailShared && isSharedAuthor(detail.id, user.id)
  const detailAuthorName = detail && detailShared ? sharedAuthorName(detail.id) : ''

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-end justify-between gap-2">
        <div>
          <p className="text-[11.5px] uppercase tracking-[0.1em] text-muted">Libreria</p>
          <h1 className="mt-0.5 text-[24px] font-bold leading-tight tracking-tight">Esercizi</h1>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {exercises.length} disponibili · {usedCount} già usati
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setCreating(true)}>
          <Icon name="plus" size={15} /> Nuovo
        </Button>
      </header>

      <div className="relative mt-3">
        <Icon
          name="search"
          size={17}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          className={cx(inputClass, 'pl-10')}
          placeholder="Cerca un esercizio…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          inputMode="search"
        />
      </div>

      <div className="mt-2 -mx-4 flex gap-1.5 overflow-x-auto no-scrollbar px-4 pb-1">
        <Chip active={muscle === 'Tutti'} onClick={() => setMuscle('Tutti')}>
          Tutti
        </Chip>
        {MUSCLES.map((m) => (
          <Chip key={m} active={muscle === m} dot={MUSCLE_COLORS[m]} onClick={() => setMuscle(m)}>
            {m}
          </Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Card className="mt-3">
          <EmptyState
            icon="search"
            title="Nessun esercizio"
            text="Prova con un altro termine o crea un esercizio personalizzato."
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Icon name="plus" size={15} /> Crea esercizio
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="mt-2 space-y-4">
          {grouped.map((group) => (
            <section key={group.muscle}>
              <div className="mb-1.5 flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: MUSCLE_COLORS[group.muscle] }}
                />
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.09em] text-muted">
                  {group.muscle}
                </h2>
                <span className="text-[10px] text-faint">{group.items.length}</span>
              </div>
              <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
                {group.items.map((e) => {
                  const agg = aggMap.get(e.id)
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setDetail(e)}
                      className="press flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-surface2/50"
                    >
                      <ExerciseThumb
                        photo={photos[e.id]}
                        placeholder
                        size="md"
                        name={e.name}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium">{e.name}</span>
                          <TrackingTag tracking={e.tracking} />
                          {!e.isDefault && e.userId === user.id && (
                            <Badge color="#7CFFB2">tuo</Badge>
                          )}
                          {isSharedExercise(e) && <Badge color="#5FD4FF">condiviso</Badge>}
                        </div>
                        <p className="text-[10.5px] text-faint">
                          {e.equipment || e.muscle}
                          {agg ? ` · ${plural(agg.sessions, 'volta', 'volte')} · ${formatDate(agg.lastDate)}` : ' · mai usato'}
                        </p>
                      </div>
                      {agg && agg.bestWeight > 0 && (
                        <span className="shrink-0 text-[11px] font-semibold tabular text-lime/90">
                          {formatWeight(agg.bestWeight)} kg
                        </span>
                      )}
                      <Icon name="right" size={14} className="shrink-0 text-faint" />
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* dettaglio esercizio */}
      <Sheet
        open={!!detail}
        onClose={() => {
          setDetail(null)
          setEditing(false)
        }}
        title={detail?.name}
      >
        {detail && (
          <div className="pb-5">
            <ExercisePhotoLarge photo={photos[detail.id]} name={detail.name} className="h-56" />

            {canManagePhoto(detail.id) && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  full
                  onClick={() => pickPhoto(detail.id)}
                  ariaLabel={
                    photos[detail.id]
                      ? `Sostituisci foto di ${detail.name}`
                      : `Aggiungi foto a ${detail.name}`
                  }
                >
                  <Icon name="camera" size={15} />
                  {photos[detail.id] ? 'Sostituisci foto' : 'Aggiungi foto'}
                </Button>
                {photos[detail.id] && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => void handleRemovePhoto(detail.id)}
                    ariaLabel={`Rimuovi foto di ${detail.name}`}
                  >
                    <Icon name="trash" size={15} />
                  </Button>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: MUSCLE_COLORS[detail.muscle] }}
              />
              <span className="text-[12px] text-muted">
                {detail.muscle}
                {detail.equipment ? ` · ${detail.equipment}` : ''}
              </span>
              {detail.tracking === 'time' && <TrackingTag tracking={detail.tracking} />}
              {detailMine && <Badge color="#7CFFB2">personalizzato</Badge>}
              {detailShared && <Badge color="#5FD4FF">condiviso</Badge>}
            </div>
            {detail.alias && (
              <p className="mt-1 text-[10.5px] text-faint">
                <Icon name="search" size={11} className="mr-1 inline align-[-1px]" />
                Si trova anche come: {detail.alias}
              </p>
            )}
            {detailShared && detailAuthorName && (
              <p className="mt-1 flex items-center gap-1.5 text-[10.5px] text-faint">
                <Icon name="users" size={12} /> Disponibile a tutti · condiviso da{' '}
                {detailAuthorName}
              </p>
            )}

            <div className="mt-3 grid grid-cols-4 divide-x divide-line rounded-xl border border-line bg-surface2/60">
              {[
                { l: 'Sessioni', v: String(detailAgg?.sessions ?? 0) },
                { l: 'Serie', v: String(detailAgg?.sets ?? 0) },
                ...(timedDetail
                  ? [
                      { l: 'Minuti', v: `${detailAgg?.totalReps ?? 0}` },
                      {
                        l: 'Media',
                        v: detailAgg?.sessions
                          ? `${Math.round((detailAgg.totalReps ?? 0) / detailAgg.sessions)} min`
                          : '—',
                      },
                    ]
                  : [
                      { l: 'Volume', v: formatKg(detailAgg?.volume ?? 0) },
                      {
                        l: 'Max',
                        v: detailAgg?.bestWeight
                          ? `${formatWeight(detailAgg.bestWeight)} kg`
                          : '—',
                      },
                    ]),
              ].map((s) => (
                <div key={s.l} className="px-1 py-2 text-center">
                  <p className="text-[12px] font-bold tabular leading-tight">{s.v}</p>
                  <p className="text-[9px] uppercase tracking-wide text-faint mt-0.5">{s.l}</p>
                </div>
              ))}
            </div>

            {history.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {timedDetail ? 'Minuti per sessione' : 'Carico massimo per sessione'}
                </p>
                <div className="mt-2 flex h-20 items-end gap-1 rounded-xl border border-line bg-surface2/40 p-2">
                  {history.map((h) => (
                    <div key={h.date} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <div
                        className="w-full rounded-sm bg-lime/70"
                        style={{ height: Math.max(2, Math.round((historyValue(h) / maxHistory) * 52)) }}
                        title={`${formatDate(h.date)}: ${
                          timedDetail
                            ? `${h.reps} min`
                            : `${formatWeight(h.bestWeight)} kg`
                        }`}
                      />
                      <span className="text-[8px] tabular text-faint">{h.date.slice(8)}</span>
                    </div>
                  ))}
                </div>
                {history.length >= 2 && (
                  <p className="mt-1.5 text-[10.5px] text-faint">
                    {timedDetail
                      ? `${history[0].reps} min (${formatDate(history[0].date)}) → ${
                          history[history.length - 1].reps
                        } min (${formatDate(history[history.length - 1].date)})`
                      : `${formatWeight(history[0].bestWeight)} kg (${formatDate(
                          history[0].date,
                        )}) → ${formatWeight(history[history.length - 1].bestWeight)} kg (${formatDate(
                          history[history.length - 1].date,
                        )})`}
                  </p>
                )}
              </div>
            )}

            {detailAgg && detailAgg.lastDate && (
              <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-muted">
                <Icon name="clock" size={13} /> Ultima volta il {formatDate(detailAgg.lastDate)}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <Button className="flex-1" onClick={() => onQuickAdd(detail.id)}>
                <Icon name="plus" size={16} /> Usa in allenamento
              </Button>
              {(detailMine || detailAuthor) && (
                <Button
                  variant="secondary"
                  onClick={() => startEdit(detail)}
                  ariaLabel={`Modifica ${detail.name}`}
                >
                  <Icon name="edit" size={16} /> Modifica
                </Button>
              )}
              {detailMine || admin ? (
                <Button
                  variant="danger"
                  onClick={() => setConfirmDelete(true)}
                  ariaLabel={`Elimina ${detail.name}`}
                >
                  <Icon name="trash" size={16} />
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Sheet>

      {/* creazione */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handlePhotoFile(file)
          e.target.value = ''
        }}
      />

      <input
        ref={newPhotoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) chooseNewPhoto(file)
          e.target.value = ''
        }}
      />

      <Sheet open={creating} onClose={resetCreate} title="Nuovo esercizio">
        <div className="space-y-4 pb-5">
          <Field label="Nome">
            <input
              className={inputClass}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Es. Chest press inclinata"
              autoFocus
              maxLength={48}
            />
          </Field>
          <Field label="Alias" hint="facoltativo — altri nomi per la ricerca">
            <input
              className={inputClass}
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              placeholder="Es. bench press, panca, distensioni…"
              maxLength={64}
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
              Gruppo muscolare
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLES.map((m) => (
                <Chip
                  key={m}
                  active={newMuscle === m}
                  dot={MUSCLE_COLORS[m]}
                  onClick={() => chooseNewMuscle(m)}
                >
                  {m}
                </Chip>
              ))}
            </div>
          </div>
          <TrackingPicker
            value={newTracking}
            onChange={(value) => {
              setNewTracking(value)
              setNewTrackingTouched(true)
            }}
            hint={
              newMuscle === 'Cardio'
                ? 'Cardio: in allenamento si scelgono i minuti, senza ripetizioni né peso.'
                : 'Con «Minuti» l’esercizio si registra a tempo (cardio o lavoro isometrico).'
            }
          />
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-2.5">
            <Icon name="users" size={16} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium">Disponibile a tutti</p>
              <p className="text-[10.5px] leading-tight text-faint">
                {newShared
                  ? 'Entra nella libreria comune: lo vedono tutti gli account'
                  : 'Resta solo nel tuo account'}
              </p>
            </div>
            <Toggle checked={newShared} onChange={setNewShared} label="Disponibile a tutti" />
          </div>
          <Field label="Attrezzatura" hint="facoltativa">
            <input
              className={inputClass}
              value={newEquipment}
              onChange={(e) => setNewEquipment(e.target.value)}
              placeholder="Bilanciere, manubri, macchina…"
              maxLength={32}
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
              Foto <span className="text-[10.5px] normal-case tracking-normal text-faint">facoltativa</span>
            </span>
            {newPhoto ? (
              <div className="relative overflow-hidden rounded-2xl border border-line bg-surface2">
                <img src={newPhoto.url} alt="Anteprima foto" className="h-36 w-full object-cover" />
                <div className="absolute right-2 top-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => newPhotoInputRef.current?.click()}
                    aria-label="Cambia foto del nuovo esercizio"
                    className="press flex h-8 w-8 items-center justify-center rounded-lg border border-line2 bg-ink/80 text-lime"
                  >
                    <Icon name="camera" size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={clearNewPhoto}
                    aria-label="Togli foto del nuovo esercizio"
                    className="press flex h-8 w-8 items-center justify-center rounded-lg border border-line2 bg-ink/80 text-danger"
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => newPhotoInputRef.current?.click()}
                aria-label="Aggiungi foto al nuovo esercizio"
                className="press flex h-24 w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line2 bg-surface2/40 text-faint hover:text-muted"
              >
                <Icon name="camera" size={20} />
                <span className="text-[11.5px]">Aggiungi una foto</span>
                <span className="text-[10px] text-faint">Resta nel tuo account</span>
              </button>
            )}
          </div>
          {err && <p className="text-[12.5px] text-danger">{err}</p>}
          <Button size="lg" full onClick={handleCreate} disabled={newName.trim().length < 2}>
            Crea esercizio
          </Button>
        </div>
      </Sheet>

      <Sheet open={editing} onClose={() => setEditing(false)} title="Modifica esercizio">
        <div className="space-y-4 pb-5">
          <Field label="Nome">
            <input
              className={inputClass}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              maxLength={48}
              autoFocus
            />
          </Field>
          <Field label="Alias" hint="facoltativo — altri nomi per la ricerca">
            <input
              className={inputClass}
              value={editAlias}
              onChange={(e) => setEditAlias(e.target.value)}
              placeholder="Es. bench press, panca, distensioni…"
              maxLength={64}
            />
          </Field>
          <div>
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
              Gruppo muscolare
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLES.map((m) => (
                <Chip
                  key={m}
                  active={editMuscle === m}
                  dot={MUSCLE_COLORS[m]}
                  onClick={() => setEditMuscle(m)}
                >
                  {m}
                </Chip>
              ))}
            </div>
          </div>
          <Field label="Attrezzatura" hint="facoltativa">
            <input
              className={inputClass}
              value={editEquipment}
              onChange={(e) => setEditEquipment(e.target.value)}
              placeholder="Bilanciere, manubri, macchina…"
              maxLength={32}
            />
          </Field>
          <TrackingPicker
            value={editTracking}
            onChange={setEditTracking}
            hint={
              editTracking === 'time'
                ? 'In allenamento le serie diventano minuti: niente ripetizioni, niente peso.'
                : 'In allenamento le serie restano ripetizioni con il peso.'
            }
          />
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface2/50 px-3 py-2.5">
            <Icon name="users" size={16} className="shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium">Disponibile a tutti</p>
              <p className="text-[10.5px] leading-tight text-faint">
                {editShared
                  ? 'Nella libreria comune di ogni account'
                  : 'Visibile solo a te'}
              </p>
            </div>
            <Toggle checked={editShared} onChange={setEditShared} label="Disponibile a tutti" />
          </div>
          {editErr && <p className="text-[12.5px] text-danger">{editErr}</p>}
          <Button size="lg" full onClick={() => void handleEdit()} disabled={editName.trim().length < 2}>
            Salva modifiche
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Eliminare l'esercizio?"
      >
        <div className="pb-5">
          <p className="text-[13px] text-muted">
            {detail?.isDefault
              ? `«${detail.name}» è un esercizio pre-caricato: verrà rimosso dalla libreria di tutti gli account. Gli allenamenti passati non cambiano.`
              : detailShared
                ? `«${detail?.name}» verrà eliminato dalla libreria comune: non sarà più disponibile per nessun account. Gli allenamenti passati non cambiano.`
                : `«${detail?.name}» verrà rimosso dalla tua libreria. Gli allenamenti passati non cambiano.`}
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" full onClick={() => setConfirmDelete(false)}>
              Annulla
            </Button>
            <Button variant="danger" full onClick={() => void handleDelete()}>
              Elimina
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
