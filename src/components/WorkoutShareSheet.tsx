import { useEffect, useMemo, useState } from 'react'
import { Badge, Button, Card, EmptyState, Icon, Sheet, cx, inputClass } from './ui'
import { toast } from '../lib/live'
import { formatDate } from '../lib/dates'
import { initials, plural } from '../lib/format'
import {
  deleteIncomingWorkout,
  importIncomingWorkout,
  listIncomingWorkouts,
  listShareUsers,
  sendWorkoutToUser,
  type IncomingWorkout,
  type ShareUser,
} from '../lib/workout-share'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Operazione non riuscita'
}

/** Scelta dell'utente a cui inviare una copia dell'allenamento. */
export function ShareWorkoutWithUserSheet({
  open,
  onClose,
  userId,
  workoutId,
  workoutName,
}: {
  open: boolean
  onClose: () => void
  userId: string
  workoutId: string
  workoutName: string
}) {
  const [users, setUsers] = useState<ShareUser[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [sendingTo, setSendingTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    setQuery('')
    setError(null)
    setLoading(true)
    void listShareUsers()
      .then((list) => {
        if (alive) setUsers(list)
      })
      .catch((e: unknown) => {
        if (alive) setError(errorMessage(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open])

  const q = query.trim().toLowerCase()
  const filtered = useMemo(
    () => users.filter((u) => (q ? u.name.toLowerCase().includes(q) : true)),
    [users, q],
  )

  async function send(user: ShareUser) {
    setSendingTo(user.uid)
    setError(null)
    try {
      await sendWorkoutToUser(userId, workoutId, user.uid)
      toast(`Allenamento inviato a ${user.name}`)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSendingTo(null)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Condividi con un utente">
      <div className="pb-6">
        <p className="text-[12px] leading-relaxed text-muted">
          Invii una copia di <span className="text-text">{workoutName || 'questo allenamento'}</span>{' '}
          con esercizi, serie e note. Chi la riceve può importarla, modificarla e salvarla come
          allenamento suo.
        </p>

        <div className="relative mt-3">
          <Icon
            name="search"
            size={17}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
          />
          <input
            className={cx(inputClass, 'pl-10')}
            placeholder="Cerca un utente…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputMode="search"
          />
        </div>

        <div className="mt-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-faint">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-line2 border-t-lime" />
              Carico gli utenti…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon="users"
              title={users.length === 0 ? 'Nessun altro utente' : 'Nessun utente trovato'}
              text={
                users.length === 0
                  ? 'Quando altri account usano l’app compaiono qui.'
                  : 'Prova con un altro nome.'
              }
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {filtered.map((user) => (
                <li key={user.uid}>
                  <button
                    type="button"
                    disabled={sendingTo !== null}
                    onClick={() => void send(user)}
                    className="press flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime/15 border border-lime/25 text-[12px] font-bold text-lime">
                      {initials(user.name)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {user.name}
                    </span>
                    <span className="shrink-0 text-[11.5px] text-faint">
                      {sendingTo === user.uid ? 'Invio…' : 'Invia'}
                    </span>
                    <Icon name="share" size={15} className="shrink-0 text-lime" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}

/** Posta in arrivo: allenamenti condivisi da altri utenti, pronti da importare. */
export function IncomingWorkoutsSheet({
  open,
  onClose,
  userId,
  onImported,
  onCountChange,
}: {
  open: boolean
  onClose: () => void
  userId: string
  onImported: (workoutId: string) => void
  onCountChange?: (count: number) => void
}) {
  const [shares, setShares] = useState<IncomingWorkout[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let alive = true
    setError(null)
    setLoading(true)
    void listIncomingWorkouts()
      .then((list) => {
        if (!alive) return
        setShares(list)
        onCountChange?.(list.length)
      })
      .catch((e: unknown) => {
        if (alive) setError(errorMessage(e))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function removeLocal(id: string) {
    setShares((prev) => {
      const next = prev.filter((share) => share.id !== id)
      onCountChange?.(next.length)
      return next
    })
  }

  async function importOne(share: IncomingWorkout) {
    setBusyId(share.id)
    setError(null)
    try {
      const id = await importIncomingWorkout(userId, share)
      toast('Allenamento importato: modificalo e salva')
      removeLocal(share.id)
      onClose()
      onImported(id)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  async function removeOne(share: IncomingWorkout) {
    setBusyId(share.id)
    setError(null)
    try {
      await deleteIncomingWorkout(share.id)
      removeLocal(share.id)
      toast('Allenamento rimosso dalla posta')
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Allenamenti condivisi con te">
      <div className="pb-6">
        <p className="text-[12px] leading-relaxed text-muted">
          Allenamenti che altri utenti hanno condiviso con te. Importandone uno crei una copia di
          oggi, con gli esercizi abbinati per nome: poi la modifichi e la salvi come vuoi.
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-faint">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line2 border-t-lime" />
            Controllo la posta…
          </div>
        ) : shares.length === 0 ? (
          <EmptyState
            icon="download"
            title="Nessun allenamento ricevuto"
            text="Quando qualcuno condivide un allenamento con te, lo trovi qui."
          />
        ) : (
          <div className="mt-3 space-y-2">
            {shares.map((share) => {
              const sets = share.workout.entries.reduce((sum, entry) => sum + entry.sets.length, 0)
              return (
                <Card key={share.id} className="p-3">
                  <div className="flex items-start gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime/15 border border-lime/25 text-[12px] font-bold text-lime">
                      {initials(share.fromName)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold">
                        {share.workout.name.trim() || 'Allenamento'}
                      </p>
                      <p className="text-[10.5px] text-faint">
                        da {share.fromName} · {formatDate(share.createdAt.slice(0, 10))} ·{' '}
                        {plural(share.workout.entries.length, 'esercizio', 'esercizi')} ·{' '}
                        {plural(sets, 'serie', 'serie')}
                      </p>
                    </div>
                    <Badge color="#5FD4FF">nuovo</Badge>
                  </div>
                  <p className="mt-1.5 truncate text-[10.5px] text-muted">
                    {share.workout.entries.map((entry) => entry.name).join(' · ')}
                  </p>
                  <div className="mt-2.5 flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => void importOne(share)}
                      disabled={busyId !== null}
                    >
                      <Icon name="download" size={14} />
                      {busyId === share.id ? 'Importo…' : 'Importa'}
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      ariaLabel={`Rimuovi l’allenamento di ${share.fromName}`}
                      onClick={() => void removeOne(share)}
                      disabled={busyId !== null}
                    >
                      <Icon name="trash" size={14} />
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-[12px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  )
}
