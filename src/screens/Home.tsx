import { useLiveData } from '../lib/live'
import { getStats, listWorkouts } from '../db/queries'
import type { User } from '../lib/types'
import { addDays, formatDateLong, startOfWeek, todayISO, WEEKDAYS_MIN } from '../lib/dates'
import { formatKg, initials, plural } from '../lib/format'
import { Button, Card, EmptyState, Icon, SectionTitle, cx } from '../components/ui'
import { WorkoutCard } from '../components/Nav'

export function HomeScreen({
  user,
  onNew,
  onOpenWorkout,
  onGoCalendar,
  onGoStats,
  onGoProfile,
}: {
  user: User
  onNew: (date?: string) => void
  onOpenWorkout: (id: string) => void
  onGoCalendar: () => void
  onGoStats: () => void
  onGoProfile: () => void
}) {
  const today = todayISO()
  const stats = useLiveData(() => getStats(user.id, today), [user.id, today])
  const weekStart = startOfWeek(today)
  const weekWorkouts = useLiveData(
    () => listWorkouts(user.id, { from: weekStart, to: addDays(weekStart, 6) }),
    [user.id, weekStart],
  )
  const recent = useLiveData(() => listWorkouts(user.id, { limit: 4 }), [user.id])
  const todayWorkouts = recent.filter((w) => w.date === today)

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const dayVolume = new Map<string, number>()
  for (const w of weekWorkouts) dayVolume.set(w.date, (dayVolume.get(w.date) ?? 0) + w.volume)

  const firstName = user.name.split(' ')[0]

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-[max(16px,env(safe-area-inset-top))]">
      {/* header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11.5px] uppercase tracking-[0.1em] text-muted">
            {formatDateLong(today)}
          </p>
          <h1 className="mt-0.5 text-[25px] font-bold leading-tight tracking-tight truncate">
            Ciao, {firstName}
          </h1>
        </div>
        <button
          type="button"
          onClick={onGoProfile}
          aria-label="Profilo"
          className="press h-10 w-10 shrink-0 rounded-2xl bg-lime/15 border border-lime/30 text-lime text-[13px] font-bold flex items-center justify-center"
        >
          {initials(user.name)}
        </button>
      </header>

      {/* chips */}
      <div className="mt-3 flex items-center gap-1.5">
        <span
          className={cx(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium',
            stats.currentStreak > 0
              ? 'bg-lime/10 border-lime/25 text-lime'
              : 'bg-surface2 border-line text-muted',
          )}
        >
          <Icon name="flame" size={13} />
          {stats.currentStreak > 0 ? `${plural(stats.currentStreak, 'giorno', 'giorni')} di fila` : 'Nessun giorno di fila'}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface2 border border-line px-2.5 py-1 text-[11.5px] text-muted">
          <Icon name="calendar" size={12} /> {stats.weekWorkouts} questa settimana
        </span>
      </div>

      {/* oggi / nuovo */}
      <div className="mt-4">
        {todayWorkouts.length > 0 ? (
          <div className="rounded-3xl border border-lime/25 bg-gradient-to-b from-lime/[0.12] to-surface p-4">
            <div className="flex items-center justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-lime">
                Allenamento di oggi
              </p>
              <Icon name="check" size={16} className="text-lime" strokeWidth={2.6} />
            </div>
            <p className="mt-1.5 text-[19px] font-semibold leading-tight">
              {todayWorkouts[0].name ||
                todayWorkouts[0].muscles.split(',').slice(0, 2).join(' · ') ||
                'Allenamento'}
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {plural(todayWorkouts[0].sets, 'serie', 'serie')} ·{' '}
              {formatKg(todayWorkouts[0].volume)}
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => onOpenWorkout(todayWorkouts[0].id)}>
                Apri
              </Button>
              <Button size="sm" variant="secondary" onClick={() => onNew(today)}>
                <Icon name="plus" size={14} /> Aggiungi
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onNew(today)}
            className="press w-full rounded-3xl bg-lime text-ink px-4 py-3.5 flex items-center gap-3 text-left"
          >
            <span className="h-10 w-10 rounded-2xl bg-ink/10 flex items-center justify-center">
              <Icon name="plus" size={22} strokeWidth={2.6} />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-bold leading-tight">Nuovo allenamento</span>
              <span className="block text-[11.5px] font-medium text-ink/65">
                Data, esercizi e serie in pochi tap
              </span>
            </span>
            <Icon name="right" size={18} strokeWidth={2.4} />
          </button>
        )}
      </div>

      {/* settimana */}
      <Card className="mt-3 p-3.5">
        <div className="flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
            Questa settimana
          </p>
          <button
            type="button"
            onClick={onGoStats}
            className="text-[11.5px] text-lime font-medium flex items-center gap-0.5"
          >
            Statistiche <Icon name="right" size={12} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {weekDays.map((day, i) => {
            const vol = dayVolume.get(day) ?? 0
            const trained = weekWorkouts.some((w) => w.date === day)
            const isToday = day === today
            return (
              <div key={day} className="flex flex-col items-center gap-1">
                <span className="text-[9.5px] uppercase text-faint">{WEEKDAYS_MIN[i]}</span>
                <span
                  className={cx(
                    'flex h-8 w-full items-center justify-center rounded-lg border text-[12px] font-semibold tabular',
                    trained
                      ? 'bg-lime/15 border-lime/40 text-lime'
                      : isToday
                        ? 'bg-surface2 border-line2 text-text'
                        : 'bg-surface2/50 border-line text-muted',
                  )}
                  title={trained ? formatKg(vol) : undefined}
                >
                  {Number(day.slice(8))}
                </span>
              </div>
            )
          })}
        </div>

        <div className="mt-3 grid grid-cols-3 divide-x divide-line rounded-xl bg-surface2/60 border border-line">
          {[
            { label: 'Allenamenti', value: String(stats.weekWorkouts) },
            { label: 'Volume', value: formatKg(stats.weekVolume) },
            { label: 'Serie', value: String(stats.weekly[stats.weekly.length - 1]?.sets ?? 0) },
          ].map((s) => (
            <div key={s.label} className="px-2 py-2 text-center">
              <p className="text-[14px] font-bold tabular leading-tight">{s.value}</p>
              <p className="text-[9.5px] uppercase tracking-wide text-faint mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* recenti */}
      <section className="mt-5">
        <SectionTitle
          action={
            recent.length > 0 ? (
              <button
                type="button"
                onClick={onGoCalendar}
                className="text-[11.5px] text-muted flex items-center gap-0.5"
              >
                Tutti <Icon name="right" size={12} />
              </button>
            ) : undefined
          }
        >
          Ultimi allenamenti
        </SectionTitle>

        {recent.length === 0 ? (
          <Card>
            <EmptyState
              icon="dumbbell"
              title="Ancora nessun allenamento"
              text="Inizia oggi: scegli gli esercizi dalla lista (panca, leg press, squat…) e registra le serie."
              action={
                <Button size="sm" onClick={() => onNew(today)}>
                  <Icon name="plus" size={15} /> Registra il primo
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {recent.map((w) => (
              <WorkoutCard key={w.id} workout={w} onClick={() => onOpenWorkout(w.id)} />
            ))}
          </div>
        )}
      </section>

      {/* totale */}
      {stats.totalWorkouts > 0 && (
        <div className="mt-4 mb-2 rounded-2xl border border-line bg-surface/60 px-3.5 py-3 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-muted">Totale dal {stats.firstDate?.split('-')[2]}/{stats.firstDate?.split('-')[1]}</p>
            <p className="text-[13px] font-semibold">
              {plural(stats.totalWorkouts, 'allenamento', 'allenamenti')} · {formatKg(stats.totalVolume)}
            </p>
          </div>
          <button
            type="button"
            onClick={onGoStats}
            className="press h-9 w-9 rounded-xl bg-surface2 border border-line flex items-center justify-center text-lime"
            aria-label="Apri statistiche"
          >
            <Icon name="chart" size={17} />
          </button>
        </div>
      )}
    </div>
  )
}
