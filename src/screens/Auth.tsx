import { useEffect, useRef, useState } from 'react'
import { Button, Icon, Sheet, cx, inputClass } from '../components/ui'
import { checkPin, createUser, listUsers } from '../db/queries'
import { importDatabaseBytes } from '../db/db'
import type { User } from '../lib/types'
import { formatDateLong, todayISO } from '../lib/dates'
import { initials } from '../lib/format'
import { setLastProfileId, setSessionUserId } from '../lib/session'
import { toast } from '../lib/live'
import { isValidSyncCode, linkDevice, normalizeSyncCode } from '../lib/sync'

function Keypad({
  value,
  onChange,
  maxLength,
  onComplete,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  maxLength: number
  onComplete: (v: string) => void
  disabled?: boolean
}) {
  const press = (d: string) => {
    if (disabled) return
    const next = (value + d).slice(0, Math.max(maxLength, 6))
    onChange(next)
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {keys.map((k) => (
        <button
          key={k}
          type="button"
          disabled={disabled}
          onClick={() => press(k)}
          className="press h-[58px] rounded-2xl bg-surface2 border border-line2 text-[22px] font-medium tabular active:bg-surface3 disabled:opacity-40"
        >
          {k}
        </button>
      ))}
      <div className="h-[58px]" />
      <button
        type="button"
        disabled={disabled}
        onClick={() => press('0')}
        className="press h-[58px] rounded-2xl bg-surface2 border border-line2 text-[22px] font-medium tabular active:bg-surface3 disabled:opacity-40"
      >
        0
      </button>
      <button
        type="button"
        disabled={disabled || value.length === 0}
        onClick={() => onChange(value.slice(0, -1))}
        className="press h-[58px] rounded-2xl bg-surface border border-line text-muted flex items-center justify-center active:bg-surface2 disabled:opacity-30"
        aria-label="Cancella cifra"
      >
        <Icon name="back" size={20} />
      </button>
      <button
        type="button"
        disabled={disabled || value.length !== maxLength}
        onClick={() => onComplete(value)}
        aria-label="Conferma PIN"
        className="col-span-3 press h-12 rounded-2xl bg-lime text-ink text-sm font-semibold flex items-center justify-center gap-2 disabled:bg-lime/20 disabled:text-ink/40"
      >
        <Icon name="check" size={16} strokeWidth={2.6} /> Entra
      </button>
    </div>
  )
}

function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-lime/15 border border-lime/30 text-lime font-bold"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  )
}

export function AuthScreen({ onLogin }: { onLogin: (userId: string) => void }) {
  const users = listUsers()
  const [mode, setMode] = useState<'pick' | 'pin' | 'signup'>(users.length === 0 ? 'signup' : 'pick')
  const [selected, setSelected] = useState<User | null>(null)
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(false)

  // registrazione
  const [name, setName] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // collegamento di un altro dispositivo tramite codice sync
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkCode, setLinkCode] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)

  const selectedRef = useRef<User | null>(null)
  selectedRef.current = selected
  const pinRef = useRef('')
  pinRef.current = pin

  async function attempt(value: string) {
    const user = selectedRef.current
    if (!user || busy) return
    setBusy(true)
    setError(null)
    try {
      const ok = await checkPin(user, value)
      if (ok) {
        setLastProfileId(user.id)
        setSessionUserId(user.id)
        onLogin(user.id)
      } else {
        setError('PIN non corretto')
        setShake(true)
        setTimeout(() => setShake(false), 420)
        setPin('')
      }
    } catch {
      setError('Impossibile verificare il PIN')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!selected) return
    if (pin.length === selected.pinLength && !busy) {
      void attempt(pin)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, selected])

  async function handleSignup() {
    setError(null)
    if (newPin !== confirmPin) {
      setError('I due PIN non coincidono')
      return
    }
    if (!/^\d{4,6}$/.test(newPin)) {
      setError('Il PIN deve avere da 4 a 6 cifre')
      return
    }
    setBusy(true)
    try {
      const user = await createUser(name, newPin)
      setLastProfileId(user.id)
      setSessionUserId(user.id)
      toast(`Benvenuto, ${user.name.split(' ')[0]}`)
      onLogin(user.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Errore nella creazione del profilo')
    } finally {
      setBusy(false)
    }
  }

  async function handleImport(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await importDatabaseBytes(bytes)
      toast('Backup ripristinato')
      window.location.reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup non valido')
    }
  }

  const brand = (
    <div className="flex flex-col items-center text-center">
      <img src="/icons/icon-192.png" alt="" className="h-16 w-16 rounded-[18px] shadow-lg shadow-lime/10" />
      <h1 className="mt-4 text-[22px] font-bold tracking-tight">PalestraLogger</h1>
      <p className="mt-1 text-[13px] text-muted max-w-[280px] leading-relaxed">
        Il diario allenamenti che resta sul tuo telefono. Veloce da compilare, funziona offline.
      </p>
    </div>
  )

  return (
    <div className="min-h-dvh hero-glow flex flex-col">
      <div className="mx-auto w-full max-w-md px-5 pt-[max(28px,env(safe-area-inset-top))] pb-8 flex-1 flex flex-col">
        {mode === 'signup' ? (
          <div className="flex-1 flex flex-col">
            <div className="pt-4">{brand}</div>

            {users.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMode('pick')
                  setError(null)
                }}
                className="self-start mt-5 text-[13px] text-muted flex items-center gap-1"
              >
                <Icon name="back" size={14} /> Torna ai profili
              </button>
            )}

            <div className="mt-7 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
                  Nome profilo
                </span>
                <input
                  className={inputClass}
                  placeholder="Es. Marco"
                  value={name}
                  maxLength={24}
                  autoComplete="given-name"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
                    PIN
                  </span>
                  <input
                    className={cx(inputClass, 'tracking-[0.35em] text-center font-semibold')}
                    placeholder="••••"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
                    Ripeti PIN
                  </span>
                  <input
                    className={cx(inputClass, 'tracking-[0.35em] text-center font-semibold')}
                    placeholder="••••"
                    type="password"
                    inputMode="numeric"
                    autoComplete="new-password"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  />
                </label>
              </div>

              <p className="text-[11.5px] text-faint leading-relaxed flex gap-1.5">
                <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
                Il PIN serve solo a proteggere i profili su questo dispositivo. I dati non vengono
                inviati a nessun server.
              </p>

              {error && (
                <p className="text-[12.5px] text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              <Button
                size="lg"
                full
                disabled={busy || name.trim().length < 2 || newPin.length < 4}
                onClick={() => void handleSignup()}
              >
                {busy ? 'Creazione…' : 'Crea profilo'}
              </Button>

              <div className="flex flex-col items-center gap-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setLinkCode('')
                    setLinkError(null)
                    setLinkOpen(true)
                  }}
                  className="w-full text-[12.5px] text-muted flex items-center justify-center gap-1.5 py-1"
                >
                  <Icon name="cloud" size={14} /> Hai già un codice sync?
                </button>
                {users.length === 0 && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="w-full text-[12.5px] text-muted flex items-center justify-center gap-1.5 py-1"
                  >
                    <Icon name="upload" size={14} /> Ripristina un backup .sqlite
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <div className="pt-4">{brand}</div>

            {mode === 'pick' ? (
              <>
                <p className="mt-8 mb-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Chi si allena?
                </p>
                <div className="space-y-2.5">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setSelected(u)
                        setPin('')
                        setError(null)
                        setMode('pin')
                      }}
                      className="press w-full flex items-center gap-3 rounded-2xl bg-surface border border-line px-3.5 py-3 text-left hover:border-line2"
                    >
                      <Avatar name={u.name} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold truncate">{u.name}</span>
                        <span className="block text-[11.5px] text-muted">
                          Dal {formatDateLong(u.createdAt.slice(0, 10))}
                        </span>
                      </span>
                      <Icon name="right" size={16} className="text-faint" />
                    </button>
                  ))}
                </div>

                <Button
                  variant="secondary"
                  className="mt-4"
                  full
                  onClick={() => {
                    setMode('signup')
                    setError(null)
                  }}
                >
                  <Icon name="plus" size={16} /> Nuovo profilo
                </Button>

                <div className="mt-4 flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLinkCode('')
                      setLinkError(null)
                      setLinkOpen(true)
                    }}
                    className="text-[12.5px] text-muted flex items-center justify-center gap-1.5"
                  >
                    <Icon name="cloud" size={14} /> Collega un dispositivo con codice sync
                  </button>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="text-[12px] text-faint flex items-center justify-center gap-1.5"
                  >
                    <Icon name="upload" size={13} /> Ripristina backup .sqlite
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-8 flex-1 flex flex-col">
                <div className="flex flex-col items-center">
                  <Avatar name={selected?.name ?? ''} size={56} />
                  <p className="mt-2.5 text-[17px] font-semibold">{selected?.name}</p>
                  <p className="text-[12px] text-muted">Inserisci il PIN per entrare</p>

                  <div
                    className={cx(
                      'mt-5 flex items-center gap-2.5 transition-transform',
                    )}
                    style={shake ? { animation: 'shake 0.4s ease' } : undefined}
                  >
                    {Array.from({ length: Math.max(selected?.pinLength ?? 4, pin.length) }).map(
                      (_, i) => (
                        <span
                          key={i}
                          className={cx(
                            'h-3 w-3 rounded-full border transition-all',
                            i < pin.length
                              ? 'bg-lime border-lime scale-110'
                              : 'bg-transparent border-line2',
                          )}
                        />
                      ),
                    )}
                  </div>
                  <div className="h-5 mt-2">
                    {error && <p className="text-[12px] text-danger">{error}</p>}
                  </div>
                </div>

                <div className="mt-3">
                  <Keypad
                    value={pin}
                    onChange={(v) => {
                      setPin(v)
                      setError(null)
                    }}
                    maxLength={selected?.pinLength ?? 4}
                    onComplete={(v) => void attempt(v)}
                    disabled={busy}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMode('pick')
                    setSelected(null)
                    setPin('')
                    setError(null)
                  }}
                  className="mt-4 text-[12.5px] text-muted flex items-center justify-center gap-1.5"
                >
                  <Icon name="left" size={13} /> Cambia profilo
                </button>
              </div>
            )}
          </div>
        )}

        <div className="mt-auto pt-6 flex flex-col items-center gap-1 text-center">
          <p className="text-[11px] text-faint">
            {formatDateLong(todayISO())} · SQLite locale · 100% offline
          </p>
        </div>
      </div>

      <Sheet
        open={linkOpen}
        onClose={() => {
          setLinkOpen(false)
          setLinkError(null)
        }}
        title="Collega un dispositivo"
      >
        <div className="pb-5">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Inserisci il codice di sincronizzazione creato sull'altro telefono (Profilo → Sync
            cloud). Scaricheremo profilo, esercizi e allenamenti.
          </p>

          <input
            className={cx(inputClass, 'mt-3 text-center font-mono text-[15px] tracking-[0.12em] uppercase')}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={linkCode}
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setLinkCode(normalizeSyncCode(e.target.value))}
          />

          {linkError && <p className="mt-2 text-[12px] text-danger">{linkError}</p>}

          <Button
            size="lg"
            full
            className="mt-3"
            disabled={linkBusy || !isValidSyncCode(linkCode)}
            onClick={async () => {
              setLinkBusy(true)
              setLinkError(null)
              try {
                const userId = await linkDevice(linkCode)
                setSessionUserId(userId)
                setLastProfileId(userId)
                onLogin(userId)
              } catch (e) {
                setLinkError(e instanceof Error ? e.message : 'Collegamento non riuscito')
              } finally {
                setLinkBusy(false)
              }
            }}
          >
            {linkBusy ? 'Collegamento…' : 'Collega e scarica i dati'}
          </Button>

          <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-faint">
            <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
            Il codice è la chiave dei tuoi dati: trattalo come una password.
          </p>
        </div>
      </Sheet>

      <input
        ref={fileRef}
        type="file"
        accept=".sqlite,.db,application/x-sqlite3,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleImport(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

export { Avatar }
