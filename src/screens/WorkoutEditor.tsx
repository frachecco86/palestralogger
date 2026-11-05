import { useEffect, useMemo, useRef, useState } from 'react'
import type { Exercise, WorkoutEntryInput } from '../lib/types'
import { MUSCLE_COLORS } from '../lib/types'
import {
  deleteWorkout,
  getExercise,
  getExercisePhoto,
  getWorkout,
  lastPerformance,
  saveWorkout,
  type ExercisePhoto,
} from '../db/queries'
import { addDays, formatDate, todayISO } from '../lib/dates'
import { formatKg, plural } from '../lib/format'
import { toast } from '../lib/live'
import { addExercisePhoto, removeExercisePhoto, syncPhotos } from '../lib/photo'
import { Button, Card, Chip, Icon, Sheet, cx } from '../components/ui'
import { ExercisePicker } from '../components/ExercisePicker'
import { ExercisePhotoSheet, ExerciseThumb } from '../components/ExercisePhoto'
import { ShareWorkoutSheet } from '../components/ShareWorkoutSheet'

interface EditorSet {
  key: string
  reps: number
  weight: number
}

interface EditorEntry {
  key: string
  exercise: Exercise
  sets: EditorSet[]
  lastHint?: string
}

let keySeq = 0
const key = () => `e${++keySeq}`

function NumInput({
  value,
  onChange,
  step,
  min = 0,
  max = 1000,
  width = 'w-10',
  label,
  readOnly = false,
}: {
  value: number
  onChange: (v: number) => void
  step: number
  min?: number
  max?: number
  width?: string
  label: string
  readOnly?: boolean
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ','))
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 100) / 100))

  // In sola lettura il valore è testo: niente input, niente pulsanti +/–.
  if (readOnly) {
    return (
      <span
        aria-label={`${label}: ${shown}`}
        className={cx(
          'flex h-9 items-center justify-center rounded-lg border border-line bg-surface2/50 text-[13px] font-semibold tabular text-muted',
          width,
        )}
      >
        {shown}
      </span>
    )
  }

  return (
    <div className="flex items-center h-9 rounded-lg bg-surface2 border border-line overflow-hidden">
      <button
        type="button"
        aria-label={`meno ${label}`}
        onClick={() => onChange(clamp(value - step))}
        className="press h-full w-7 text-muted active:bg-surface3 flex items-center justify-center"
      >
        <Icon name="minus" size={13} strokeWidth={2.6} />
      </button>
      <input
        aria-label={label}
        inputMode="decimal"
        value={shown}
        onFocus={() => setDraft(shown)}
        onChange={(e) => {
          const raw = e.target.value.replace(',', '.').replace(/[^\d.]/g, '')
          setDraft(raw)
          if (raw !== '' && !Number.isNaN(Number(raw))) onChange(clamp(Number(raw)))
        }}
        onBlur={() => setDraft(null)}
        className={cx(
          'h-full bg-transparent text-center text-[13px] font-semibold tabular outline-none focus:bg-surface3/60',
          width,
        )}
      />
      <button
        type="button"
        aria-label={`più ${label}`}
        onClick={() => onChange(clamp(value + step))}
        className="press h-full w-7 text-muted active:bg-surface3 flex items-center justify-center"
      >
        <span className="text-[13px] font-semibold">+</span>
      </button>
    </div>
  )
}

export function WorkoutEditor({
  userId,
  userName,
  workoutId,
  initialDate,
  initialExerciseId,
  onClose,
  onSaved,
  onDeleted,
}: {
  userId: string
  userName: string
  workoutId?: string
  initialDate?: string
  initialExerciseId?: string
  onClose: () => void
  onSaved: (id: string) => void
  onDeleted: () => void
}) {
  const [loaded] = useState(() => (workoutId ? getWorkout(userId, workoutId) : null))

  const [date, setDate] = useState(loaded?.date ?? initialDate ?? todayISO())
  const [name, setName] = useState(loaded?.name ?? '')
  const [notes, setNotes] = useState(loaded?.notes ?? '')
  const [entries, setEntries] = useState<EditorEntry[]>(() =>
    (loaded?.entries ?? []).map((e) => ({
      key: key(),
      exercise: e.exercise,
      sets: e.sets.map((s) => ({ key: key(), reps: s.reps, weight: s.weight })),
    })),
  )
  // Gli esercizi di un allenamento già salvato partono chiusi: si espandono col tasto.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(entries.map((e) => e.key)))
  // Rimuovere esercizi o serie è possibile solo attivando la modalità modifica.
  // Un allenamento nuovo parte già in modifica; uno salvato si apre in lettura.
  const [editMode, setEditMode] = useState(() => !loaded)
  // Foto esercizio (miniatura accanto al nome), salvate in locale + cloud
  const [photos, setPhotos] = useState<Record<string, ExercisePhoto>>(() => {
    const map: Record<string, ExercisePhoto> = {}
    for (const e of entries) {
      const photo = getExercisePhoto(userId, e.exercise.id)
      if (photo) map[e.exercise.id] = photo
    }
    return map
  })
  const [photoView, setPhotoView] = useState<string | null>(null)
  const photoTarget = useRef<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const initialAdded = useRef(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareOpen, setShareOpen] = useState(false)

  const totalSets = entries.reduce((s, e) => s + e.sets.length, 0)
  const totalVolume = entries.reduce(
    (s, e) => s + e.sets.reduce((x, set) => x + set.reps * set.weight, 0),
    0,
  )
  const muscles = useMemo(
    () => [...new Set(entries.map((e) => e.exercise.muscle))],
    [entries],
  )

  const dirty = useMemo(() => {
    if (!loaded)
      return (
        entries.length > 0 ||
        name.trim() !== '' ||
        notes.trim() !== '' ||
        date !== (initialDate ?? todayISO())
      )
    const initialSig = JSON.stringify({
      date: loaded.date,
      name: loaded.name,
      notes: loaded.notes,
      entries: loaded.entries.map((e) => ({
        id: e.exercise.id,
        sets: e.sets.map((s) => [s.reps, s.weight]),
      })),
    })
    const currentSig = JSON.stringify({
      date,
      name,
      notes,
      entries: entries.map((e) => ({
        id: e.exercise.id,
        sets: e.sets.map((s) => [s.reps, s.weight]),
      })),
    })
    return initialSig !== currentSig
  }, [loaded, date, name, notes, entries, initialDate])

  function addExercise(exercise: Exercise) {
    if (entries.some((e) => e.exercise.id === exercise.id)) {
      toast('Esercizio già aggiunto', 'err')
      setPickerOpen(false)
      return
    }
    const photo = getExercisePhoto(userId, exercise.id)
    if (photo) setPhotos((prev) => ({ ...prev, [exercise.id]: photo }))
    const last = lastPerformance(userId, exercise.id)
    const baseSets = last && last.date !== date
      ? last.sets.slice(0, 5)
      : [
          { reps: 10, weight: 0 },
          { reps: 10, weight: 0 },
          { reps: 10, weight: 0 },
        ]
    setEntries((prev) => [
      ...prev,
      {
        key: key(),
        exercise,
        sets: baseSets.map((s) => ({ key: key(), reps: s.reps, weight: s.weight })),
        lastHint: last && last.date !== date
          ? `Ultima volta ${formatDate(last.date)}: ${last.sets
              .slice(0, 3)
              .map((s) => `${s.weight > 0 ? `${s.weight} kg` : 'corpo libero'}×${s.reps}`)
              .join(' · ')}`
          : undefined,
      },
    ])
    setPickerOpen(false)
  }

  useEffect(() => {
    if (!initialExerciseId || initialAdded.current) return
    initialAdded.current = true
    const ex = getExercise(initialExerciseId)
    if (ex) addExercise(ex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialExerciseId])

  function updateEntry(entryKey: string, fn: (entry: EditorEntry) => EditorEntry) {
    setEntries((prev) => prev.map((e) => (e.key === entryKey ? fn(e) : e)))
  }

  function removeEntry(entryKey: string) {    setEntries((prev) => prev.filter((e) => e.key !== entryKey))
    setCollapsed((prev) => {
      if (!prev.has(entryKey)) return prev
      const next = new Set(prev)
      next.delete(entryKey)
      return next
    })
  }

  function toggleCollapsed(entryKey: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(entryKey)) next.delete(entryKey)
      else next.add(entryKey)
      return next
    })
  }

  // Scarica le foto mancanti degli esercizi di questo allenamento
  const exerciseIdsKey = useMemo(
    () => entries.map((e) => e.exercise.id).join('|'),
    [entries],
  )
  useEffect(() => {
    const ids = exerciseIdsKey ? exerciseIdsKey.split('|') : []
    if (ids.length === 0) return
    let alive = true
    void syncPhotos(userId, ids)
      .then((changed) => {
        if (!alive || changed.length === 0) return
        setPhotos((prev) => {
          const next = { ...prev }
          for (const id of changed) {
            const photo = getExercisePhoto(userId, id)
            if (photo) next[id] = photo
            else delete next[id]
          }
          return next
        })
      })
      .catch(() => {
        /* offline: restano le foto già presenti */
      })
    return () => {
      alive = false
    }
  }, [userId, exerciseIdsKey])

  function pickPhoto(exerciseId: string) {
    photoTarget.current = exerciseId
    photoInputRef.current?.click()
  }

  async function handlePhotoFile(file: File) {
    const exerciseId = photoTarget.current
    photoTarget.current = null
    if (!exerciseId) return
    try {
      const { uploaded } = await addExercisePhoto(userId, exerciseId, file)
      const photo = getExercisePhoto(userId, exerciseId)
      if (photo) setPhotos((prev) => ({ ...prev, [exerciseId]: photo }))
      setPhotoView(exerciseId)
      toast(
        uploaded
          ? 'Foto salvata'
          : 'Foto salvata sul telefono: sarà caricata appena torni online',
      )
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Foto non salvata', 'err')
    }
  }

  async function removePhoto(exerciseId: string) {
    try {
      await removeExercisePhoto(userId, exerciseId)
      setPhotos((prev) => {
        const next = { ...prev }
        delete next[exerciseId]
        return next
      })
      setPhotoView(null)
      toast('Foto rimossa')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Rimozione non riuscita', 'err')
    }
  }

  function handleSave() {
    setError(null)
    const payload: WorkoutEntryInput[] = entries.map((e) => ({
      exerciseId: e.exercise.id,
      sets: e.sets.map((s) => ({ reps: s.reps, weight: s.weight })),
    }))
    if (payload.length === 0) {
      setError('Aggiungi almeno un esercizio')
      return
    }
    setSaving(true)
    try {
      const id = saveWorkout(userId, {
        id: workoutId,
        date,
        name,
        notes,
        entries: payload,
      })
      toast(workoutId ? 'Allenamento aggiornato' : 'Allenamento salvato')
      onSaved(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel salvataggio')
    } finally {
      setSaving(false)
    }
  }

  function attemptClose() {
    if (dirty) setConfirmClose(true)
    else onClose()
  }

  function openShare() {
    if (!loaded) return
    if (dirty) {
      toast('Salva le modifiche prima di condividere', 'err')
      return
    }
    setShareOpen(true)
  }

  if (workoutId && !loaded) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="h-12 w-12 rounded-2xl bg-surface2 border border-line flex items-center justify-center text-muted">
          <Icon name="info" size={22} />
        </div>
        <p className="text-[15px] font-semibold">Allenamento non trovato</p>
        <p className="text-[12px] text-muted">Potrebbe essere stato eliminato.</p>
        <Button onClick={onClose}>Torna alla home</Button>
      </div>
    )
  }

  const title = name.trim() || (muscles.length ? muscles.slice(0, 2).join(' · ') : 'Nuovo allenamento')

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-md items-center gap-1.5 px-2">
          <button
            type="button"
            onClick={attemptClose}
            className="press flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:text-text"
            aria-label="Torna indietro"
          >
            <Icon name="back" size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted">
              {workoutId ? 'Allenamento' : 'Nuovo'}
            </p>
            <p className="truncate text-[14px] font-semibold leading-tight">{title}</p>
          </div>
          {loaded && (
            <button
              type="button"
              onClick={openShare}
              aria-label="Condividi l'allenamento come immagine"
              className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface2 border border-line text-lime"
            >
              <Icon name="share" size={17} />
            </button>
          )}
          <span className="rounded-lg bg-surface2 border border-line px-2 py-1 text-[11px] text-muted tabular">
            {totalSets} serie
          </span>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-4 pb-[calc(env(safe-area-inset-bottom)+110px)] pt-4">
        {/* data e titolo */}
        <Card className="p-3.5 space-y-3">
          <div className="flex items-center gap-2">
            <label className="flex h-10 flex-1 items-center gap-2 rounded-xl bg-surface2 border border-line2 px-3">
              <Icon name="calendar" size={16} className="text-muted" />
              <input
                type="date"
                value={date}
                max={addDays(todayISO(), 365)}
                onChange={(e) => e.target.value && setDate(e.target.value)}
                className="h-full flex-1 bg-transparent text-[13.5px] outline-none"
                aria-label="Data allenamento"
              />
            </label>
            <Chip active={date === todayISO()} onClick={() => setDate(todayISO())}>
              Oggi
            </Chip>
            <Chip active={date === addDays(todayISO(), -1)} onClick={() => setDate(addDays(todayISO(), -1))}>
              Ieri
            </Chip>
          </div>

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Titolo (opzionale) — es. Push A"
            maxLength={40}
            className="w-full rounded-xl bg-surface2 border border-line2 px-3 py-2.5 text-[14px] outline-none placeholder:text-faint focus:border-lime/60"
          />

          <div>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-faint">
              <Icon name="edit" size={11} /> Note della sessione
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Come è andata? Recupero, tecnica, sensazioni…"
              className="w-full resize-none rounded-xl bg-surface2 border border-line2 px-3 py-2.5 text-[13px] outline-none placeholder:text-faint focus:border-lime/50"
            />
          </div>

          {error && (
            <p className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
              {error}
            </p>
          )}
        </Card>

        {/* esercizi */}
        <div className="mt-4 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            Esercizi
            {entries.length > 0 && <span className="font-normal text-faint"> · {entries.length}</span>}
          </p>
          <button
            type="button"
            onClick={() => {
              if (editMode) setPickerOpen(false)
              setEditMode(!editMode)
            }}
            aria-pressed={editMode}
            aria-label={editMode ? 'Disattiva modifica esercizi' : 'Attiva modifica esercizi'}
            className={cx(
              'press flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11.5px] font-semibold',
              editMode
                ? 'border-lime/40 bg-lime/15 text-lime'
                : 'border-line bg-surface2 text-muted',
            )}
          >
            <Icon name={editMode ? 'check' : 'edit'} size={13} />
            {editMode ? 'Fine' : 'Modifica'}
          </button>
        </div>
        {editMode && loaded && (
          <p className="mt-2 rounded-lg border border-danger/25 bg-danger/[0.07] px-2.5 py-1.5 text-[10.5px] leading-relaxed text-danger">
            Modalità modifica attiva: il cestino rimuove l’esercizio, la × toglie una serie.
          </p>
        )}

        <div className="mt-2.5 space-y-2.5">
          {entries.map((entry) => (
            <Card key={entry.key} className="overflow-hidden">
              <div
                className={cx(
                  'flex items-center gap-2 px-3',
                  collapsed.has(entry.key) ? 'py-2.5' : 'pt-2.5 pb-1.5',
                )}
              >
                <span
                  className="h-7 w-1 shrink-0 rounded-full"
                  style={{ background: MUSCLE_COLORS[entry.exercise.muscle] }}
                />
                <ExerciseThumb
                  photo={photos[entry.exercise.id]}
                  editable={editMode}
                  name={entry.exercise.name}
                  onClick={() => setPhotoView(entry.exercise.id)}
                />
                <button
                  type="button"
                  onClick={() => toggleCollapsed(entry.key)}
                  aria-label={`Dettagli ${entry.exercise.name}`}
                  aria-expanded={!collapsed.has(entry.key)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate text-[13.5px] font-semibold">{entry.exercise.name}</p>
                  <p className="text-[10.5px] text-faint">
                    {entry.exercise.muscle}
                    {entry.exercise.equipment ? ` · ${entry.exercise.equipment}` : ''}
                  </p>
                </button>

                {collapsed.has(entry.key) && (
                  <div className="shrink-0 text-right">
                    <p className="text-[11.5px] font-semibold leading-tight tabular">
                      {plural(entry.sets.length, 'serie', 'serie')}
                    </p>
                    <p className="text-[10px] text-faint tabular">
                      {formatKg(entry.sets.reduce((x, s) => x + s.reps * s.weight, 0))}
                    </p>
                  </div>
                )}

                {editMode && (
                  <button
                    type="button"
                    onClick={() => removeEntry(entry.key)}
                    className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-danger/25 bg-danger/10 text-danger"
                    aria-label={`Rimuovi ${entry.exercise.name}`}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => toggleCollapsed(entry.key)}
                  className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:text-text"
                  aria-label={
                    collapsed.has(entry.key)
                      ? `Espandi ${entry.exercise.name}`
                      : `Comprimi ${entry.exercise.name}`
                  }
                >
                  <Icon
                    name="down"
                    size={16}
                    className={cx(
                      'transition-transform',
                      collapsed.has(entry.key) ? '' : 'rotate-180',
                    )}
                  />
                </button>
              </div>

              {!collapsed.has(entry.key) && (
              <div className="px-3 pb-2.5">
                {entry.lastHint && (
                  <p className="mb-1.5 rounded-lg bg-surface2/60 px-2 py-1 text-[10.5px] text-muted">
                    <Icon name="clock" size={11} className="mr-1 inline align-[-1px]" />
                    {entry.lastHint}
                  </p>
                )}

                <div className="mb-1 flex items-center gap-2 pl-0.5 text-[9px] uppercase tracking-wide text-faint">
                  <span className="w-5">#</span>
                  <span className="w-[88px] text-center">Reps</span>
                  <span className="w-2" />
                  <span className="w-[96px] text-center">Peso kg</span>
                  {editMode && entry.sets.length > 1 && <span className="w-[60px]" />}
                </div>

                <div className="space-y-1.5">
                  {entry.sets.map((set, setIdx) => (
                    <div key={set.key} className="flex items-center gap-2">
                      <span className="flex h-7 w-5 items-center justify-center text-[11.5px] font-semibold text-muted tabular">
                        {setIdx + 1}
                      </span>
                      <NumInput
                        value={set.reps}
                        step={1}
                        min={0}
                        max={200}
                        width="w-8"
                        label={`ripetizioni serie ${setIdx + 1}`}
                        readOnly={!editMode}
                        onChange={(v) =>
                          updateEntry(entry.key, (e) => ({
                            ...e,
                            sets: e.sets.map((s) => (s.key === set.key ? { ...s, reps: v } : s)),
                          }))
                        }
                      />
                      <span className="text-[11px] text-faint">×</span>
                      <NumInput
                        value={set.weight}
                        step={2.5}
                        min={0}
                        max={999}
                        width="w-10"
                        label={`peso serie ${setIdx + 1}`}
                        readOnly={!editMode}
                        onChange={(v) =>
                          updateEntry(entry.key, (e) => ({
                            ...e,
                            sets: e.sets.map((s) => (s.key === set.key ? { ...s, weight: v } : s)),
                          }))
                        }
                      />
                      {editMode && entry.sets.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            updateEntry(entry.key, (e) => ({
                              ...e,
                              sets: e.sets.map((s) => ({ ...s, weight: set.weight })),
                            }))
                            toast('Peso di ' + set.weight + ' kg applicato a tutte le serie')
                          }}
                          className="press flex h-8 w-6 shrink-0 items-center justify-center rounded-lg text-faint hover:text-lime"
                          aria-label={'Applica il peso della serie ' + (setIdx + 1) + ' a tutte le serie'}
                          title="Applica questo peso a tutte le serie"
                        >
                          <Icon name="copy" size={12} />
                        </button>
                      )}
                      {editMode && (
                        <button
                          type="button"
                          disabled={entry.sets.length === 1}
                          onClick={() =>
                            updateEntry(entry.key, (e) => ({
                              ...e,
                              sets: e.sets.filter((s) => s.key !== set.key),
                            }))
                          }
                          className="press flex h-8 w-7 items-center justify-center rounded-lg text-faint hover:text-danger disabled:opacity-20"
                          aria-label={`Rimuovi serie ${setIdx + 1}`}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {editMode && (
                  <button
                    type="button"
                    onClick={() =>
                      updateEntry(entry.key, (e) => {
                        const last = e.sets[e.sets.length - 1] ?? { reps: 10, weight: 0 }
                        return {
                          ...e,
                          sets: [...e.sets, { key: key(), reps: last.reps, weight: last.weight }],
                        }
                      })
                    }
                    className="press mt-2 flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line2 text-[11.5px] font-medium text-muted hover:text-text"
                  >
                    <Icon name="plus" size={13} /> Aggiungi serie
                  </button>
                )}
              </div>
              )}
            </Card>
          ))}
        </div>

        {editMode ? (
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="press mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line2 bg-surface/50 text-[13.5px] font-semibold text-muted hover:text-text hover:border-lime/40"
          >
            <Icon name="plus" size={18} /> Aggiungi esercizio
          </button>
        ) : (
          <div className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line2/70 bg-surface/20 text-[12px] text-faint">
            <Icon name="lock" size={14} /> Tocca «Modifica» per aggiungere esercizi
          </div>
        )}

        {loaded && (
          <button
            type="button"
            onClick={openShare}
            className="press mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-line2 bg-surface text-[12.5px] font-semibold text-text hover:border-lime/40"
          >
            <Icon name="share" size={15} className="text-lime" /> Condividi come immagine
          </button>
        )}

        {workoutId && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-medium text-danger/80 hover:text-danger"
          >
            <Icon name="trash" size={14} /> Elimina allenamento
          </button>
        )}
      </div>

      {/* barra salvataggio */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-md items-center gap-3 px-4 pt-2.5 pb-[calc(env(safe-area-inset-bottom)+10px)]">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold tabular leading-tight">
              {formatKg(totalVolume)}
            </p>
            <p className="text-[10px] text-faint">
              {plural(entries.length, 'esercizio', 'esercizi')} · {plural(totalSets, 'serie', 'serie')}
            </p>
          </div>
          <Button size="lg" onClick={handleSave} disabled={saving || entries.length === 0} className="px-7">
            {saving ? 'Salvo…' : workoutId ? 'Aggiorna' : 'Salva'}
          </Button>
        </div>
      </div>

      <ExercisePhotoSheet
        open={!!photoView}
        photo={photoView ? photos[photoView] : undefined}
        exerciseName={entries.find((e) => e.exercise.id === photoView)?.exercise.name ?? ''}
        editable={editMode}
        onClose={() => setPhotoView(null)}
        onReplace={() => {
          const id = photoView
          setPhotoView(null)
          if (id) pickPhoto(id)
        }}
        onRemove={() => {
          if (photoView) void removePhoto(photoView)
        }}
      />

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

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addExercise}
        userId={userId}
        excludeIds={entries.map((e) => e.exercise.id)}
      />

      {loaded && (
        <ShareWorkoutSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          workout={loaded}
          userName={userName}
        />
      )}

      <Sheet open={confirmClose} onClose={() => setConfirmClose(false)} title="Modifiche non salvate">
        <div className="pb-5">
          <p className="text-[13px] text-muted">
            Se esci ora perderai le modifiche a questo allenamento.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" full onClick={() => setConfirmClose(false)}>
              Continua a modificare
            </Button>
            <Button variant="danger" full onClick={onClose}>
              Esci senza salvare
            </Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Eliminare l'allenamento?">
        <div className="pb-5">
          <p className="text-[13px] text-muted">
            L'allenamento del {formatDate(date)} e tutte le sue serie verranno rimossi. L'operazione
            non si può annullare.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" full onClick={() => setConfirmDelete(false)}>
              Annulla
            </Button>
            <Button
              variant="danger"
              full
              onClick={() => {
                if (!workoutId) return
                deleteWorkout(userId, workoutId)
                toast('Allenamento eliminato')
                onDeleted()
              }}
            >
              Elimina
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
