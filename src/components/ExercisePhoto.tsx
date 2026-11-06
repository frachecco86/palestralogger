import { useEffect, useState } from 'react'
import type { ExercisePhoto } from '../db/queries'
import { Button, Icon, Sheet, cx } from './ui'

function usePhotoUrl(photo: ExercisePhoto | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!photo) {
      setUrl(null)
      return
    }
    const blob = new Blob([photo.bytes as unknown as BlobPart], { type: photo.mime })
    const value = URL.createObjectURL(blob)
    setUrl(value)
    return () => URL.revokeObjectURL(value)
  }, [photo])

  return photo ? url : null
}

function ThumbImage({ photo }: { photo: ExercisePhoto }) {
  const url = usePhotoUrl(photo)
  if (!url) return null
  return <img src={url} alt="" className="h-full w-full object-cover" />
}

/** Miniatura accanto al nome dell'esercizio (o tasto per aggiungerla). */
export function ExerciseThumb({
  photo,
  editable = false,
  placeholder = false,
  size = 'sm',
  name,
  onClick,
}: {
  photo?: ExercisePhoto
  editable?: boolean
  /** Mostra un riquadro segnaposto quando la foto non c'è ancora. */
  placeholder?: boolean
  size?: 'sm' | 'md'
  name: string
  /** Se assente la miniatura è solo decorativa (es. dentro una riga cliccabile). */
  onClick?: () => void
}) {
  if (!photo && !editable && !placeholder) return null

  const content = (
    <>
      {photo ? (
        <ThumbImage photo={photo} />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Icon name="dumbbell" size={size === 'md' ? 17 : 15} />
        </span>
      )}
      {editable && photo && (
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-ink/75 py-[1px] text-lime">
          <Icon name="camera" size={9} />
        </span>
      )}
    </>
  )

  const className = cx(
    'relative shrink-0 overflow-hidden rounded-lg border',
    size === 'md' ? 'h-11 w-11' : 'h-9 w-9',
    photo ? 'border-line2 bg-surface2' : 'border-dashed border-line2 bg-surface2/60 text-faint',
    onClick && 'press',
  )

  if (!onClick) {
    return (
      <span aria-hidden="true" className={className}>
        {content}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={photo ? `Foto di ${name}` : `Aggiungi foto a ${name}`}
      className={className}
    >
      {content}
    </button>
  )
}

/** Immagine grande dell'esercizio, con segnaposto se la foto non c'è ancora. */
export function ExercisePhotoLarge({
  photo,
  name,
  className,
}: {
  photo?: ExercisePhoto
  name: string
  className?: string
}) {
  const url = usePhotoUrl(photo)

  return (
    <div
      className={cx(
        'relative flex w-full items-center justify-center overflow-hidden rounded-2xl border bg-surface2',
        url ? 'border-line' : 'border-dashed border-line2',
        className ?? 'h-52',
      )}
    >
      {url ? (
        <img src={url} alt={`Foto di ${name}`} className="h-full w-full object-contain" />
      ) : (
        <div className="flex flex-col items-center gap-1.5 text-faint">
          <Icon name="dumbbell" size={26} />
          <span className="text-[11px]">Nessuna foto</span>
        </div>
      )}
    </div>
  )
}

/** Anteprima grande (lettura) o gestione della foto (modifica). */
export function ExercisePhotoSheet({
  open,
  photo,
  exerciseName,
  editable,
  onClose,
  onReplace,
  onRemove,
}: {
  open: boolean
  photo?: ExercisePhoto
  exerciseName: string
  editable: boolean
  onClose: () => void
  onReplace?: () => void
  onRemove?: () => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title={exerciseName}>
      <div className="pb-5">
        <ExercisePhotoLarge photo={photo} name={exerciseName} className="h-[52vh]" />

        <div className="mt-4 space-y-2">
          {editable && onReplace && (
            <Button full variant="secondary" onClick={onReplace}>
              <Icon name="camera" size={15} /> {photo ? 'Sostituisci foto' : 'Aggiungi foto'}
            </Button>
          )}
          {editable && photo && onRemove && (
            <Button full variant="danger" onClick={onRemove}>
              <Icon name="trash" size={15} /> Rimuovi foto
            </Button>
          )}
          <Button full variant="ghost" onClick={onClose}>
            Chiudi
          </Button>
        </div>

        <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-faint">
          <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
          {editable
            ? 'La foto viene compressa sul telefono, resta disponibile offline e viene salvata anche nell’account.'
            : 'Le foto degli esercizi le gestisce solo l’amministratore dalla pagina Esercizi.'}
        </p>
      </div>
    </Sheet>
  )
}
