import { useState } from 'react'
import { Button, Icon, Sheet } from './ui'
import { APP_VERSION } from '../lib/version'
import { CHANGELOG } from '../lib/changelog'

export function Footer({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <footer className={`mx-auto w-full max-w-md px-4 pb-2 pt-7 text-center ${className ?? ''}`}>
        <p className="text-[9.5px] uppercase tracking-[0.22em] text-faint/80">
          <span className="font-semibold text-muted/90">CHECCO</span>{' '}
          <span className="normal-case tracking-[0.1em]">digital creaction</span>{' '}
          <span className="tabular tracking-[0.16em]">2026</span>
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="press mt-1.5 inline-flex items-center gap-1 rounded-full border border-line bg-surface/70 px-2.5 py-[3px] text-[9.5px] font-medium tracking-wide text-faint hover:border-line2 hover:text-muted"
        >
          <Icon name="info" size={10} /> versione {APP_VERSION}
        </button>
      </footer>

      <Sheet open={open} onClose={() => setOpen(false)} title="Novità di PalestraLogger">
        <div className="pb-6">
          <p className="text-[12px] leading-relaxed text-muted">
            Ogni aggiornamento porta qualcosa di nuovo. Qui trovi la storia delle versioni,
            spiegata in modo semplice.
          </p>

          <div className="mt-3 space-y-2.5">
            {CHANGELOG.map((entry, index) => (
              <div key={entry.version} className="rounded-2xl border border-line bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded-md border border-lime/25 bg-lime/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-lime">
                    v{entry.version}
                  </span>
                  <p className="min-w-0 flex-1 text-[13px] font-semibold leading-tight">
                    {entry.title}
                  </p>
                  {index === 0 && (
                    <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.08em] text-lime">
                      attuale
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-1.5">
                  {entry.items.map((item) => (
                    <li key={item} className="flex gap-1.5 text-[11.5px] leading-relaxed text-muted">
                      <span className="mt-[1px] shrink-0 text-lime">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-faint">
            <Icon name="lock" size={12} className="mt-0.5 shrink-0" />
            I tuoi dati restano tuoi: sync e amici sono opzionali.
          </p>

          <Button variant="secondary" full className="mt-4" onClick={() => setOpen(false)}>
            Chiudi
          </Button>
        </div>
      </Sheet>
    </>
  )
}
