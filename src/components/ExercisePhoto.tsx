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
  editable,
  name,
  onClick,
}: {
  photo?: ExercisePhoto
  editable: boolean
  name: string
  onClick: () => void
}) {
  if (!photo && !editable) return null
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={photo ? `Foto di ${name}` : `Aggiungi foto a ${name}`}
      className={cx(
        'press relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border',
        photo
          ? 'border-line2 bg-surface2'
          : 'border-dashed border-line2 bg-surface2/60 text-faint',
      )}
    >
      {photo ? (
        <ThumbImage photo={photo} />
      ) : (
        <span className="flex h-full w-full items-center justify-center">
          <Icon name="camera" size={15} />
        </span>
      )}
      {editable && photo && (
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-ink/75 py-[1px] text-lime">
          <Icon name="camera" size={9} />
        </span>
      )}
    </button>
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
  onReplace: () => void
  onRemove: () => void
}) {
  const url = usePhotoUrl(open ? photo : null)

  return (
    <Sheet open={open} onClose={onClose} title={exerciseName}>
      <div className="pb-5">
        {url ? (
          <img
            src={url}
            alt={`Foto di ${exerciseName}`}
            className="max-h-[52vh] w-full rounded-2xl border border-line bg-surface2 object-contain"
          />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-2xl border border-dashed border-line2 text-[12px] text-faint">
            Nessuna foto
          </div>
        )}

        <div className="mt-4 space-y-2">
          {editable && (
            <Button full variant="secondary" onClick={onReplace}>
              <Icon name="camera" size={15} /> {photo ? 'Sostituisci foto' : 'Aggiungi foto'}
            </Button>
          )}
          {editable && photo && (
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
          La foto viene compressa sul telefono, resta disponibile offline e viene salvata anche nel
          tuo account.
        </p>
      </div>
    </Sheet>
  )
}
