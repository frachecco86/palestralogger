import { useMemo, useState } from 'react'
import type { User } from '../lib/types'
import { getDayAggregates, listWorkouts } from '../db/queries'
import {
  MONTHS,
  WEEKDAYS_MIN,
  endOfMonth,
  formatDate,
  formatDateLong,
  monthGrid,
  startOfMonth,
  todayISO,
} from '../lib/dates'
import { formatKg, plural } from '../lib/format'
import { Button, Card, EmptyState, Icon, cx } from '../components/ui'
import { WorkoutCard } from '../components/Nav'
import { useLiveData } from '../lib/live'

export function CalendarScreen({
  user,
  onNew,
  onOpenWorkout,
  onGoStats,
}: {
  user: User
  onNew: (date: string) => void
  onOpenWorkout: (id: string) => void
  onGoStats: () => void
}) {
  const today = todayISO()
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [selected, setSelected] = useState(today)

  const grid = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor])
  const from = grid[0]
  const to = grid[grid.length - 1]

  const aggregates = useLiveData(
    () => getDayAggregates(user.id, startOfMonth(from), endOfMonth(to)),
    [user.id, from, to],
  )
  const byDay = useMemo(() => new Map(aggregates.map((a) => [a.date, a])), [aggregates])
  const monthDays = aggregates.filter((a) => a.date.slice(0, 7) === `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`)
  const monthWorkouts = monthDays.reduce((s, d) => s + d.workouts, 0)
  const monthVolume = monthDays.reduce((s, d) => s + d.volume, 0)
  const maxVolume = Math.max(1, ...monthDays.map((d) => d.volume))

  const dayWorkouts = useLiveData(
    () => listWorkouts(user.id, { from: selected, to: selected }),
    [user.id, selected],
  )

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  }

  const monthPrefix = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-[11.5px] uppercase tracking-[0.1em] text-muted">Calendario</p>
          <h1 className="mt-0.5 text-[24px] font-bold leading-tight tracking-tight">
            {MONTHS[cursor.month]} {cursor.year}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          {monthPrefix !== today.slice(0, 7) && (
            <button
              type="button"
              onClick={() => {
                const d = new Date()
                setCursor({ year: d.getFullYear(), month: d.getMonth() })
                setSelected(today)
              }}
              className="press rounded-lg bg-surface2 border border-line px-2 py-1.5 text-[11px] text-muted"
            >
              Oggi
            </button>
          )}
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Mese precedente"
            className="press flex h-9 w-9 items-center justify-center rounded-xl bg-surface2 border border-line text-muted"
          >
            <Icon name="left" size={17} />
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label="Mese successivo"
            className="press flex h-9 w-9 items-center justify-center rounded-xl bg-surface2 border border-line text-muted"
          >
            <Icon name="right" size={17} />
          </button>
        </div>
      </header>

      <Card className="mt-3 p-3">
        <div className="grid grid-cols-7 gap-1 pb-1">
          {WEEKDAYS_MIN.map((d, i) => (
            <span
              key={i}
              className="text-center text-[9.5px] font-medium uppercase tracking-wide text-faint"
            >
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.map((day) => {
            const inMonth = day.startsWith(monthPrefix)
            const agg = byDay.get(day)
            const trained = !!agg && agg.workouts > 0
            const intensity = trained ? 0.16 + 0.34 * (agg.volume / maxVolume) : 0
            const isSelected = day === selected
            const isToday = day === today
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelected(day)}
                aria-label={`${formatDateLong(day)}${trained ? `, ${plural(agg.workouts, 'allenamento', 'allenamenti')}` : ''}`}
                aria-pressed={isSelected}
                className={cx(
                  'relative flex h-10 flex-col items-center justify-center rounded-lg border text-[12px] font-semibold tabular transition-colors',
                  isSelected
                    ? 'border-lime bg-lime/15 text-lime'
                    : isToday
                      ? 'border-line2 bg-surface2 text-text'
                      : 'border-transparent text-muted hover:bg-surface2',
                  !inMonth && 'opacity-35',
                )}
                style={
                  trained && !isSelected
                    ? { background: `rgba(200,255,61,${intensity})`, borderColor: 'rgba(200,255,61,0.22)', color: '#E9FFC2' }
                    : undefined
                }
              >
                {Number(day.slice(8))}
                {trained && (
                  <span
                    className={cx(
                      'absolute bottom-1 h-1 w-1 rounded-full',
                      isSelected ? 'bg-lime' : 'bg-lime/80',
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>

        <div className="mt-2 flex items-center justify-between border-t border-line pt-2.5 text-[11px] text-muted">
          <span>{plural(monthWorkouts, 'allenamento', 'allenamenti')}</span>
          <span className="tabular">{formatKg(monthVolume)}</span>
          <button
            type="button"
            onClick={onGoStats}
            className="flex items-center gap-0.5 text-lime font-medium"
          >
            Stats <Icon name="right" size={11} />
          </button>
        </div>
      </Card>

      {/* giorno selezionato */}
      <section className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold">{formatDateLong(selected)}</h2>
            <p className="text-[11px] text-muted">
              {dayWorkouts.length === 0
                ? 'Nessun allenamento'
                : `${plural(dayWorkouts.length, 'allenamento', 'allenamenti')} · ${formatKg(
                    dayWorkouts.reduce((s, w) => s + w.volume, 0),
                  )}`}
            </p>
          </div>
          <Button size="sm" onClick={() => onNew(selected)}>
            <Icon name="plus" size={15} /> Aggiungi
          </Button>
        </div>

        {dayWorkouts.length === 0 ? (
          <Card>
            <EmptyState
              icon="calendar"
              title={selected === today ? 'Giorno di riposo?' : 'Giornata libera'}
              text={
                selected === today
                  ? 'Nessun allenamento registrato oggi. Puoi aggiungerlo in qualsiasi momento.'
                  : `Nessun allenamento il ${formatDate(selected)}.`
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {dayWorkouts.map((w) => (
              <WorkoutCard key={w.id} workout={w} onClick={() => onOpenWorkout(w.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
