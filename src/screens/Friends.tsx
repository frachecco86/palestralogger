import { useEffect, useState } from 'react'
import type { User } from '../lib/types'
import { getSyncCode } from '../lib/sync'
import {
  activateSocial,
  deleteSocial,
  getCachedSocial,
  isShareNotesEnabled,
  isValidFriendCode,
  normalizeFriendCode,
  publishSocial,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  setShareNotesEnabled,
  socialMe,
  type FriendRequest,
  type SocialState,
} from '../lib/social'
import { formatDate, formatDateLong } from '../lib/dates'
import { formatKg, initials } from '../lib/format'
import { toast } from '../lib/live'
import {
  Button,
  Card,
  EmptyState,
  Icon,
  SectionTitle,
  Sheet,
  Toggle,
  cx,
  inputClass,
} from '../components/ui'
import { Footer } from '../components/Footer'

function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-lime/25 bg-lime/10 font-bold text-lime"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials(name)}
    </span>
  )
}

function lastWorkoutLabel(friend: { snapshot: { workouts: Array<{ date: string }> } | null }): string {
  const last = friend.snapshot?.workouts[0]
  if (!last) return 'Nessun allenamento condiviso'
  return `Ultimo: ${formatDate(last.date)}`
}

export function FriendsScreen({
  user,
  onBack,
  onOpenFriend,
  onGoProfile,
}: {
  user: User
  onBack: () => void
  onOpenFriend: (uid: string) => void
  onGoProfile: () => void
}) {
  const cached = getCachedSocial(user.id)
  const [state, setState] = useState<SocialState | null>(cached?.state ?? null)
  const [exists, setExists] = useState(!!cached)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notesShared, setNotesShared] = useState(() => isShareNotesEnabled(user.id))
  const [addOpen, setAddOpen] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [disableOpen, setDisableOpen] = useState(false)

  const hasSync = !!getSyncCode(user.id)

  async function load(showSpinner = true) {
    if (!hasSync) {
      setLoading(false)
      return
    }
    if (showSpinner) setLoading(true)
    setError(null)
    try {
      const res = await socialMe(user.id)
      if (res.exists) {
        setState(res)
        setExists(true)
      } else {
        setState(null)
        setExists(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore di connessione')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id])

  async function handleActivate() {
    setBusy('activate')
    setError(null)
    try {
      const next = await activateSocial(user.id)
      setState(next)
      setExists(true)
      const snapshot = await publishSocial(user.id)
      if (snapshot) {
        setState((prev) =>
          prev ? { ...prev, me: { ...prev.me, snapshot, updatedAt: new Date().toISOString() } } : prev,
        )
      }
      toast('Amici attivati')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Attivazione non riuscita')
    } finally {
      setBusy(null)
    }
  }

  async function handleAdd() {
    if (!isValidFriendCode(addCode)) {
      setAddError('Il codice ha 12 caratteri: XXXX-XXXX-XXXX')
      return
    }
    setBusy('add')
    setAddError(null)
    try {
      const res = await sendFriendRequest(user.id, addCode)
      if (res.status === 'already_friends') toast('Siete già amici')
      else toast(`Richiesta inviata a ${res.target.name}`)
      setAddOpen(false)
      setAddCode('')
      await load(false)
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Richiesta non inviata')
    } finally {
      setBusy(null)
    }
  }

  async function handleRespond(request: FriendRequest, accept: boolean) {
    setBusy(request.uid)
    try {
      const next = await respondFriendRequest(user.id, request.uid, accept)
      setState(next)
      toast(accept ? `${request.name} è ora tuo amico` : 'Richiesta rifiutata')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Operazione non riuscita', 'err')
    } finally {
      setBusy(null)
    }
  }

  async function handleCancelOutgoing(request: FriendRequest) {
    setBusy(request.uid)
    try {
      const next = await removeFriend(user.id, request.uid)
      setState(next)
      toast('Richiesta annullata')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Operazione non riuscita', 'err')
    } finally {
      setBusy(null)
    }
  }

  async function handleNotes(value: boolean) {
    setNotesShared(value)
    setShareNotesEnabled(user.id, value)
    try {
      const snapshot = await publishSocial(user.id)
      if (snapshot) {
        setState((prev) =>
          prev ? { ...prev, me: { ...prev.me, snapshot, updatedAt: new Date().toISOString() } } : prev,
        )
      }
      toast(value ? 'Note condivise con gli amici' : 'Note non più condivise')
    } catch {
      toast('Impostazione salvata, sync al prossimo aggiornamento', 'err')
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      toast('Codice amico copiato')
    } catch {
      toast('Copia manuale: ' + code, 'err')
    }
  }

  async function shareCode(code: string) {
    const text = `Aggiungimi su PalestraLogger! Il mio codice amico è ${code}`
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: 'PalestraLogger', text })
        return
      } catch {
        /* annullato */
      }
    }
    await copyCode(code)
  }

  async function handleDisable() {
    setBusy('disable')
    try {
      await deleteSocial(user.id)
      setState(null)
      setExists(false)
      setDisableOpen(false)
      toast('Amici disattivati')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Operazione non riuscita', 'err')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-ink/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-md items-center gap-1.5 px-2">
          <button
            type="button"
            onClick={onBack}
            className="press flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:text-text"
            aria-label="Indietro"
          >
            <Icon name="back" size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.12em] text-muted">Social</p>
            <p className="text-[14px] font-semibold leading-tight">Amici</p>
          </div>
          {hasSync && (
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="press flex h-9 w-9 items-center justify-center rounded-xl bg-surface2 border border-line text-lime disabled:opacity-40"
              aria-label="Aggiorna"
            >
              <Icon name="refresh" size={16} className={loading ? 'animate-spin' : undefined} />
            </button>
          )}
        </div>
      </header>

      <div className="mx-auto w-full max-w-md px-4 pt-4">
        {!hasSync && (
          <Card>
            <EmptyState
              icon="cloud"
              title="Serve la sync cloud"
              text="La sync è l'identità del tuo profilo: attivala dal Profilo per usare gli amici."
              action={
                <Button size="sm" onClick={onGoProfile}>
                  Vai al profilo
                </Button>
              }
            />
          </Card>
        )}

        {hasSync && loading && !state && (
          <div className="py-16 text-center text-[13px] text-muted">Caricamento amici…</div>
        )}

        {hasSync && error && !state && (
          <Card className="p-3.5">
            <p className="text-[13px] font-semibold">Connessione non riuscita</p>
            <p className="mt-1 text-[11.5px] text-muted">{error}</p>
            <Button size="sm" className="mt-3" onClick={() => void load()}>
              Riprova
            </Button>
          </Card>
        )}

        {hasSync && !loading && !exists && (
          <Card>
            <EmptyState
              icon="users"
              title="Allenati insieme, anche a distanza"
              text="Attiva gli amici per condividere allenamenti e statistiche. Riceverai un codice da dare a chi vuoi aggiungere; nessuno vede i tuoi dati senza il tuo consenso."
              action={
                <Button size="sm" onClick={() => void handleActivate()} disabled={busy === 'activate'}>
                  {busy === 'activate' ? 'Attivazione…' : 'Attiva amici'}
                </Button>
              }
            />
          </Card>
        )}

        {state && (
          <>
            {/* codice amico */}
            <Card className="border-lime/20 bg-lime/[0.05] p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-lime">
                    Il tuo codice amico
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyCode(state.me.friendCode)}
                    className="mt-1 block font-mono text-[17px] font-bold tracking-[0.12em] text-text"
                  >
                    {state.me.friendCode}
                  </button>
                  <p className="mt-1 text-[10.5px] text-muted">
                    Tocca per copiare · condividilo solo con chi vuoi aggiungere
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void shareCode(state.me.friendCode)}
                  className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-lime/30 bg-lime/10 text-lime"
                  aria-label="Condividi codice amico"
                >
                  <Icon name="share" size={16} />
                </button>
              </div>
              <p className="mt-2 flex gap-1.5 text-[10.5px] leading-relaxed text-faint">
                <Icon name="lock" size={12} className="mt-0.5 shrink-0" />
                Il codice amico non dà accesso ai dati: serve solo a inviarti una richiesta.
              </p>
            </Card>

            <Button
              variant="secondary"
              full
              className="mt-2.5"
              onClick={() => {
                setAddCode('')
                setAddError(null)
                setAddOpen(true)
              }}
            >
              <Icon name="plus" size={16} /> Aggiungi un amico
            </Button>

            {error && (
              <p className="mt-2 text-[11.5px] text-warn">
                {error} — mostro gli ultimi dati salvati.
              </p>
            )}

            {/* richieste */}
            {state.incoming.length > 0 && (
              <section className="mt-5">
                <SectionTitle>Richieste · {state.incoming.length}</SectionTitle>
                <div className="space-y-2">
                  {state.incoming.map((r) => (
                    <Card key={r.uid} className="p-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-semibold">{r.name}</p>
                          <p className="text-[10.5px] text-muted">vuole diventare tuo amico</p>
                        </div>
                      </div>
                      <div className="mt-2.5 flex gap-2">
                        <Button
                          size="sm"
                          full
                          disabled={busy === r.uid}
                          onClick={() => void handleRespond(r, true)}
                        >
                          Accetta
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          full
                          disabled={busy === r.uid}
                          onClick={() => void handleRespond(r, false)}
                        >
                          Rifiuta
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* in uscita */}
            {state.outgoing.length > 0 && (
              <section className="mt-5">
                <SectionTitle>In attesa</SectionTitle>
                <div className="space-y-2">
                  {state.outgoing.map((r) => (
                    <Card key={r.uid} className="flex items-center gap-2.5 px-3 py-2.5">
                      <Avatar name={r.name} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium">{r.name}</p>
                        <p className="text-[10.5px] text-faint">Richiesta inviata</p>
                      </div>
                      <button
                        type="button"
                        disabled={busy === r.uid}
                        onClick={() => void handleCancelOutgoing(r)}
                        className="press rounded-lg px-2 py-1 text-[10.5px] text-muted hover:text-danger disabled:opacity-40"
                      >
                        Annulla
                      </button>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {/* amici */}
            <section className="mt-5">
              <SectionTitle
                action={<span className="text-[10.5px] text-faint">{state.friends.length}</span>}
              >
                I tuoi amici
              </SectionTitle>

              {state.friends.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="users"
                    title="Nessun amico ancora"
                    text="Scambia il codice amico con chi si allena con te: potrete vedere allenamenti e progressi."
                    action={
                      <Button size="sm" onClick={() => setAddOpen(true)}>
                        <Icon name="plus" size={15} /> Aggiungi
                      </Button>
                    }
                  />
                </Card>
              ) : (
                <div className="space-y-2">
                  {state.friends.map((f) => (
                    <button
                      key={f.uid}
                      type="button"
                      onClick={() => onOpenFriend(f.uid)}
                      className="press flex w-full items-center gap-2.5 rounded-2xl border border-line bg-surface px-3 py-2.5 text-left hover:border-line2"
                    >
                      <Avatar name={f.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold">{f.name}</span>
                        <span className="block text-[10.5px] text-muted">
                          {lastWorkoutLabel(f)}
                          {f.snapshot
                            ? ` · ${f.snapshot.stats.weekWorkouts} sett. · ${formatKg(f.snapshot.stats.weekVolume)}`
                            : ''}
                        </span>
                      </span>
                      <Icon name="right" size={15} className="shrink-0 text-faint" />
                    </button>
                  ))}
                </div>
              )}
            </section>

            {/* impostazioni */}
            <Card className="mt-4 flex items-center gap-3 p-3.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line bg-surface2 text-muted">
                <Icon name="edit" size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium">Condividi le note</p>
                <p className="text-[10.5px] leading-tight text-faint">
                  Gli amici vedono le note delle tue sessioni
                </p>
              </div>
              <Toggle checked={notesShared} onChange={(v) => void handleNotes(v)} label="Condividi note" />
            </Card>

            {state.me.updatedAt && (
              <p className="mt-3 text-center text-[10.5px] text-faint">
                Ultimo aggiornamento condiviso: {formatDateLong(state.me.updatedAt.slice(0, 10))}
              </p>
            )}

            <button
              type="button"
              onClick={() => setDisableOpen(true)}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[11.5px] font-medium text-danger/80 hover:text-danger"
            >
              <Icon name="trash" size={13} /> Disattiva amici
            </button>
          </>
        )}

        <Footer />
      </div>

      {/* aggiungi amico */}
      <Sheet
        open={addOpen}
        onClose={() => {
          setAddOpen(false)
          setAddError(null)
        }}
        title="Aggiungi un amico"
      >
        <div className="pb-5">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Inserisci il codice amico di chi vuoi aggiungere (formato{' '}
            <span className="font-mono">XXXX-XXXX-XXXX</span>). Gli arriverà una richiesta da
            accettare.
          </p>
          <input
            className={cx(
              inputClass,
              'mt-3 text-center font-mono text-[15px] uppercase tracking-[0.12em]',
            )}
            placeholder="XXXX-XXXX-XXXX"
            value={addCode}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setAddCode(normalizeFriendCode(e.target.value))}
          />
          {addError && <p className="mt-2 text-[12px] text-danger">{addError}</p>}
          <Button
            size="lg"
            full
            className="mt-3"
            disabled={busy === 'add' || !isValidFriendCode(addCode)}
            onClick={() => void handleAdd()}
          >
            {busy === 'add' ? 'Invio…' : 'Invia richiesta'}
          </Button>
        </div>
      </Sheet>

      {/* disattiva */}
      <Sheet open={disableOpen} onClose={() => setDisableOpen(false)} title="Disattivare gli amici?">
        <div className="pb-5">
          <p className="text-[13px] leading-relaxed text-muted">
            Verrai rimosso dalle liste dei tuoi amici e non condividerai più allenamenti e
            statistiche. I tuoi dati restano solo sul dispositivo e nella tua sync personale.
          </p>
          <div className="mt-4 space-y-2">
            <Button
              variant="danger"
              full
              disabled={busy === 'disable'}
              onClick={() => void handleDisable()}
            >
              {busy === 'disable' ? 'Disattivazione…' : 'Disattiva amici'}
            </Button>
            <Button variant="ghost" full onClick={() => setDisableOpen(false)}>
              Annulla
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
