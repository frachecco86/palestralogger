import { useMemo, useState } from 'react'
import type { Exercise, Muscle, User } from '../lib/types'
import { MUSCLES, MUSCLE_COLORS } from '../lib/types'
import {
  createExercise,
  deleteExercise,
  getExerciseAggregates,
  getExerciseHistory,
  listExercises,
} from '../db/queries'
import { formatDate } from '../lib/dates'
import { formatKg, formatWeight, plural } from '../lib/format'
import { toast, useLiveData } from '../lib/live'
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Icon,
  Sheet,
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
  const [err, setErr] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const exercises = useLiveData(() => listExercises(user.id), [user.id])
  const aggregates = useLiveData(() => getExerciseAggregates(user.id, 500), [user.id])
  const aggMap = useMemo(() => new Map(aggregates.map((a) => [a.exerciseId, a])), [aggregates])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    return exercises
      .filter((e) => (muscle === 'Tutti' ? true : e.muscle === muscle))
      .filter((e) =>
        q ? e.name.toLowerCase().includes(q) || e.equipment.toLowerCase().includes(q) : true,
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

  function resetCreate() {
    setCreating(false)
    setNewName('')
    setNewMuscle('Altro')
    setNewEquipment('')
    setErr(null)
  }

  function handleCreate() {
    try {
      const ex = createExercise(user.id, newName, newMuscle, newEquipment)
      toast('Esercizio aggiunto')
      resetCreate()
      setDetail(ex)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Errore')
    }
  }

  const detailAgg = detail ? aggMap.get(detail.id) : undefined
  const history = useLiveData(
    () => (detail ? getExerciseHistory(user.id, detail.id, 12) : []),
    [user.id, detail?.id],
  )
  const maxHistory = Math.max(1, ...history.map((h) => h.bestWeight))

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
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium">{e.name}</span>
                          {!e.isDefault && <Badge color="#7CFFB2">tuo</Badge>}
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
      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.name}>
        {detail && (
          <div className="pb-5">
            <div className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: MUSCLE_COLORS[detail.muscle] }}
              />
              <span className="text-[12px] text-muted">
                {detail.muscle}
                {detail.equipment ? ` · ${detail.equipment}` : ''}
              </span>
              {!detail.isDefault && <Badge color="#7CFFB2">personalizzato</Badge>}
            </div>

            <div className="mt-3 grid grid-cols-4 divide-x divide-line rounded-xl border border-line bg-surface2/60">
              {[
                { l: 'Sessioni', v: String(detailAgg?.sessions ?? 0) },
                { l: 'Serie', v: String(detailAgg?.sets ?? 0) },
                { l: 'Volume', v: formatKg(detailAgg?.volume ?? 0) },
                {
                  l: 'Max',
                  v: detailAgg?.bestWeight ? `${formatWeight(detailAgg.bestWeight)} kg` : '—',
                },
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
                  Carico massimo per sessione
                </p>
                <div className="mt-2 flex h-20 items-end gap-1 rounded-xl border border-line bg-surface2/40 p-2">
                  {history.map((h) => (
                    <div key={h.date} className="flex flex-1 flex-col items-center justify-end gap-1">
                      <div
                        className="w-full rounded-sm bg-lime/70"
                        style={{ height: Math.max(2, Math.round((h.bestWeight / maxHistory) * 52)) }}
                        title={`${formatDate(h.date)}: ${formatWeight(h.bestWeight)} kg`}
                      />
                      <span className="text-[8px] tabular text-faint">{h.date.slice(8)}</span>
                    </div>
                  ))}
                </div>
                {history.length >= 2 && (
                  <p className="mt-1.5 text-[10.5px] text-faint">
                    {formatWeight(history[0].bestWeight)} kg ({formatDate(history[0].date)}) →{' '}
                    {formatWeight(history[history.length - 1].bestWeight)} kg (
                    {formatDate(history[history.length - 1].date)})
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
              <Button full onClick={() => onQuickAdd(detail.id)}>
                <Icon name="plus" size={16} /> Usa in allenamento
              </Button>
              {!detail.isDefault && (
                <Button variant="danger" onClick={() => setConfirmDelete(true)} aria-label="Elimina">
                  <Icon name="trash" size={16} />
                </Button>
              )}
            </div>
          </div>
        )}
      </Sheet>

      {/* creazione */}
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
          <div>
            <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
              Gruppo muscolare
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLES.map((m) => (
                <Chip key={m} active={newMuscle === m} dot={MUSCLE_COLORS[m]} onClick={() => setNewMuscle(m)}>
                  {m}
                </Chip>
              ))}
            </div>
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
          {err && <p className="text-[12.5px] text-danger">{err}</p>}
          <Button size="lg" full onClick={handleCreate} disabled={newName.trim().length < 2}>
            Crea esercizio
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
            «{detail?.name}» verrà rimosso dalla tua libreria. Gli allenamenti passati non cambiano.
          </p>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" full onClick={() => setConfirmDelete(false)}>
              Annulla
            </Button>
            <Button
              variant="danger"
              full
              onClick={() => {
                if (!detail) return
                try {
                  deleteExercise(user.id, detail.id)
                  toast('Esercizio eliminato')
                  setConfirmDelete(false)
                  setDetail(null)
                } catch (e) {
                  toast(e instanceof Error ? e.message : 'Errore', 'err')
                  setConfirmDelete(false)
                }
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
