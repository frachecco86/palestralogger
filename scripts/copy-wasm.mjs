import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = resolve(root, 'node_modules/sql.js/dist')
const out = resolve(root, 'public')

// sql.js 1.15 serve due build: "sql-wasm-browser.wasm" nel browser e
// "sql-wasm.wasm" in Node. Copiamo entrambi con lo stesso nome del file.
const files = ['sql-wasm-browser.wasm', 'sql-wasm.wasm']

for (const file of files) {
  const src = resolve(dist, file)
  if (!existsSync(src)) {
    console.error(`[copy-wasm] ${file} non trovato: esegui npm install`)
    process.exit(1)
  }
  copyFileSync(src, resolve(out, file))
  console.log(`[copy-wasm] public/${file} aggiornato`)
}
mkdirSync(out, { recursive: true })
