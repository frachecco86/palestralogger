import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

// ---------- Icone ----------

export type IconName =
  | 'home'
  | 'calendar'
  | 'chart'
  | 'dumbbell'
  | 'user'
  | 'plus'
  | 'minus'
  | 'left'
  | 'right'
  | 'down'
  | 'search'
  | 'check'
  | 'trash'
  | 'close'
  | 'flame'
  | 'clock'
  | 'trend'
  | 'download'
  | 'upload'
  | 'logout'
  | 'edit'
  | 'info'
  | 'back'
  | 'list'
  | 'spark'
  | 'lock'
  | 'target'
  | 'scale'
  | 'cloud'
  | 'copy'
  | 'refresh'

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3.5 10.5 12 3.5l8.5 7M5.5 9.5V20h13V9.5" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M8 3.5V6M16 3.5V6M3.5 10h17" />
    </>
  ),
  chart: <path d="M4 20V11m5.3 9V5.5m5.4 14.5v-6.5M20 20V8" />,
  dumbbell: <path d="M6.5 8v8M3.5 10v4M17.5 8v8M20.5 10v4M6.5 12h11" />,
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c.6-3.6 3.6-5.6 7.2-5.6s6.6 2 7.2 5.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  left: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  right: <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  down: <path d="M6 9.5 12 15.5 18 9.5" />,
  back: <path d="M15.5 5 8.5 12l7 7" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  check: <path d="m4.5 12.5 4.7 4.7L19.5 6.8" />,
  trash: <path d="M4 7h16M9 7V4.8h6V7m-8 0 .8 13h8.4L17 7M10.2 10.5v6M13.8 10.5v6" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  flame: (
    <path d="M12 3.5s5 4.2 5 9a5 5 0 0 1-10 0c0-2.2 1.2-4 2.4-5.3.3 1.4 1 2.3 2 2.8.4-2.4.6-4.2.6-6.5Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  trend: <path d="m4 16 5-5 3.5 3.5L20 7m0 0h-4.5M20 7v4.5" />,
  download: <path d="M12 4v11m0 0 4-4m-4 4-4-4M4.5 19.5h15" />,
  upload: <path d="M12 20V9m0 0 4 4M12 9l-4 4M4.5 4.5h15" />,
  logout: <path d="M14 7V4.8H5V19.2h9V17m2-8.5 3.5 3.5L16 15.5M10 12h9.5" />,
  edit: <path d="m14.5 5.5 4 4L8.2 19.8H4.2v-4L14.5 5.5Zm-2 2 4 4" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M12 11v5.2M12 8h.01" />
    </>
  ),
  list: <path d="M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01" />,
  spark: <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6.2 6.2l2.8 2.8m6 6 2.8 2.8m0-11.6-2.8 2.8m-6 6-2.8 2.8" />,
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5M12 14.5v2.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="12" cy="12" r="0.6" />
    </>
  ),
  scale: <path d="M12 4v16M7 7.5 4.5 14h5L7 7.5Zm10 0L14.5 14h5L17 7.5Z" />,
  cloud: <path d="M7 18h9.5a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 9.2 4.4 4.4 0 0 0 7 18Z" />,
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2.2" />
      <path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9" />
    </>
  ),
  refresh: <path d="M20 11a8 8 0 0 0-13.7-4.6L4 8.5M4 5v3.5H7.5M4 13a8 8 0 0 0 13.7 4.6L20 15.5M20 19v-3.5h-3.5" />,
}

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.9,
}: {
  name: IconName
  size?: number
  className?: string
  strokeWidth?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}

// ---------- Bottoni ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  type = 'button',
  full,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  full?: boolean
}) {
  const variants: Record<ButtonVariant, string> = {
    primary: 'bg-lime text-ink font-semibold hover:bg-lime/90 disabled:bg-lime/30 disabled:text-ink/50',
    secondary:
      'bg-surface2 text-text border border-line2 hover:bg-surface3 disabled:opacity-40',
    ghost: 'text-muted hover:text-text hover:bg-surface2 disabled:opacity-40',
    danger: 'bg-danger/15 text-danger border border-danger/30 hover:bg-danger/25',
  }
  const sizes = {
    sm: 'h-9 px-3 text-[13px] rounded-xl gap-1.5',
    md: 'h-11 px-4 text-sm rounded-2xl gap-2',
    lg: 'h-14 px-5 text-[15px] rounded-2xl gap-2.5',
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'press inline-flex items-center justify-center select-none',
        variants[variant],
        sizes[size],
        full && 'w-full',
        className,
      )}
    >
      {children}
    </button>
  )
}

// ---------- Superfici ----------

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode
  className?: string
  onClick?: () => void
}) {
  const base = cx('rounded-2xl bg-surface border border-line', className)
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cx(base, 'press w-full text-left')}>
        {children}
      </button>
    )
  }
  return <div className={base}>{children}</div>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-2.5 mt-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h2>
      {action}
    </div>
  )
}

// ---------- Sheet ----------

export function Sheet({
  open,
  onClose,
  title,
  children,
  full = false,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  full?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-[2px] animate-fade"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cx(
          'relative w-full max-w-md bg-surface border-t border-line2 rounded-t-[26px] animate-rise',
          'max-h-[92dvh] flex flex-col shadow-[0_-20px_60px_rgba(0,0,0,0.6)]',
          full && 'h-[92dvh]',
        )}
      >
        <div className="pt-2.5 flex justify-center shrink-0">
          <div className="h-1 w-10 rounded-full bg-line2" />
        </div>
        {title && (
          <div className="flex items-center justify-between px-4 py-3 shrink-0">
            <h2 className="text-base font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="press h-9 w-9 -mr-1 rounded-full flex items-center justify-center text-muted hover:text-text hover:bg-surface2"
              aria-label="Chiudi"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain px-4 pb-safe flex-1">{children}</div>
      </div>
    </div>
  )
}

// ---------- Form ----------

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[12px] font-medium uppercase tracking-wide text-muted">{label}</span>
        {hint && <span className="text-[11px] text-faint">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export const inputClass =
  'w-full h-12 rounded-2xl bg-surface2 border border-line2 px-3.5 text-[15px] text-text placeholder:text-faint outline-none focus:border-lime/60 focus:ring-2 focus:ring-lime/15'

export function Chip({
  active,
  onClick,
  children,
  dot,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  dot?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'press shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12.5px] font-medium border',
        active
          ? 'bg-lime text-ink border-lime'
          : 'bg-surface2/70 text-muted border-line2 hover:text-text',
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? '#0A0C09' : dot }} />}
      {children}
    </button>
  )
}

export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        color: color ?? 'var(--color-muted)',
        background: color ? `${color}1f` : 'var(--color-surface2)',
      }}
    >
      {children}
    </span>
  )
}

export function EmptyState({
  icon = 'spark',
  title,
  text,
  action,
}: {
  icon?: IconName
  title: string
  text?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-9">
      <div className="h-12 w-12 rounded-2xl bg-surface2 border border-line flex items-center justify-center text-lime mb-3">
        <Icon name={icon} size={22} />
      </div>
      <p className="text-sm font-semibold">{title}</p>
      {text && <p className="text-[12.5px] text-muted mt-1 max-w-[260px] leading-relaxed">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ---------- Numeri ----------

export function NumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max = 9999,
  suffix,
  decimals = 0,
  width = 'w-[72px]',
  ariaLabel,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  suffix?: string
  decimals?: number
  width?: string
  ariaLabel?: string
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v * 10) / 10))
  const [draft, setDraft] = useState<string | null>(null)
  const shown =
    draft ??
    (decimals > 0 && !Number.isInteger(value) ? value.toFixed(1).replace('.', ',') : String(value))
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={`Diminuisci ${ariaLabel ?? ''}`}
        onClick={() => onChange(clamp(value - step))}
        className="press h-8 w-8 rounded-lg bg-surface3 border border-line2 text-muted flex items-center justify-center"
      >
        <Icon name="minus" size={14} strokeWidth={2.4} />
      </button>
      <div className={cx('relative', width)}>
        <input
          inputMode="decimal"
          aria-label={ariaLabel}
          value={shown}
          onFocus={() => setDraft(shown)}
          onChange={(e) => {
            const raw = e.target.value.replace(',', '.').replace(/[^\d.]/g, '')
            setDraft(raw)
            const n = Number(raw)
            if (raw !== '' && !Number.isNaN(n)) onChange(clamp(n))
          }}
          onBlur={() => setDraft(null)}
          className="h-8 w-full rounded-lg bg-surface3 border border-line2 text-center text-[13.5px] font-semibold tabular outline-none focus:border-lime/60"
        />
        {suffix && (
          <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] text-faint pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      <button
        type="button"
        aria-label={`Aumenta ${ariaLabel ?? ''}`}
        onClick={() => onChange(clamp(value + step))}
        className="press h-8 w-8 rounded-lg bg-surface3 border border-line2 text-muted flex items-center justify-center"
      >
        <Icon name="plus" size={14} strokeWidth={2.4} />
      </button>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'press h-6 w-10 rounded-full border transition-colors relative',
        checked ? 'bg-lime border-lime' : 'bg-surface3 border-line2',
      )}
      aria-label={label}
    >
      <span
        className={cx(
          'absolute top-[2px] rounded-full transition-all',
          checked ? 'left-[18px] bg-ink' : 'left-[2px] bg-muted',
        )}
        style={{ height: 18, width: 18 }}
      />
    </button>
  )
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx('h-px bg-line', className)} />
}
