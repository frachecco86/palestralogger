import { useEffect, useState } from 'react'
import {
  AccountError,
  changePassword,
  getCachedAccount,
  rotateRecoveryCode,
} from '../lib/account'
import { formatSyncTime, getLastSync, isSyncing, syncNow, type SyncMeta } from '../lib/sync'
import { toast } from '../lib/live'
import { Badge, Button, Card, Divider, Icon, Sheet, cx, inputClass } from './ui'

function errText(err: unknown): string {
  if (err instanceof AccountError) return err.message
  if (err instanceof Error) return err.message
  return 'Operazione non riuscita'
}

export function AccountCard({ userId }: { userId: string }) {
  const account = getCachedAccount()
  const [meta, setMeta] = useState<SyncMeta | null>(() => getLastSync(userId))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pwOpen, setPwOpen] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwError, setPwError] = useState<string | null>(null)
  const [newCode, setNewCode] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const onChange = () => setMeta(getLastSync(userId))
    window.addEventListener('palestralogger:sync', onChange)
    return () => window.removeEventListener('palestralogger:sync', onChange)
  }, [userId])

  async function handleSync() {
    setBusy(true)
    setError(null)
    try {
      await syncNow(userId)
      setMeta(getLastSync(userId))
      toast('Dati sincronizzati')
    } catch (err) {
      setMeta(getLastSync(userId))
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  async function savePassword() {
    setPwError(null)
    if (next.length < 8) {
      setPwError('La nuova password deve avere almeno 8 caratteri')
      return
    }
    if (next !== confirm) {
      setPwError('Le due password non coincidono')
      return
    }
    setBusy(true)
    try {
      await changePassword(current, next)
      setPwOpen(false)
      setCurrent('')
      setNext('')
      setConfirm('')
      toast('Password aggiornata')
    } catch (err) {
      setPwError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  async function createRecoveryCode() {
    setPwError(null)
    setBusy(true)
    try {
      const code = await rotateRecoveryCode(current)
      setNewCode(code)
      setCurrent('')
      toast('Nuovo codice di recupero creato')
    } catch (err) {
      setPwError(errText(err))
    } finally {
      setBusy(false)
    }
  }

  async function copyCode() {
    if (!newCode) return
    try {
      await navigator.clipboard.writeText(newCode)
      setCopied(true)
      toast('Codice copiato')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast('Copia manuale: ' + newCode, 'err')
    }
  }

  const status = !meta
    ? 'In attesa della prima sincronizzazione'
    : meta.ok
      ? `Sincronizzato ${formatSyncTime(meta.at)}`
      : `Ultimo tentativo ${formatSyncTime(meta.at)} non riuscito`

  return (
    <>
      <Card className="mt-3 overflow-hidden">
        <div className="p-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-lime/30 bg-lime/10 text-lime">
              <Icon name="cloud" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[13px] font-semibold">Account cloud</p>
                <Badge color="#C8FF3D">attivo</Badge>
              </div>
              <p className="truncate text-[11px] text-muted">{account?.email ?? '—'}</p>
              <p className={cx('text-[10.5px] leading-tight', meta && !meta.ok ? 'text-danger' : 'text-faint')}>
                {status}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSync()}
              disabled={busy || isSyncing()}
              aria-label="Sincronizza ora"
              className="press flex h-8 w-8 items-center justify-center rounded-lg bg-surface2 border border-line text-lime disabled:opacity-40"
            >
              <Icon name="refresh" size={15} className={busy ? 'animate-spin' : undefined} />
            </button>
          </div>

          {error && (
            <p className="mt-2 rounded-lg border border-danger/25 bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">
              {error}
            </p>
          )}

          <div className="mt-2.5 flex items-center gap-1.5">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPwError(null)
                setCurrent('')
                setNext('')
                setConfirm('')
                setPwOpen(true)
              }}
            >
              <Icon name="lock" size={13} /> Password
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPwError(null)
                setCurrent('')
                setNewCode(null)
                setRecoveryOpen(true)
              }}
            >
              <Icon name="spark" size={13} /> Recupero
            </Button>
          </div>
        </div>
      </Card>

      <Sheet open={pwOpen} onClose={() => setPwOpen(false)} title="Cambia password">
        <div className="space-y-3 pb-5">
          <p className="text-[12px] leading-relaxed text-muted">
            Dopo il cambio, gli altri dispositivi dovranno accedere di nuovo con la password nuova.
          </p>
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            placeholder="Password attuale"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            placeholder="Nuova password (min. 8 caratteri)"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            placeholder="Ripeti la nuova password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {pwError && <p className="text-[12px] text-danger">{pwError}</p>}
          <Button full size="lg" disabled={busy} onClick={() => void savePassword()}>
            {busy ? 'Aggiornamento…' : 'Aggiorna password'}
          </Button>
        </div>
      </Sheet>

      <Sheet open={recoveryOpen} onClose={() => setRecoveryOpen(false)} title="Codice di recupero">
        <div className="space-y-3 pb-5">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Il codice di recupero serve a reimpostare la password se la dimentichi. Generandone uno
            nuovo, il precedente smette di funzionare.
          </p>

          {newCode ? (
            <>
              <button
                type="button"
                onClick={() => void copyCode()}
                className="press w-full rounded-2xl border border-lime/30 bg-lime/[0.07] px-3 py-4"
              >
                <span className="block font-mono text-[18px] font-bold tracking-[0.14em] text-lime">
                  {newCode}
                </span>
                <span className="mt-1 flex items-center justify-center gap-1 text-[10.5px] text-muted">
                  <Icon name={copied ? 'check' : 'copy'} size={12} /> Tocca per copiare
                </span>
              </button>
              <p className="text-[11px] leading-relaxed text-faint">
                Salvalo adesso: non potrà essere mostrato di nuovo.
              </p>
            </>
          ) : (
            <>
              <input
                className={inputClass}
                type="password"
                autoComplete="current-password"
                placeholder="Password dell’account"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
              {pwError && <p className="text-[12px] text-danger">{pwError}</p>}
              <Button full size="lg" disabled={busy} onClick={() => void createRecoveryCode()}>
                {busy ? 'Generazione…' : 'Genera nuovo codice'}
              </Button>
            </>
          )}

          <Divider className="my-1" />
          <p className="flex gap-1.5 text-[11px] leading-relaxed text-faint">
            <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
            Senza password e senza codice non è possibile recuperare l’account: è la garanzia che
            nessun altro possa leggere i tuoi dati.
          </p>
        </div>
      </Sheet>
    </>
  )
}
