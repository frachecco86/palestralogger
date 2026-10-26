import { useRef, useState } from 'react'
import type { User } from '../lib/types'
import { deleteUser, getStats, renameUser, updateUserPin } from '../db/queries'
import { exportDatabaseBytes, importDatabaseBytes } from '../db/db'
import { todayISO } from '../lib/dates'
import { formatKg, initials } from '../lib/format'
import { toast, useLiveData } from '../lib/live'
import { disableSync } from '../lib/sync'
import { SyncCard } from '../components/SyncCard'
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

const APP_VERSION = '1.2.0'

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
  const [renameOpen, setRenameOpen] = useState(false)
  const [pinOpen, setPinOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [name, setName] = useState(user.name)
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [err, setErr] = useState<string | null>(null)
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
      toast('Backup ripristinato')
      setTimeout(() => window.location.reload(), 500)
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
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Errore')
    }
  }

  async function savePin() {
    setErr(null)
    if (pin !== pin2) {
      setErr('I due PIN non coincidono')
      return
    }
    if (!/^\d{4,6}$/.test(pin)) {
      setErr('Il PIN deve avere 4-6 cifre')
      return
    }
    try {
      await updateUserPin(user.id, pin)
      setPinOpen(false)
      setPin('')
      setPin2('')
      toast('PIN aggiornato')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Errore')
    }
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
            <p className="text-[13.5px] font-semibold">Profilo locale</p>
            <p className="text-[11px] text-muted">
              Dati al sicuro su questo dispositivo · nessun cloud
            </p>
          </div>
          <Icon name="lock" size={18} className="text-faint" />
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
          icon="logout"
          label="Cambia profilo"
          sub="Torna alla schermata di accesso"
          onClick={onLogout}
        />
        <Row
          icon="lock"
          label="Cambia PIN"
          sub={`PIN a ${user.pinLength} cifre`}
          onClick={() => {
            setPin('')
            setPin2('')
            setErr(null)
            setPinOpen(true)
          }}
        />
        <Row
          icon="user"
          label="Modifica nome"
          onClick={() => {
            setErr(null)
            setName(user.name)
            setRenameOpen(true)
          }}
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
        Sync e dati
      </p>
      <SyncCard user={user} />

      <div className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Backup
      </div>
      <Card className="divide-y divide-line overflow-hidden">
        <Row
          icon="download"
          label="Scarica backup"
          sub="Salva tutti i profili in un file .sqlite"
          onClick={handleBackup}
        />
        <Row
          icon="upload"
          label="Ripristina backup"
          sub="Importa un file .sqlite (sostituisce i dati)"
          onClick={() => fileRef.current?.click()}
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
          label="Elimina profilo"
          sub="Rimuove allenamenti ed esercizi personali"
          danger
          onClick={() => setDeleteOpen(true)}
        />
      </Card>

      <p className="mt-5 mb-2 text-center text-[10.5px] text-faint">
        PalestraLogger {APP_VERSION} · SQLite locale · offline first
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

      <Sheet open={pinOpen} onClose={() => setPinOpen(false)} title="Cambia PIN">
        <div className="space-y-3 pb-5">
          <Field label="Nuovo PIN">
            <input
              className={cx(inputClass, 'tracking-[0.35em] text-center font-semibold')}
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              autoFocus
            />
          </Field>
          <Field label="Ripeti nuovo PIN">
            <input
              className={cx(inputClass, 'tracking-[0.35em] text-center font-semibold')}
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
            />
          </Field>
          {err && <p className="text-[12px] text-danger">{err}</p>}
          <Button className="mt-1" full size="lg" onClick={() => void savePin()}>
            Aggiorna PIN
          </Button>
        </div>
      </Sheet>

      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title="Elimina profilo">
        <div className="pb-5">
          <p className="text-[13px] leading-relaxed text-muted">
            Verranno eliminati definitivamente tutti gli allenamenti, le serie e gli esercizi
            personalizzati di <strong className="text-text">{user.name}</strong>. Scarica prima un
            backup se vuoi conservarli.
          </p>
          <Divider className="my-4" />
          <div className="flex gap-2">
            <Button variant="secondary" full onClick={() => setDeleteOpen(false)}>
              Annulla
            </Button>
            <Button
              variant="danger"
              full
              onClick={() => {
                void (async () => {
                  try {
                    await disableSync(user.id, { deleteRemote: true })
                  } catch {
                    /* offline: elimino comunque la copia locale */
                  }
                  deleteUser(user.id)
                  toast('Profilo eliminato')
                  onLogout()
                })()
              }}
            >
              Elimina tutto
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
