import { useEffect, useState } from 'react'
import type { User } from '../lib/types'
import {
  activateSync,
  disableSync,
  formatSyncTime,
  getLastSync,
  getSyncCode,
  syncNow,
  type SyncMeta,
} from '../lib/sync'
import { toast } from '../lib/live'
import { Badge, Button, Card, Divider, Icon, Sheet, cx } from './ui'

export function SyncCard({ user }: { user: User }) {
  const [code, setCode] = useState<string | null>(() => getSyncCode(user.id))
  const [meta, setMeta] = useState<SyncMeta | null>(() => getLastSync(user.id))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)
  const [disableOpen, setDisableOpen] = useState(false)

  useEffect(() => {
    setCode(getSyncCode(user.id))
    setMeta(getLastSync(user.id))
  }, [user.id])

  useEffect(() => {
    const onChange = () => setMeta(getLastSync(user.id))
    window.addEventListener('palestralogger:sync', onChange)
    return () => window.removeEventListener('palestralogger:sync', onChange)
  }, [user.id])

  async function handleActivate() {
    setBusy(true)
    setError(null)
    try {
      const c = await activateSync(user.id)
      setCode(c)
      setMeta(getLastSync(user.id))
      setCodeOpen(true)
      toast('Sincronizzazione attivata')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Attivazione non riuscita')
    } finally {
      setBusy(false)
    }
  }

  async function handleSync() {
    setBusy(true)
    setError(null)
    try {
      const res = await syncNow(user.id)
      setMeta(getLastSync(user.id))
      toast(res ? 'Dati sincronizzati' : 'Sincronizzazione in corso')
    } catch (e) {
      setMeta(getLastSync(user.id))
      setError(e instanceof Error ? e.message : 'Sincronizzazione non riuscita')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable(deleteRemote: boolean) {
    setBusy(true)
    try {
      await disableSync(user.id, { deleteRemote })
      setCode(null)
      setMeta(null)
      setDisableOpen(false)
      setCodeOpen(false)
      toast(deleteRemote ? 'Sync e copia cloud eliminate' : 'Sync rimossa da questo dispositivo')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Operazione non riuscita', 'err')
    } finally {
      setBusy(false)
    }
  }

  async function copyCode() {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      toast('Codice copiato')
    } catch {
      toast('Copia manuale: ' + code, 'err')
    }
  }

  const status = !code
    ? 'Allenamenti e profilo su tutti i tuoi dispositivi.'
    : meta?.ok
      ? `Sincronizzato ${formatSyncTime(meta.at)}`
      : meta
        ? `Ultimo tentativo ${formatSyncTime(meta.at)} non riuscito`
        : 'In attesa della prima sincronizzazione'

  return (
    <>
      <Card className="mt-3 overflow-hidden">
        <div className="p-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className={cx(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border',
                code ? 'border-lime/30 bg-lime/10 text-lime' : 'border-line bg-surface2 text-muted',
              )}
            >
              <Icon name="cloud" size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[13px] font-semibold">Sync cloud</p>
                <Badge color={code ? '#C8FF3D' : undefined}>{code ? 'attiva' : 'non attiva'}</Badge>
              </div>
              <p className="text-[10.5px] leading-tight text-faint">{status}</p>
            </div>
            {code && (
              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={busy}
                aria-label="Sincronizza ora"
                className="press flex h-8 w-8 items-center justify-center rounded-lg bg-surface2 border border-line text-lime disabled:opacity-40"
              >
                <Icon name="refresh" size={15} className={busy ? 'animate-spin' : undefined} />
              </button>
            )}
          </div>

          {error && (
            <p className="mt-2 rounded-lg border border-danger/25 bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger">
              {error}
            </p>
          )}

          {!code ? (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2.5"
              full
              disabled={busy}
              onClick={() => void handleActivate()}
            >
              {busy ? 'Attivazione…' : 'Attiva sincronizzazione'}
            </Button>
          ) : (
            <div className="mt-2.5 flex items-center gap-1.5">
              <Button size="sm" variant="secondary" onClick={() => setCodeOpen(true)}>
                <Icon name="copy" size={13} /> Codice
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-[11.5px]"
                onClick={() => setDisableOpen(true)}
              >
                Disattiva
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Sheet open={codeOpen} onClose={() => setCodeOpen(false)} title="Codice di sincronizzazione">
        <div className="pb-5">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Su un altro dispositivo scegli <strong className="text-text">«Collega un dispositivo»</strong>{' '}
            e inserisci questo codice. Profilo, esercizi e allenamenti verranno scaricati e tenuti
            allineati.
          </p>

          <button
            type="button"
            onClick={() => void copyCode()}
            className="press mt-3 w-full rounded-2xl border border-lime/30 bg-lime/[0.07] px-3 py-4"
          >
            <span className="block font-mono text-[18px] font-bold tracking-[0.14em] text-lime">
              {code}
            </span>
            <span className="mt-1 flex items-center justify-center gap-1 text-[10.5px] text-muted">
              <Icon name="copy" size={12} /> Tocca per copiare
            </span>
          </button>

          <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-faint">
            <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
            Chi conosce questo codice può leggere e modificare i tuoi dati. Conservalo come una
            password e non condividerlo.
          </p>

          <Divider className="my-4" />

          <div className="flex items-center gap-2 text-[11.5px] text-muted">
            <Icon name="check" size={14} className="text-lime" />
            Backup cloud cifrato in transito (HTTPS), senza account né email.
          </div>

          <Button variant="secondary" full className="mt-4" onClick={() => setCodeOpen(false)}>
            Chiudi
          </Button>
        </div>
      </Sheet>

      <Sheet open={disableOpen} onClose={() => setDisableOpen(false)} title="Disattivare la sync?">
        <div className="pb-5">
          <p className="text-[13px] leading-relaxed text-muted">
            Puoi rimuovere la sync solo da questo dispositivo (i dati restano sul cloud) oppure
            eliminare anche la copia cloud.
          </p>
          <div className="mt-4 space-y-2">
            <Button variant="secondary" full onClick={() => void handleDisable(false)} disabled={busy}>
              Rimuovi solo da questo dispositivo
            </Button>
            <Button variant="danger" full onClick={() => void handleDisable(true)} disabled={busy}>
              Elimina anche dal cloud
            </Button>
            <Button variant="ghost" full onClick={() => setDisableOpen(false)}>
              Annulla
            </Button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
