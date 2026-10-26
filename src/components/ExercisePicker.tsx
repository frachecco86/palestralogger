import { useMemo, useState } from 'react'
import type { Exercise, Muscle } from '../lib/types'
import { MUSCLES, MUSCLE_COLORS } from '../lib/types'
import { createExercise, getExerciseAggregates, listExercises } from '../db/queries'
import { Badge, Button, Chip, Icon, Sheet, cx, inputClass } from './ui'
import { formatDate } from '../lib/dates'
import { useLiveData, toast } from '../lib/live'

export function ExercisePicker({
  open,
  onClose,
  onSelect,
  userId,
  excludeIds = [],
}: {
  open: boolean
  onClose: () => void
  onSelect: (exercise: Exercise) => void
  userId: string
  excludeIds?: string[]
}) {
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'Tutti'>('Tutti')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newMuscle, setNewMuscle] = useState<Muscle>('Altro')
  const [newEquipment, setNewEquipment] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const exercises = useLiveData(() => listExercises(userId), [userId])
  const aggregates = useLiveData(() => getExerciseAggregates(userId, 500), [userId])
  const aggMap = useMemo(
    () => new Map(aggregates.map((a) => [a.exerciseId, a])),
    [aggregates],
  )

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    return exercises
      .filter((e) => (muscle === 'Tutti' ? true : e.muscle === muscle))
      .filter((e) => (q ? e.name.toLowerCase().includes(q) || e.equipment.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        const la = aggMap.get(a.id)?.lastDate ?? ''
        const lb = aggMap.get(b.id)?.lastDate ?? ''
        if (la !== lb) return lb.localeCompare(la)
        return a.name.localeCompare(b.name, 'it')
      })
  }, [exercises, muscle, q, aggMap])

  const exact = exercises.some((e) => e.name.toLowerCase() === q)
  const canCreate = q.length >= 2 && !exact

  function reset() {
    setQuery('')
    setMuscle('Tutti')
    setCreating(false)
    setNewName('')
    setNewMuscle('Altro')
    setNewEquipment('')
    setErr(null)
  }

  function close() {
    reset()
    onClose()
  }

  function pick(exercise: Exercise) {
    reset()
    onSelect(exercise)
    onClose()
  }

  function startCreate() {
    setNewName(query.trim())
    setNewMuscle(muscle === 'Tutti' ? 'Altro' : muscle)
    setCreating(true)
    setErr(null)
  }

  function confirmCreate() {
    try {
      const ex = createExercise(userId, newName, newMuscle, newEquipment)
      toast('Esercizio creato')
      pick(ex)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Errore nella creazione')
    }
  }

  return (
    <Sheet open={open} onClose={close} full title={creating ? 'Nuovo esercizio' : 'Aggiungi esercizio'}>
      {creating ? (
        <div className="pb-6 space-y-4">
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="text-[12.5px] text-muted flex items-center gap-1"
          >
            <Icon name="left" size={14} /> Torna alla lista
          </button>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
              Nome esercizio
            </span>
            <input
              className={inputClass}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Es. Chest press inclinata"
              autoFocus
              maxLength={48}
            />
          </label>

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
                  onClick={() => setNewMuscle(m)}
                >
                  {m}
                </Chip>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
              Attrezzatura <span className="normal-case text-faint">(facoltativa)</span>
            </span>
            <input
              className={inputClass}
              value={newEquipment}
              onChange={(e) => setNewEquipment(e.target.value)}
              placeholder="Bilanciere, manubri, macchina…"
              maxLength={32}
            />
          </label>

          {err && <p className="text-[12.5px] text-danger">{err}</p>}

          <Button size="lg" full onClick={confirmCreate} disabled={newName.trim().length < 2}>
            <Icon name="plus" size={16} /> Crea e aggiungi
          </Button>
        </div>
      ) : (
        <div className="pb-4">
          <div className="sticky top-0 z-10 -mx-4 px-4 pt-1 pb-2 bg-surface">
            <div className="relative">
              <Icon
                name="search"
                size={17}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                className={cx(inputClass, 'pl-10 pr-10')}
                placeholder="Cerca: panca, leg press, squat…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                inputMode="search"
                enterKeyHint="search"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-faint"
                  aria-label="Cancella ricerca"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>

            <div className="mt-2 -mx-1 flex gap-1.5 overflow-x-auto no-scrollbar px-1 pb-0.5">
              <Chip active={muscle === 'Tutti'} onClick={() => setMuscle('Tutti')}>
                Tutti
              </Chip>
              {MUSCLES.map((m) => (
                <Chip
                  key={m}
                  active={muscle === m}
                  dot={MUSCLE_COLORS[m]}
                  onClick={() => setMuscle(m)}
                >
                  {m}
                </Chip>
              ))}
            </div>
          </div>

          {canCreate && (
            <button
              type="button"
              onClick={startCreate}
              className="press mb-2 flex w-full items-center gap-3 rounded-2xl border border-lime/40 bg-lime/10 px-3.5 py-3 text-left"
            >
              <span className="h-8 w-8 rounded-xl bg-lime text-ink flex items-center justify-center">
                <Icon name="plus" size={18} strokeWidth={2.6} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold">Crea «{query.trim()}»</span>
                <span className="block text-[11px] text-muted">Nuovo esercizio personale</span>
              </span>
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[13px] text-muted">Nessun esercizio trovato</p>
              <p className="mt-1 text-[11.5px] text-faint">Scrivi un nome e crealo al volo.</p>
            </div>
          ) : (
            <ul className="divide-y divide-line/70">
              {filtered.map((e) => {
                const agg = aggMap.get(e.id)
                const excluded = excludeIds.includes(e.id)
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      disabled={excluded}
                      onClick={() => pick(e)}
                      className={cx(
                        'press flex w-full items-center gap-3 py-2.5 text-left',
                        excluded && 'opacity-40',
                      )}
                    >
                      <span
                        className="h-8 w-1 shrink-0 rounded-full"
                        style={{ background: MUSCLE_COLORS[e.muscle] }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13.5px] font-medium">{e.name}</span>
                          {!e.isDefault && <Badge color="#7CFFB2">tuo</Badge>}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                          <span>{e.muscle}</span>
                          {e.equipment && <span>· {e.equipment}</span>}
                          {agg && <span>· ultima {formatDate(agg.lastDate)}</span>}
                          {excluded && <span>· già aggiunto</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-faint">
                        {excluded ? <Icon name="check" size={16} /> : <Icon name="plus" size={17} />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </Sheet>
  )
}
