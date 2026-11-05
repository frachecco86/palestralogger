import { useRef, useState } from 'react'
import { Button, Icon, Sheet, cx, inputClass } from '../components/ui'
import { importDatabaseBytes } from '../db/db'
import { AccountError, type Account, login, register, resetWithRecovery } from '../lib/account'
import { toast } from '../lib/live'
import { setLocalOwner } from '../lib/session'
import { Footer } from '../components/Footer'

type Mode = 'login' | 'register' | 'recover'

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder = '••••••••',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoComplete?: string
  placeholder?: string
}) {
  const [show, setShow] = useState(false)
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <span className="relative block">
        <input
          className={cx(inputClass, 'pr-16')}
          type={show ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-medium text-muted"
        >
          {show ? 'Nascondi' : 'Mostra'}
        </button>
      </span>
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  inputMode,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  autoComplete?: string
  inputMode?: 'email' | 'text' | 'numeric'
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      <input
        className={inputClass}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={inputMode}
        autoCapitalize={type === 'email' ? 'none' : undefined}
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}

function errorMessage(err: unknown): string {
  if (err instanceof AccountError) return err.message
  if (err instanceof Error) return err.message
  return 'Operazione non riuscita, riprova'
}

export function AuthScreen({
  notice,
  onAuthenticated,
}: {
  notice?: string | null
  onAuthenticated: (account: Account) => void
}) {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // dopo la creazione o il recupero: mostra il codice di recupero
  const [created, setCreated] = useState<{ account: Account; recoveryCode?: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  const canLogin = emailValid && password.length >= 8 && !busy
  const canRegister =
    emailValid && password.length >= 8 && confirm === password && name.trim().length >= 2 && !busy
  const canRecover =
    emailValid && code.replace(/[^A-Za-z0-9]/g, '').length === 16 && newPassword.length >= 8 && !busy

  async function submit() {
    setError(null)
    setBusy(true)
    try {
      if (mode === 'login') {
        const res = await login(email.trim(), password)
        onAuthenticated(res.account)
        return
      }
      if (mode === 'register') {
        if (confirm !== password) throw new Error('Le due password non coincidono')
        const res = await register(email.trim(), password, name.trim())
        setCreated({ account: res.account, recoveryCode: res.recoveryCode })
        return
      }
      const res = await resetWithRecovery(email.trim(), code, newPassword)
      setCreated({ account: res.account, recoveryCode: res.recoveryCode })
      toast('Password aggiornata')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function copyCode() {
    if (!created?.recoveryCode) return
    try {
      await navigator.clipboard.writeText(created.recoveryCode)
      setCopied(true)
      toast('Codice copiato')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast('Copia manuale: ' + created.recoveryCode, 'err')
    }
  }

  async function handleImport(file: File) {
    if (!created) return
    setImportBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await importDatabaseBytes(bytes)
      // i dati del backup sono "senza proprietario": li adotterà l'account appena creato
      setLocalOwner(null)
      toast('Backup caricato')
      onAuthenticated(created.account)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Backup non valido', 'err')
    } finally {
      setImportBusy(false)
    }
  }

  const title =
    mode === 'login' ? 'Accedi' : mode === 'register' ? 'Crea il tuo account' : 'Recupera l’account'

  return (
    <div className="min-h-dvh hero-glow flex flex-col">
      <div className="mx-auto w-full max-w-md px-5 pt-[max(28px,env(safe-area-inset-top))] pb-8 flex-1 flex flex-col">
        <div className="flex flex-col items-center text-center pt-2">
          <img src="/icons/icon-192.png" alt="" className="h-16 w-16 rounded-[18px] shadow-lg shadow-lime/10" />
          <h1 className="mt-4 text-[22px] font-bold tracking-tight">PalestraLogger</h1>
          <p className="mt-1 max-w-[300px] text-[13px] leading-relaxed text-muted">
            I tuoi allenamenti nel cloud: li ritrovi su ogni telefono, anche se svuoti i dati del
            browser. E funziona anche offline.
          </p>
        </div>

        {notice && (
          <p className="mt-4 rounded-xl border border-lime/25 bg-lime/[0.07] px-3 py-2 text-[12px] text-lime">
            {notice}
          </p>
        )}

        <div className="mt-6 flex rounded-2xl border border-line bg-surface2/70 p-1">
          {(
            [
              ['login', 'Accedi'],
              ['register', 'Registrati'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value)
                setError(null)
              }}
              className={cx(
                'flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors',
                mode === value ? 'bg-lime text-ink' : 'text-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3.5">
          {mode === 'recover' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setError(null)
                }}
                className="flex items-center gap-1 text-[12.5px] text-muted"
              >
                <Icon name="back" size={14} /> Torna all’accesso
              </button>
            </div>
          )}

          <h2 className="text-[15px] font-semibold">{title}</h2>

          <TextField
            label="Email"
            value={email}
            onChange={setEmail}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="nome@esempio.it"
          />

          {mode === 'register' && (
            <TextField
              label="Nome profilo"
              value={name}
              onChange={setName}
              placeholder="Es. Francesco"
              autoComplete="given-name"
            />
          )}

          {mode === 'recover' ? (
            <>
              <TextField
                label="Codice di recupero"
                value={code}
                onChange={(v) =>
                  setCode(
                    v
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 16)
                      .replace(/(.{4})(?=.)/g, '$1-'),
                  )
                }
                placeholder="XXXX-XXXX-XXXX-XXXX"
                autoComplete="one-time-code"
              />
              <PasswordField
                label="Nuova password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
              />
            </>
          ) : (
            <>
              <PasswordField
                label="Password"
                value={password}
                onChange={setPassword}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              {mode === 'register' && (
                <PasswordField
                  label="Ripeti password"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                />
              )}
            </>
          )}

          {error && (
            <p className="rounded-xl border border-danger/25 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
              {error}
            </p>
          )}

          <Button
            size="lg"
            full
            disabled={mode === 'login' ? !canLogin : mode === 'register' ? !canRegister : !canRecover}
            onClick={() => void submit()}
          >
            {busy
              ? mode === 'register'
                ? 'Creazione…'
                : mode === 'recover'
                  ? 'Recupero…'
                  : 'Accesso…'
              : mode === 'login'
                ? 'Entra'
                : mode === 'register'
                  ? 'Crea account'
                  : 'Reimposta password'}
          </Button>

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => {
                setMode('recover')
                setError(null)
              }}
              className="w-full py-1 text-[12.5px] text-muted"
            >
              Password dimenticata? Usa il codice di recupero
            </button>
          )}

          <p className="flex gap-1.5 pt-1 text-[11px] leading-relaxed text-faint">
            <Icon name="cloud" size={13} className="mt-0.5 shrink-0" />
            Gli allenamenti sono salvati online sul tuo account e in copia sul telefono. Il
            servizio è su Netlify e non scade.
          </p>
        </div>

        <div className="mt-auto pt-8 flex flex-col items-center gap-1 text-center">
          <p className="text-[11px] text-faint">Cloud + offline · senza abbonamenti</p>
          <Footer className="pt-2" />
        </div>
      </div>

      <Sheet
        open={!!created}
        onClose={() => {
          if (created) onAuthenticated(created.account)
        }}
        title="Salva il codice di recupero"
      >
        <div className="pb-5">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Se dimentichi la password, questo codice è l’unico modo per rientrare. Ti serve per
            reimpostarla: conservalo nelle note del telefono o in un gestore di password.
          </p>

          <button
            type="button"
            onClick={() => void copyCode()}
            className="press mt-3 w-full rounded-2xl border border-lime/30 bg-lime/[0.07] px-3 py-4"
          >
            <span className="block font-mono text-[18px] font-bold tracking-[0.14em] text-lime">
              {created?.recoveryCode ?? '—'}
            </span>
            <span className="mt-1 flex items-center justify-center gap-1 text-[10.5px] text-muted">
              <Icon name={copied ? 'check' : 'copy'} size={12} /> Tocca per copiare
            </span>
          </button>

          <p className="mt-3 flex gap-1.5 text-[11px] leading-relaxed text-faint">
            <Icon name="lock" size={13} className="mt-0.5 shrink-0" />
            Puoi generarne uno nuovo quando vuoi da Profilo → Sicurezza. Non è la password: senza di
            esso non possiamo recuperare l’account.
          </p>

          <div className="mt-4 space-y-2">
            <Button full size="lg" onClick={() => created && onAuthenticated(created.account)}>
              Inizia a usare l’app
            </Button>
            <Button
              variant="secondary"
              full
              disabled={importBusy}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="upload" size={15} /> {importBusy ? 'Importazione…' : 'Importa un backup .sqlite'}
            </Button>
          </div>

          <p className="mt-2 text-center text-[10.5px] text-faint">
            Hai usato la versione 1.x? Importa il backup o il codice sync dal Profilo.
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
