import { useEffect, useState } from 'react'
import type { User } from '../lib/types'
import { MUSCLE_COLORS } from '../lib/types'
import {
  getCachedSocial,
  refreshSocial,
  removeFriend,
  type SharedWorkout,
  type SocialFriend,
} from '../lib/social'
import { formatDate, formatDateLong } from '../lib/dates'
import { formatKg, formatWeight, initials, plural } from '../lib/format'
import { toast } from '../lib/live'
import { Button, Card, Icon, Sheet } from '../components/ui'
import { Footer } from '../components/Footer'

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-3">
      <p className="text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 text-[18px] font-bold leading-tight tabular">{value}</p>
      {sub && <p className="mt-0.5 text-[10px] leading-tight text-faint">{sub}</p>}
    </div>
  )
}

function SharedWorkoutCard({ workout }: { workout: SharedWorkout }) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5">
        <span className="flex w-10 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-surface2 py-1">
          <span className="text-[15px] font-bold leading-none tabular">
            {Number(workout.date.slice(8, 10))}
          </span>
          <span className="mt-0.5 text-[9px] uppercase leading-none text-muted">
            {formatDate(workout.date).split(' ')[2] ?? ''}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">
            {workout.name || workout.muscles.slice(0, 2).join(' · ')}
          </span>
          <span className="mt-0.5 block text-[10.5px] text-muted">
            {workout.exercises.length} esercizi · {workout.sets} serie
            {workout.volume > 0 ? ` · ${formatKg(workout.volume)}` : ''}
          </span>
        </span>
        <Icon
          name="down"
          size={14}
          className="shrink-0 text-faint transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="space-y-2.5 border-t border-line px-3 py-2.5">
        {workout.note && (
          <p className="rounded-lg bg-surface2/70 px-2 py-1.5 text-[11px] italic text-muted">
            “{workout.note}”
          </p>
        )}
        {workout.exercises.map((ex, i) => (
          <div key={`${ex.name}-${i}`}>
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: MUSCLE_COLORS[ex.muscle] ?? '#9AA396' }}
              />
              <span className="text-[11.5px] font-medium">{ex.name}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {ex.sets.map((s, si) => (
                <span
                  key={si}
                  className="rounded-md border border-line bg-surface2 px-1.5 py-0.5 text-[10px] tabular text-muted"
                >
                  {s.weight > 0 ? `${formatWeight(s.weight)} kg` : 'corpo libero'} × {s.reps}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}

export function FriendDetailScreen({
  user,
  friendUid,
  onBack,
}: {
  user: User
  friendUid: string
  onBack: () => void
}) {
  const cached = getCachedSocial(user.id)?.state
  const [friend, setFriend] = useState<SocialFriend | null>(
    () => cached?.friends.find((f) => f.uid === friendUid) ?? null,
  )
  const [loading, setLoading] = useState(!friend)
  const [error, setError] = useState<string | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [removing, setRemoving] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const state = await refreshSocial(user.id)
      const found = state?.friends.find((f) => f.uid === friendUid) ?? null
      if (found) {
        setFriend(found)
        setError(null)
      } else if (!friend) {
        setError('Non siete più amici o il profilo non condivide dati.')
      }
    } catch (e) {
      if (!friend) setError(e instanceof Error ? e.message : 'Connessione non riuscita')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendUid, user.id])

  const snap = friend?.snapshot ?? null
  const stats = snap?.stats

  async function handleRemove() {
    if (!friend) return
    setRemoving(true)
    try {
      await removeFriend(user.id, friend.uid)
      toast('Amico rimosso')
      onBack()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Operazione non riuscita', 'err')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-md items-center gap-1.5 px-2">
          <button
            type="button"
            onClick={onBack}
            className="press flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:text-text"
            aria-label="Indietro"
          >
            <Icon name="back" size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Amico</p>
            <p className="truncate text-[14px] font-semibold leading-tight">
              {friend?.name ?? 'Profilo'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="press flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface2 text-lime disabled:opacity-40"
            aria-label="Aggiorna"
          >
            <Icon name="refresh" size={16} className={loading ? 'animate-spin' : undefined} />
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-4 pt-4">
        {!friend && loading && (
          <div className="py-20 text-center text-[13px] text-muted">Caricamento profilo…</div>
        )}

        {!friend && !loading && (
          <Card>
            <div className="px-5 py-10 text-center">
              <p className="text-[14px] font-semibold">Profilo non disponibile</p>
              <p className="mt-1 text-[12px] text-muted">
                {error ?? 'Non siete più amici o i dati non sono stati condivisi.'}
              </p>
              <Button size="sm" className="mt-4" onClick={onBack}>
                Torna agli amici
              </Button>
            </div>
          </Card>
        )}

        {friend && (
          <>
            <Card className="border-lime/20 bg-lime/[0.05] p-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-lime/30 bg-lime/10 text-[18px] font-bold text-lime">
                  {initials(friend.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[17px] font-bold">{friend.name}</p>
                  <p className="text-[11px] text-muted">
                    {snap ? 'Allenamenti condivisi' : 'Nessun dato condiviso'}
                    {snap && ` · ${plural(snap.workouts.length, 'sessione', 'sessioni')}`}
                  </p>
                </div>
                <Icon name="users" size={18} className="text-lime/80" />
              </div>
              {friend.updatedAt && (
                <p className="mt-2 flex items-center gap-1 text-[10px] text-faint">
                  <Icon name="clock" size={11} /> Aggiornato {formatDateLong(friend.updatedAt.slice(0, 10))}
                </p>
              )}
            </Card>

            {!snap && (
              <Card className="mt-3">
                <div className="px-5 py-9 text-center">
                  <p className="text-[13px] font-semibold">Nessun allenamento condiviso</p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {friend.name} non ha ancora pubblicato allenamenti o la sync è in attesa.
                  </p>
                </div>
              </Card>
            )}

            {snap && stats && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Tile
                    label="Questa settimana"
                    value={String(stats.weekWorkouts)}
                    sub={formatKg(stats.weekVolume)}
                  />
                  <Tile
                    label="Serie attiva"
                    value={`${stats.currentStreak} ${stats.currentStreak === 1 ? 'giorno' : 'giorni'}`}
                    sub={`Record: ${stats.bestStreak}`}
                  />
                  <Tile
                    label="Allenamenti"
                    value={String(stats.totalWorkouts)}
                    sub={`${stats.activeDays} giorni attivi`}
                  />
                  <Tile
                    label="Volume totale"
                    value={formatKg(stats.totalVolume)}
                    sub={`${stats.totalSets} serie`}
                  />
                </div>

                {stats.muscles.length > 0 && (
                  <Card className="mt-3 p-3.5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      Gruppi muscolari
                    </p>
                    <div className="mt-2.5 space-y-2">
                      {stats.muscles.map((m) => {
                        const max = Math.max(1, ...stats.muscles.map((x) => x.volume || x.sets))
                        const metric = m.volume || m.sets
                        return (
                          <div key={m.muscle}>
                            <div className="mb-1 flex items-center justify-between text-[10.5px]">
                              <span className="flex items-center gap-1.5 font-medium">
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ background: MUSCLE_COLORS[m.muscle] ?? '#9AA396' }}
                                />
                                {m.muscle}
                              </span>
                              <span className="tabular text-faint">
                                {m.volume > 0 ? formatKg(m.volume) : `${m.sets} serie`}
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-surface3">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${Math.max(4, (metric / max) * 100)}%`,
                                  background: MUSCLE_COLORS[m.muscle] ?? '#9AA396',
                                }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Card>
                )}

                <section className="mt-5">
                  <div className="mb-2 flex items-end justify-between">
                    <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
                      Allenamenti recenti
                    </h2>
                    <span className="text-[10px] text-faint">{snap.workouts.length}</span>
                  </div>
                  {snap.workouts.length === 0 ? (
                    <Card className="px-4 py-6 text-center text-[12px] text-muted">
                      Nessun allenamento pubblicato.
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {snap.workouts.map((w) => (
                        <SharedWorkoutCard key={w.id} workout={w} />
                      ))}
                    </div>
                  )}
                </section>

                {stats.topExercises.length > 0 && (
                  <section className="mt-5">
                    <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
                      Esercizi più allenati
                    </h2>
                    <div className="space-y-2">
                      {stats.topExercises.map((e) => (
                        <Card key={e.name} className="flex items-center gap-2 px-3 py-2.5">
                          <span
                            className="h-7 w-1 shrink-0 rounded-full"
                            style={{ background: MUSCLE_COLORS[e.muscle] ?? '#9AA396' }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12.5px] font-semibold">{e.name}</p>
                            <p className="text-[10px] text-faint">
                              {e.sets} serie · ultima {formatDate(e.lastDate)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11.5px] font-semibold tabular">{formatKg(e.volume)}</p>
                            {e.bestWeight > 0 && (
                              <p className="text-[10px] text-faint tabular">
                                max {formatWeight(e.bestWeight)} kg
                              </p>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            {snap && (
              <p className="mt-4 flex items-center justify-center gap-1 text-[10px] text-faint">
                <Icon name="lock" size={11} /> Dati condivisi volontariamente da {friend.name}
              </p>
            )}

            <button
              type="button"
              onClick={() => setRemoveOpen(true)}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[11.5px] font-medium text-danger/80 hover:text-danger"
            >
              <Icon name="trash" size={13} /> Rimuovi amico
            </button>
          </>
        )}

        <Footer />
      </div>

      <Sheet open={removeOpen} onClose={() => setRemoveOpen(false)} title="Rimuovere l'amico?">
        <div className="pb-5">
          <p className="text-[13px] leading-relaxed text-muted">
            Non vedrai più i suoi allenamenti e lui non vedrà i tuoi. Potrete sempre aggiungervi di
            nuovo con il codice amico.
          </p>
          <div className="mt-4 space-y-2">
            <Button variant="danger" full disabled={removing} onClick={() => void handleRemove()}>
              {removing ? 'Rimozione…' : 'Rimuovi amico'}
            </Button>
            <Button variant="ghost" full onClick={() => setRemoveOpen(false)}>
              Annulla
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
