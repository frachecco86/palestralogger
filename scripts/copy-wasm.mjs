import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = resolve(root, 'node_modules/sql.js/dist/sql-wasm.wasm')
const out = resolve(root, 'public/sql-wasm.wasm')

if (!existsSync(src)) {
  console.error('[copy-wasm] sql.js non installato: esegui npm install')
  process.exit(1)
}
mkdirSync(dirname(out), { recursive: true })
copyFileSync(src, out)
console.log('[copy-wasm] public/sql-wasm.wasm aggiornato')
