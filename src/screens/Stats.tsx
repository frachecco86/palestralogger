import { useMemo } from 'react'
import type { User } from '../lib/types'
import { MUSCLE_COLORS } from '../lib/types'
import { getStats } from '../db/queries'
import { formatDate, formatDateLong, todayISO, weekLabel } from '../lib/dates'
import { formatKg, formatNumber, formatWeight, plural } from '../lib/format'
import { Badge, Button, Card, EmptyState, Icon, SectionTitle, cx } from '../components/ui'
import { useLiveData } from '../lib/live'

function StatTile({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: string
  sub?: string
  icon: 'dumbbell' | 'scale' | 'list' | 'calendar' | 'flame' | 'trend'
}) {
  return (
    <div className="rounded-2xl bg-surface border border-line p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted">{label}</span>
        <Icon name={icon} size={14} className="text-faint" />
      </div>
      <p className="mt-1 text-[19px] font-bold leading-tight tabular">{value}</p>
      {sub && <p className="mt-0.5 text-[10.5px] text-faint leading-tight">{sub}</p>}
    </div>
  )
}

export function StatsScreen({ user, onNew }: { user: User; onNew: () => void }) {
  const today = todayISO()
  const stats = useLiveData(() => getStats(user.id, today), [user.id, today])

  const maxWeek = Math.max(1, ...stats.weekly.map((w) => w.volume))
  const muscleMetric = useMemo(() => {
    const rows = stats.muscles.filter((m) => m.sets > 0).slice(0, 6)
    const totalVolume = rows.reduce((s, m) => s + m.volume, 0)
    const totalSets = rows.reduce((s, m) => s + m.sets, 0)
    return { rows, totalVolume, totalSets, byVolume: totalVolume > 0 }
  }, [stats.muscles])

  const bestSet = useMemo(() => {
    return [...stats.topExercises].sort((a, b) => b.bestE1rm - a.bestE1rm).slice(0, 3)
  }, [stats.topExercises])

  if (stats.totalWorkouts === 0) {
    return (
      <div className="mx-auto w-full max-w-md px-4 pt-[max(16px,env(safe-area-inset-top))]">
        <h1 className="text-[24px] font-bold tracking-tight">Statistiche</h1>
        <Card className="mt-4">
          <EmptyState
            icon="chart"
            title="I numeri arrivano allenandoti"
            text="Dopo il primo allenamento vedrai volume, serie, costanza, gruppi muscolari e record personali."
            action={
              <Button size="sm" onClick={onNew}>
                <Icon name="plus" size={15} /> Inizia ora
              </Button>
            }
          />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <header>
        <p className="text-[11.5px] uppercase tracking-[0.1em] text-muted">Statistiche</p>
        <h1 className="mt-0.5 text-[24px] font-bold leading-tight tracking-tight">
          I tuoi progressi
        </h1>
        {stats.firstDate && (
          <p className="mt-0.5 text-[11.5px] text-muted">
            Dal {formatDateLong(stats.firstDate)} · {plural(stats.activeDays, 'giorno attivo', 'giorni attivi')}
          </p>
        )}
      </header>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <StatTile
          label="Allenamenti"
          value={formatNumber(stats.totalWorkouts)}
          sub={`${stats.monthWorkouts} questo mese`}
          icon="dumbbell"
        />
        <StatTile
          label="Volume totale"
          value={formatKg(stats.totalVolume)}
          sub={`${formatNumber(stats.totalSets)} serie · ${formatNumber(stats.totalReps)} rep`}
          icon="scale"
        />
        <StatTile
          label="Questa settimana"
          value={String(stats.weekWorkouts)}
          sub={formatKg(stats.weekVolume)}
          icon="calendar"
        />
        <StatTile
          label="Serie attiva"
          value={`${stats.currentStreak} ${stats.currentStreak === 1 ? 'giorno' : 'giorni'}`}
          sub={`Record: ${stats.bestStreak} giorni`}
          icon="flame"
        />
      </div>

      {/* volume settimanale */}
      <Card className="mt-3 p-3.5">
        <div className="flex items-baseline justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
            Volume · ultime 8 settimane
          </p>
          <span className="text-[11px] text-faint tabular">
            max {formatKg(maxWeek)}
          </span>
        </div>
        <div className="mt-3 flex h-[104px] items-end gap-1.5">
          {stats.weekly.map((w, i) => {
            const h = w.volume > 0 ? Math.max(6, Math.round((w.volume / maxWeek) * 88)) : 3
            const isCurrent = i === stats.weekly.length - 1
            return (
              <div key={w.weekStart} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span
                  className={cx(
                    'text-[9px] tabular',
                    w.volume > 0 ? 'text-muted' : 'text-transparent',
                  )}
                >
                  {w.volume > 0 ? formatKg(w.volume).replace(' kg', '') : '0'}
                </span>
                <div
                  className={cx(
                    'w-full rounded-t-md transition-all',
                    isCurrent ? 'bg-lime' : w.volume > 0 ? 'bg-lime/35' : 'bg-surface3',
                  )}
                  style={{ height: h }}
                  title={`${weekLabel(w.weekStart)} · ${formatKg(w.volume)} · ${w.workouts} allenamenti`}
                />
                <span className={cx('text-[9px] tabular', isCurrent ? 'text-lime' : 'text-faint')}>
                  {weekLabel(w.weekStart).split(' ')[0]}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* gruppi muscolari */}
      {muscleMetric.rows.length > 0 && (
        <Card className="mt-3 p-3.5">
          <div className="flex items-baseline justify-between">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
              Gruppi muscolari
            </p>
            <span className="text-[10.5px] text-faint">per volume</span>
          </div>
          <div className="mt-3 space-y-2.5">
            {muscleMetric.rows.map((m) => {
              const metric = muscleMetric.byVolume ? m.volume : m.sets
              const total = muscleMetric.byVolume ? muscleMetric.totalVolume : muscleMetric.totalSets
              const pct = total > 0 ? (metric / total) * 100 : 0
              return (
                <div key={m.muscle}>
                  <div className="mb-1 flex items-center justify-between text-[11.5px]">
                    <span className="flex items-center gap-1.5 font-medium">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: MUSCLE_COLORS[m.muscle] ?? '#9AA396' }}
                      />
                      {m.muscle}
                    </span>
                    <span className="text-[10.5px] text-faint tabular">
                      {muscleMetric.byVolume ? formatKg(m.volume) : `${m.sets} serie`} · {Math.round(pct)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface3">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(3, pct)}%`,
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

      {/* top esercizi */}
      <section className="mt-5">
        <SectionTitle>Esercizi più allenati</SectionTitle>
        <div className="space-y-2">
          {stats.topExercises.map((e) => (
            <Card key={e.exerciseId} className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="h-7 w-1 shrink-0 rounded-full"
                  style={{ background: MUSCLE_COLORS[e.muscle] ?? '#9AA396' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">{e.name}</p>
                  <p className="text-[10.5px] text-faint">
                    {e.sessions} sessioni · {e.sets} serie · ultima {formatDate(e.lastDate)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[12.5px] font-semibold tabular">{formatKg(e.volume)}</p>
                  {e.bestWeight > 0 && (
                    <p className="text-[10px] text-faint tabular">max {formatWeight(e.bestWeight)} kg</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* record */}
      {bestSet.length > 0 && (
        <section className="mt-5 mb-2">
          <SectionTitle
            action={
              <span className="text-[10.5px] text-faint flex items-center gap-1">
                <Icon name="target" size={11} /> stima 1RM
              </span>
            }
          >
            Record personali
          </SectionTitle>
          <div className="space-y-2">
            {bestSet.map((e, i) => (
              <div
                key={e.exerciseId}
                className="flex items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 py-2.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-lime/10 text-[11px] font-bold text-lime">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-semibold">{e.name}</p>
                  <p className="text-[10px] text-faint">
                    {formatDate(e.lastDate)} · {e.sessions} sessioni
                  </p>
                </div>
                <Badge color="#C8FF3D">{formatWeight(Math.round(e.bestE1rm * 2) / 2)} kg</Badge>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
