import { useRef, useState } from 'react'
import type { User } from '../lib/types'
import { adoptLocalData, deleteUser, ensureLocalUser, getStats, renameUser } from '../db/queries'
import { exportDatabaseBytes, importDatabaseBytes } from '../db/db'
import { applySyncPayload, type SyncPayload } from '../db/sync-queries'
import { todayISO } from '../lib/dates'
import { formatKg, initials } from '../lib/format'
import { toast, useLiveData } from '../lib/live'
import {
  AccountError,
  claimLegacyCode,
  deleteAccount,
  getCachedAccount,
  isValidLegacyCode,
  logout,
  normalizeLegacyCode,
} from '../lib/account'
import { syncNow } from '../lib/sync'
import { setLocalOwner } from '../lib/session'
import { AccountCard } from '../components/AccountCard'
import { APP_VERSION } from '../lib/version'
import {
  Button,
  Card,
  Divider,
  Field,
  Icon,
  Sheet,
  cx,
  inputClass,
  type IconName,
} from '../components/ui'

function Row({
  icon,
  label,
  sub,
  onClick,
  danger = false,
  trailing,
}: {
  icon: IconName
  label: string
  sub?: string
  onClick?: () => void
  danger?: boolean
  trailing?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-surface2/60"
    >
      <span
        className={cx(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border',
          danger
            ? 'border-danger/25 bg-danger/10 text-danger'
            : 'border-line bg-surface2 text-muted',
        )}
      >
        <Icon name={icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block text-[13px] font-medium', danger ? 'text-danger' : 'text-text')}>
          {label}
        </span>
        {sub && <span className="block text-[10.5px] text-faint">{sub}</span>}
      </span>
      {trailing && <span className="text-[11px] text-faint">{trailing}</span>}
      {onClick && <Icon name="right" size={14} className="shrink-0 text-faint" />}
    </button>
  )
}

export function ProfileScreen({
  user,
  onLogout,
  onUserChanged,
  onGoExercises,
  onGoFriends,
}: {
  user: User
  onLogout: () => void
  onUserChanged: () => void
  onGoExercises: () => void
  onGoFriends: () => void
}) {
  const stats = useLiveData(() => getStats(user.id, todayISO()), [user.id])
  const account = getCachedAccount()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [legacyOpen, setLegacyOpen] = useState(false)
  const [name, setName] = useState(user.name)
  const [password, setPassword] = useState('')
  const [legacyCode, setLegacyCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true)

  function handleBackup() {
    try {
      const bytes = exportDatabaseBytes()
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/x-sqlite3' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `palestralogger-${todayISO()}.sqlite`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 3000)
      toast('Backup scaricato')
    } catch {
      toast('Backup non riuscito', 'err')
    }
  }

  async function handleRestore(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await importDatabaseBytes(bytes)
      // il backup contiene un profilo 1.x: lo si intesta all'account cloud
      const adopted = adoptLocalData(user.id, user.name)
      if (!adopted) ensureLocalUser({ id: user.id, name: user.name, createdAt: user.createdAt })
      toast('Backup importato: sincronizzo…')
      void syncNow(user.id)
        .then(() => window.location.reload())
        .catch(() => window.location.reload())
    } catch (e) {
      toast(e instanceof Error ? e.message : 'File non valido', 'err')
    }
  }

  function saveName() {
    try {
      renameUser(user.id, name)
      setRenameOpen(false)
      onUserChanged()
      toast('Nome aggiornato')
      void syncNow(user.id).catch(() => {
        /* verrà ritentato */
      })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Errore')
    }
  }

  async function handleDelete() {
    setErr(null)
    setBusy(true)
    try {
      await deleteAccount(password)
      deleteUser(user.id)
      setLocalOwner(null)
      toast('Account eliminato')
      onLogout()
    } catch (e) {
      setErr(e instanceof AccountError ? e.message : 'Operazione non riuscita')
    } finally {
      setBusy(false)
    }
  }

  async function handleClaimLegacy() {
    setErr(null)
    setBusy(true)
    try {
      const res = await claimLegacyCode(legacyCode)
      if (!res.payload?.profile) throw new Error('Nessun dato trovato per questo codice')
      const payload = {
        ...res.payload,
        profile: { ...res.payload.profile, id: user.id },
      } as SyncPayload
      applySyncPayload(user.id, payload)
      if (payload.profile.name) {
        try {
          renameUser(user.id, payload.profile.name)
        } catch {
          /* nome già in uso */
        }
      }
      await syncNow(user.id)
      setLegacyOpen(false)
      setLegacyCode('')
      toast(`Recuperati ${payload.workouts.length} allenamenti`)
      onUserChanged()
    } catch (e) {
      setErr(e instanceof AccountError ? e.message : e instanceof Error ? e.message : 'Errore')
    } finally {
      setBusy(false)
    }
  }

  async function handleLogout() {
    await logout()
    onLogout()
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 pt-[max(16px,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[11.5px] uppercase tracking-[0.1em] text-muted">Profilo</p>
          <h1 className="mt-0.5 text-[24px] font-bold leading-tight tracking-tight">{user.name}</h1>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setErr(null)
            setName(user.name)
            setRenameOpen(true)
          }}
        >
          <Icon name="edit" size={14} /> Modifica
        </Button>
      </header>

      <Card className="mt-3 p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-lime/30 bg-lime/15 text-[18px] font-bold text-lime">
            {initials(user.name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold">Profilo con account cloud</p>
            <p className="truncate text-[11px] text-muted">{account?.email ?? 'Sessione locale'}</p>
            <p className="text-[10.5px] text-faint">Salvato online e in copia sul telefono</p>
          </div>
          <Icon name="cloud" size={18} className="text-lime" />
        </div>

        <div className="mt-3 grid grid-cols-3 divide-x divide-line rounded-xl border border-line bg-surface2/60">
          {[
            { l: 'Allenamenti', v: String(stats.totalWorkouts) },
            { l: 'Volume', v: formatKg(stats.totalVolume) },
            { l: 'Giorni attivi', v: String(stats.activeDays) },
          ].map((s) => (
            <div key={s.l} className="px-1 py-2 text-center">
              <p className="text-[13px] font-bold tabular leading-tight">{s.v}</p>
              <p className="text-[9px] uppercase tracking-wide text-faint mt-0.5">{s.l}</p>
            </div>
          ))}
        </div>
      </Card>

      <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Account e sicurezza
      </p>
      <Card className="divide-y divide-line overflow-hidden">
        <Row
          icon="user"
          label="Modifica nome"
          sub="Il nome visibile agli amici"
          onClick={() => {
            setErr(null)
            setName(user.name)
            setRenameOpen(true)
          }}
        />
        <Row
          icon="logout"
          label="Esci dall’account"
          sub="I dati restano nel cloud e su questo telefono"
          onClick={() => void handleLogout()}
        />
      </Card>

      <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Social
      </p>
      <Card className="overflow-hidden">
        <Row
          icon="users"
          label="Amici"
          sub="Condividi allenamenti e guarda i progressi"
          onClick={onGoFriends}
        />
      </Card>

      <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Cloud e sync
      </p>
      <AccountCard userId={user.id} />

      <div className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Backup e ripristino
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        <Row
          icon="download"
          label="Scarica backup"
          sub="Salva tutti i dati in un file .sqlite"
          onClick={handleBackup}
        />
        <Row
          icon="upload"
          label="Ripristina backup"
          sub="Importa un file .sqlite e caricalo nel cloud"
          onClick={() => fileRef.current?.click()}
        />
        <Row
          icon="cloud"
          label="Recupera da codice sync 1.x"
          sub="Se hai ancora il vecchio codice di 16 caratteri"
          onClick={() => {
            setErr(null)
            setLegacyCode('')
            setLegacyOpen(true)
          }}
        />
        <Row icon="dumbbell" label="Libreria esercizi" onClick={onGoExercises} />
      </Card>

      {!standalone && (
        <Card className="mt-4 border-lime/20 bg-lime/[0.06] p-3.5">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-lime text-ink">
              <Icon name="spark" size={16} />
            </span>
            <div>
              <p className="text-[12.5px] font-semibold">Installa sul telefono</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                Aggiungi PalestraLogger alla schermata Home per aprirla a tutto schermo e usarla
                offline: menu del browser → «Aggiungi alla schermata Home».
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Zona pericolosa
      </div>
      <Card className="overflow-hidden">
        <Row
          icon="trash"
          label="Elimina account"
          sub="Cancella account, cloud e dati da questo telefono"
          danger
          onClick={() => {
            setErr(null)
            setPassword('')
            setDeleteOpen(true)
          }}
        />
      </Card>

      <p className="mt-5 mb-2 text-center text-[10.5px] text-faint">
        PalestraLogger {APP_VERSION} · cloud + offline
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".sqlite,.db,application/x-sqlite3,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleRestore(f)
          e.target.value = ''
        }}
      />

      <Sheet open={renameOpen} onClose={() => setRenameOpen(false)} title="Modifica nome">
        <div className="pb-5">
          <Field label="Nome profilo">
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={24}
              autoFocus
            />
          </Field>
          {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
          <Button className="mt-4" full size="lg" onClick={saveName} disabled={name.trim().length < 2}>
            Salva
          </Button>
        </div>
      </Sheet>

      <Sheet open={legacyOpen} onClose={() => setLegacyOpen(false)} title="Recupera dal codice sync">
        <div className="space-y-3 pb-5">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Se nella versione 1.x avevi attivato la sync, inserisci il codice di 16 caratteri:
            profilo, esercizi e allenamenti verranno uniti a questo account.
          </p>
          <input
            className={cx(inputClass, 'text-center font-mono text-[15px] uppercase tracking-[0.12em]')}
            placeholder="XXXX-XXXX-XXXX-XXXX"
            value={legacyCode}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setLegacyCode(normalizeLegacyCode(e.target.value))}
          />
          {err && <p className="text-[12px] text-danger">{err}</p>}
          <Button
            full
            size="lg"
            disabled={busy || !isValidLegacyCode(legacyCode)}
            onClick={() => void handleClaimLegacy()}
          >
            {busy ? 'Recupero…' : 'Recupera i dati'}
          </Button>
        </div>
      </Sheet>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Elimina account">
        <div className="pb-5">
          <p className="text-[13px] leading-relaxed text-muted">
            Verranno eliminati definitivamente account, allenamenti, serie ed esercizi
            personalizzati, sia dal cloud sia da questo telefono. L’operazione non si può annullare:
            scarica prima un backup se vuoi conservarli.
          </p>
          <input
            className={cx(inputClass, 'mt-3')}
            type="password"
            autoComplete="current-password"
            placeholder="Password dell’account"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err && <p className="mt-2 text-[12px] text-danger">{err}</p>}
          <Divider className="my-4" />
          <div className="flex gap-2">
            <Button variant="secondary" full onClick={() => setDeleteOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="danger"
              full
              disabled={busy || password.length < 8}
              onClick={() => void handleDelete()}
            >
              {busy ? 'Elimino…' : 'Elimina tutto'}
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
