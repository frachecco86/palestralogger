import { useEffect, useRef, useState } from 'react'
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

interface BackgroundPhoto {
  url: string
  image: HTMLImageElement
}

function loadPhoto(file: File): Promise<BackgroundPhoto> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => resolve({ url, image })
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Immagine non leggibile'))
    }
    image.src = url
  })
}

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
  const [style, setStyle] = useState<ShareCardStyle>('foto')
  const [images, setImages] = useState<ShareImages>({})
  const [photo, setPhoto] = useState<BackgroundPhoto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const photoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!photo) return
    return () => {
      URL.revokeObjectURL(photo.url)
    }
  }, [photo])

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
        const canvas = renderWorkoutCard({
          workout,
          userName,
          style: variant.id,
          // la foto vale solo per lo stile «Con foto»
          photo: variant.id === 'foto' ? photo?.image : null,
        })
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
  }, [open, workout, userName, photo])

  const current = images[style] ?? null
  const currentVariant = SHARE_CARD_STYLES.find((variant) => variant.id === style)

  async function choosePhoto(file: File) {
    if (!file.type.startsWith('image/')) {
      toast('Il file scelto non è un’immagine', 'err')
      return
    }
    try {
      const next = await loadPhoto(file)
      setPhoto(next)
      setStyle('foto')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Foto non leggibile', 'err')
    }
  }

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
          Due versioni, verticali <span className="text-text">9:16</span>: con la tua foto come
          sfondo (stile Strava) oppure solo con i dati. Nome, data, serie, esercizi e carichi sono
          sempre inclusi.
        </p>

        {/* scelta stile con anteprima */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {SHARE_CARD_STYLES.map((variant) => {
            const active = variant.id === style
            const thumb = images[variant.id]
            return (
              <button
                key={variant.id}
                type="button"
                onClick={() => setStyle(variant.id)}
                aria-pressed={active}
                aria-label={`Stile ${variant.label}`}
                className={cx(
                  'press flex items-center gap-2 rounded-xl border p-1.5 text-left',
                  active ? 'border-lime/60 bg-lime/10' : 'border-line bg-surface2/50',
                )}
              >
                <span className="block w-12 shrink-0 overflow-hidden rounded-lg bg-ink" style={{ aspectRatio: '9 / 16' }}>
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
                <span className="min-w-0">
                  <span
                    className={cx(
                      'block text-[12px] font-semibold leading-tight',
                      active ? 'text-lime' : 'text-text',
                    )}
                  >
                    {variant.label}
                  </span>
                  <span className="mt-0.5 block text-[10px] leading-snug text-faint">
                    {variant.id === 'foto'
                      ? photo
                        ? 'Foto caricata'
                        : 'Scegli una foto'
                      : 'Nessuna immagine'}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <p className="mt-2 min-h-[16px] text-[11px] text-faint">{currentVariant?.hint}</p>

        {style === 'foto' && (
          <div className="mt-1 flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              full
              onClick={() => photoInputRef.current?.click()}
              ariaLabel="Scegli la foto di sfondo"
            >
              <Icon name="camera" size={15} /> {photo ? 'Cambia foto di sfondo' : 'Scegli foto di sfondo'}
            </Button>
            {photo && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setPhoto(null)}
                ariaLabel="Rimuovi foto di sfondo"
              >
                <Icon name="trash" size={15} />
              </Button>
            )}
          </div>
        )}

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
          L'immagine contiene solo questo allenamento: nessun dato di amici o di sync. La foto di
          sfondo resta sul telefono e non viene caricata altrove.
        </p>

        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void choosePhoto(file)
            e.target.value = ''
          }}
        />
      </div>
    </Sheet>
  )
}
