/**
 * Scrive uno snapshot nel vecchio store sync (d/<sha256(codice)>) così l'app può
 * recuperarlo da Profilo → "Recupera da codice sync 1.x".
 * Usa solo i secret della CI: non stampa mai i dati.
 */
import { getStore } from '@netlify/blobs'
import { createHash } from 'node:crypto'
import { gunzipSync } from 'node:zlib'

const siteID = process.env.NETLIFY_SITE_ID
const token = process.env.NETLIFY_AUTH_TOKEN
const code = (process.env.PL_MIGRATE_CODE || '').trim().toUpperCase()
const b64 = process.env.PL_MIGRATE_PAYLOAD || ''

if (!siteID || !token) throw new Error('credenziali Netlify mancanti')
if (!/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(code)) throw new Error('codice non valido')
if (!b64) throw new Error('payload mancante')

const payload = JSON.parse(gunzipSync(Buffer.from(b64, 'base64')).toString('utf8'))
const store = getStore({ name: 'palestralogger-sync', siteID, token, consistency: 'strong' })
const key = 'd/' + createHash('sha256').update(code).digest('hex')

await store.setJSON(key, { revision: 1, payload, updatedAt: new Date().toISOString() })
console.log('blob scritto:', key.slice(0, 12) + '…', '| allenamenti:', (payload.workouts || []).length)
