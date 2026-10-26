import { Icon, cx, type IconName } from './ui'
import type { WorkoutSummary } from '../lib/types'
import { MUSCLE_COLORS, type Muscle } from '../lib/types'
import { formatKg } from '../lib/format'
import { parseISO, MONTHS } from '../lib/dates'

export function WorkoutCard({
  workout,
  onClick,
  compact = false,
}: {
  workout: WorkoutSummary
  onClick: () => void
  compact?: boolean
}) {
  const d = parseISO(workout.date)
  const muscles = (workout.muscles || '').split(',').filter(Boolean) as Muscle[]
  const title = workout.name || (muscles.length > 0 ? muscles.slice(0, 2).join(' · ') : 'Allenamento')

  return (
    <button
      type="button"
      onClick={onClick}
      className="press w-full flex items-center gap-3 rounded-2xl bg-surface border border-line px-3 py-2.5 text-left hover:border-line2"
    >
      <span className="flex w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-surface2 border border-line py-1">
        <span className="text-[16px] font-bold leading-none tabular">{d.getDate()}</span>
        <span className="mt-0.5 text-[10px] uppercase tracking-wide text-muted leading-none">
          {MONTHS[d.getMonth()].slice(0, 3)}
        </span>
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="block truncate text-[14px] font-semibold">{title}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-[11.5px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Icon name="dumbbell" size={12} /> {workout.exercises}
          </span>
          <span className="inline-flex items-center gap-1">
            <Icon name="list" size={12} /> {workout.sets} serie
          </span>
          {!compact && workout.volume > 0 && (
            <span className="inline-flex items-center gap-1">
              <Icon name="scale" size={12} /> {formatKg(workout.volume)}
            </span>
          )}
        </span>
      </span>

      {muscles.length > 0 && (
        <span className="flex gap-0.5 shrink-0">
          {muscles.slice(0, 3).map((m) => (
            <span
              key={m}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: MUSCLE_COLORS[m] ?? '#9AA396' }}
            />
          ))}
        </span>
      )}
      <Icon name="right" size={15} className="text-faint shrink-0" />
    </button>
  )
}

export type Tab = 'home' | 'calendar' | 'stats' | 'exercises' | 'profile'

const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'home', label: 'Oggi', icon: 'home' },
  { id: 'calendar', label: 'Calendario', icon: 'calendar' },
  { id: 'stats', label: 'Statistiche', icon: 'chart' },
  { id: 'exercises', label: 'Esercizi', icon: 'dumbbell' },
]

export function BottomNav({
  tab,
  onNavigate,
  onNew,
}: {
  tab: Tab
  onNavigate: (t: Tab) => void
  onNew: () => void
}) {
  const left = TABS.slice(0, 2)
  const right = TABS.slice(2)
  const item = (t: { id: Tab; label: string; icon: IconName }) => {
    const active = tab === t.id
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => onNavigate(t.id)}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'press flex flex-col items-center justify-center gap-1 h-full rounded-xl',
          active ? 'text-lime' : 'text-muted',
        )}
      >
        <Icon name={t.icon} size={21} strokeWidth={active ? 2.2 : 1.8} />
        <span className="text-[9.5px] font-medium tracking-wide">{t.label}</span>
      </button>
    )
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto w-full max-w-md px-3 pb-[calc(env(safe-area-inset-bottom)+8px)]">
        <div className="relative rounded-[22px] border border-line2 bg-surface/95 backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.55)]">
          <div className="grid grid-cols-5 items-center h-[62px] px-1">
            {left.map(item)}
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={onNew}
                aria-label="Nuovo allenamento"
                className="press -mt-7 h-[54px] w-[54px] rounded-full bg-lime text-ink shadow-[0_8px_24px_rgba(200,255,61,0.3)] flex items-center justify-center border-4 border-ink"
              >
                <Icon name="plus" size={26} strokeWidth={2.6} />
              </button>
            </div>
            {right.map(item)}
          </div>
        </div>
      </div>
    </nav>
  )
}
