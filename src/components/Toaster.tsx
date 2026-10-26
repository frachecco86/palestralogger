import { useEffect, useState } from 'react'
import { cx as cn, Icon } from './ui'
import { subscribeToast, type ToastKind } from '../lib/live'

interface ToastItem {
  id: number
  message: string
  kind: ToastKind
}

let seq = 0

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    return subscribeToast((message, kind) => {
      const id = ++seq
      setItems((prev) => [...prev.slice(-2), { id, message, kind }])
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id))
      }, 2600)
    })
  }, [])

  if (items.length === 0) return null

  return (
    <div className="fixed left-0 right-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            'animate-rise flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-medium shadow-xl max-w-[92%]',
            t.kind === 'ok'
              ? 'bg-surface2/95 border-line2 text-text'
              : 'bg-danger/15 border-danger/40 text-danger',
          )}
        >
          <Icon name={t.kind === 'ok' ? 'check' : 'info'} size={15} />
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}
