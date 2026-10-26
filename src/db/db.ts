import initSqlJs, { type Database } from 'sql.js'
import { SCHEMA_V1, SEED_EXERCISES } from './schema'

const IDB_NAME = 'palestralogger'
const IDB_STORE = 'sqlite'
const IDB_KEY = 'main'
const SAVE_DEBOUNCE = 120

let db: Database | null = null
let initPromise: Promise<Database> | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let version = 0
const listeners = new Set<() => void>()

function notify() {
  version++
  listeners.forEach((l) => l())
}

export function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function getVersion() {
  return version
}

// ---------- IndexedDB (persistenza del file SQLite) ----------

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(IDB_STORE)) d.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(): Promise<Uint8Array | null> {
  try {
    const d = await openIDB()
    return await new Promise((resolve, reject) => {
      const tx = d.transaction(IDB_STORE, 'readonly')
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY)
      req.onsuccess = () => {
        const v = req.result
        resolve(v ? new Uint8Array(v) : null)
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return null
  }
}

async function idbPut(bytes: Uint8Array): Promise<void> {
  try {
    const d = await openIDB()
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.error('[db] salvataggio IndexedDB fallito', err)
  }
}

export async function flush(): Promise<void> {
  if (!db) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  await idbPut(db.export())
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flush()
  }, SAVE_DEBOUNCE)
}

// ---------- Inizializzazione ----------

// In browser il wasm viaggia con l'app; nei test Node si usa quello di node_modules.
function wasmFile(file: string): string {
  if (typeof window === 'undefined' && typeof process !== 'undefined') {
    return `${process.cwd()}/node_modules/sql.js/dist/${file}`
  }
  return `${import.meta.env.BASE_URL}${file}`
}

async function bootstrap(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: wasmFile,
  })

  const stored = await idbGet()
  if (stored && stored.length > 16) {
    try {
      db = new SQL.Database(stored)
      // integrità minima
      db.exec('PRAGMA schema_version')
    } catch (err) {
      console.error('[db] file SQLite corrotto, riparto da zero', err)
      db = new SQL.Database()
    }
  } else {
    db = new SQL.Database()
  }

  db.run('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA_V1)
  migrate(db)
  seedDefaults(db)
  await flush()
  return db
}

/** Migrazioni idempotenti per database creati con versioni precedenti. */
function migrate(database: Database) {
  try {
    const info = database.exec('PRAGMA table_info(exercises)')
    const columns = info[0]?.values.map((row) => String(row[1])) ?? []
    if (columns.length > 0 && !columns.includes('updated_at')) {
      database.exec("ALTER TABLE exercises ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
    }
    database.exec("UPDATE exercises SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = ''")
    database.exec(`
      CREATE TABLE IF NOT EXISTS deleted_records (
        kind TEXT NOT NULL,
        record_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        deleted_at TEXT NOT NULL,
        PRIMARY KEY (kind, record_id)
      );
      CREATE INDEX IF NOT EXISTS idx_deleted_user ON deleted_records(user_id, deleted_at);
    `)
  } catch (err) {
    console.error('[db] migrazione fallita', err)
  }
}

function seedDefaults(database: Database) {
  const now = new Date().toISOString()
  const stmt = database.prepare(
    'INSERT OR IGNORE INTO exercises (id, user_id, name, muscle, equipment, is_default, created_at, updated_at) VALUES (?, NULL, ?, ?, ?, 1, ?, ?)',
  )
  for (const ex of SEED_EXERCISES) {
    stmt.run([ex.id, ex.name, ex.muscle, ex.equipment, now, now])
  }
  stmt.free()
}

export function getDb(): Database {
  if (!db) throw new Error('Database non inizializzato')
  return db
}

export function initDb(): Promise<Database> {
  if (!initPromise) initPromise = bootstrap()
  return initPromise
}

// ---------- Query helpers ----------

type Param = string | number | null | Uint8Array

export function query<T>(sql: string, params: Param[] = []): T[] {
  const stmt = getDb().prepare(sql)
  try {
    stmt.bind(params)
    const out: T[] = []
    while (stmt.step()) out.push(stmt.getAsObject() as T)
    return out
  } finally {
    stmt.free()
  }
}

export function queryOne<T>(sql: string, params: Param[] = []): T | null {
  const rows = query<T>(sql, params)
  return rows.length > 0 ? rows[0] : null
}

/** Mutazione con debounce di salvataggio + notifica UI. */
export function mutate(sql: string, params: Param[] = []): void {
  getDb().run(sql, params)
  scheduleSave()
  notify()
}

/** Più istruzioni in una transazione atomica, una sola notifica. */
export function tx(fn: (database: Database) => void): void {
  const database = getDb()
  database.run('BEGIN')
  try {
    fn(database)
    database.run('COMMIT')
    scheduleSave()
    notify()
  } catch (err) {
    try {
      database.run('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw err
  }
}

// ---------- Backup / ripristino ----------

export function exportDatabaseBytes(): Uint8Array {
  return getDb().export()
}

export async function importDatabaseBytes(bytes: Uint8Array): Promise<void> {
  const header = new TextDecoder().decode(bytes.slice(0, 16))
  if (!header.startsWith('SQLite format 3')) {
    throw new Error('Il file non è un database SQLite valido')
  }
  await flush()
  const SQL = await initSqlJs({
    locateFile: wasmFile,
  })
  db = new SQL.Database(bytes)
  db.run('PRAGMA foreign_keys = ON')
  db.exec(SCHEMA_V1)
  migrate(db)
  seedDefaults(db)
  await flush()
  notify()
}

export function resetInMemory(): void {
  db = null
  initPromise = null
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    void flush()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush()
  })
}
