import { useEffect, useState } from 'react'
import type { WorkoutDetail } from '../lib/types'
import { toast } from '../lib/live'
import {
  SHARE_CARD_STYLES,
  cardFileName,
  cardShareText,
  canvasToBlob,
  downloadBlob,
  renderWorkoutCard,
  shareImage,
  type ShareCardStyle,
} from '../lib/share-card'
import { Button, Icon, Sheet, cx } from './ui'

interface ShareImage {
  url: string
  blob: Blob
  filename: string
}

type ShareImages = Partial<Record<ShareCardStyle, ShareImage>>

export function ShareWorkoutSheet({
  open,
  onClose,
  workout,
  userName,
}: {
  open: boolean
  onClose: () => void
  workout: WorkoutDetail
  userName: string
}) {
  const [style, setStyle] = useState<ShareCardStyle>('completo')
  const [images, setImages] = useState<ShareImages>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    const urls: string[] = []
    setImages({})
    setError(null)
    setBusy(false)

    // una variante alla volta: un solo canvas in memoria anche sui telefoni più lenti
    const build = async () => {
      for (const variant of SHARE_CARD_STYLES) {
        const canvas = renderWorkoutCard({ workout, userName, style: variant.id })
        const blob = await canvasToBlob(canvas)
        if (!alive) return
        const url = URL.createObjectURL(blob)
        urls.push(url)
        const image: ShareImage = { url, blob, filename: cardFileName(workout, variant.id) }
        setImages((previous) => ({ ...previous, [variant.id]: image }))
      }
    }

    void build().catch((e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : 'Immagine non disponibile')
    })

    return () => {
      alive = false
      urls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [open, workout, userName])

  const current = images[style] ?? null
  const currentVariant = SHARE_CARD_STYLES.find((variant) => variant.id === style)

  async function handleShare() {
    if (!current) return
    setBusy(true)
    try {
      const outcome = await shareImage(
        current.blob,
        current.filename,
        'PalestraLogger',
        cardShareText(workout),
      )
      if (outcome === 'downloaded') {
        toast('Immagine salvata: condividila dalla galleria')
      } else if (outcome === 'shared') {
        onClose()
      }
    } catch {
      toast('Condivisione non riuscita', 'err')
    } finally {
      setBusy(false)
    }
  }

  function handleDownload() {
    if (!current) return
    downloadBlob(current.blob, current.filename)
    toast('Immagine salvata')
  }

  return (
    <Sheet open={open} onClose={onClose} title="Condividi l'allenamento">
      <div className="pb-6">
        <p className="text-[12px] leading-relaxed text-muted">
          Scegli lo stile: l'immagine è verticale <span className="text-text">9:16</span>, pronta per
          storie, chat e social.
        </p>

        {/* scelta stile con anteprima */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {SHARE_CARD_STYLES.map((variant) => {
            const active = variant.id === style
            const thumb = images[variant.id]
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setStyle(variant.id)}
                aria-pressed={active}
                className={cx(
                  'press flex flex-col items-center gap-1.5 rounded-xl border p-1.5',
                  active ? 'border-lime/60 bg-lime/10' : 'border-line bg-surface2/50',
                )}
              >
                <span className="block w-full overflow-hidden rounded-lg bg-ink" style={{ aspectRatio: '9 / 16' }}>
                  {thumb ? (
                    <img
                      src={thumb.url}
                      alt={`Anteprima stile ${variant.label}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="block h-full w-full animate-pulse bg-surface3" />
                  )}
                </span>
                <span
                  className={cx(
                    'text-[11px] font-semibold leading-none',
                    active ? 'text-lime' : 'text-muted',
                  )}
                >
                  {variant.label}
                </span>
              </button>
            )
          })}
        </div>

        <p className="mt-2 min-h-[16px] text-[11px] text-faint">{currentVariant?.hint}</p>

        {/* anteprima grande */}
        <div className="mt-2 flex justify-center">
          <div className="relative overflow-hidden rounded-[18px] border border-line2 bg-ink shadow-[0_18px_50px_rgba(0,0,0,0.6)]">
            {current ? (
              <img
                src={current.url}
                alt="Anteprima dell'immagine dell'allenamento"
                className="block h-auto max-h-[36vh] w-auto"
              />
            ) : (
              <div className="flex h-[36vh] w-[204px] flex-col items-center justify-center gap-2 text-faint">
                {error ? (
                  <>
                    <Icon name="info" size={20} className="text-danger" />
                    <span className="px-4 text-center text-[11.5px] text-danger">{error}</span>
                  </>
                ) : (
                  <>
                    <span className="h-6 w-6 animate-spin rounded-full border-2 border-line2 border-t-lime" />
                    <span className="text-[11.5px]">Preparo le immagini…</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-faint">
          <span className="inline-flex items-center gap-1">
            <Icon name="share" size={11} /> 1080 × 1920 px · PNG
          </span>
          <span>{workout.entries.length} esercizi</span>
        </div>

        <div className="mt-3 flex gap-2">
          <Button full onClick={() => void handleShare()} disabled={!current || busy}>
            <Icon name="share" size={16} />
            {busy ? 'Apro…' : 'Condividi'}
          </Button>
          <Button full variant="secondary" onClick={handleDownload} disabled={!current}>
            <Icon name="download" size={16} /> Salva
          </Button>
        </div>

        <p className="mt-3 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-faint">
          <Icon name="lock" size={12} className="mt-0.5 shrink-0" />
          L'immagine contiene solo questo allenamento: nessun dato di amici o di sync.
        </p>
      </div>
    </Sheet>
  )
}
