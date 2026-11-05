/**
 * Recupero una tantum dei dati cloud (sync legacy) a partire da un codice amico.
 * Eseguito in CI solo su workflow_dispatch/pull_request manuale: stampa solo
 * metadati e scrive un artifact CIFRATO (AES-256-GCM) con il payload completo.
 */
import { getStore } from '@netlify/blobs'
import { createCipheriv, randomBytes, scryptSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const SITE_ID = process.env.NETLIFY_SITE_ID
const TOKEN = process.env.NETLIFY_AUTH_TOKEN
const PASSPHRASE = process.env.PL_RECOVERY_KEY
const FRIEND_CODE = (process.env.PL_RECOVERY_FRIEND_CODE || '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '')
  .replace(/(.{4})(?=.)/g, '$1-')

if (!SITE_ID || !TOKEN) throw new Error('credenziali Netlify mancanti')
if (!PASSPHRASE || PASSPHRASE.length < 16) throw new Error('passphrase mancante')
if (!/^[A-Z0-9]{4}(-[A-Z0-9]{4}){2}$/.test(FRIEND_CODE)) throw new Error('codice amico non valido')

const opts = { siteID: SITE_ID, token: TOKEN, consistency: 'strong' }
const syncStore = getStore({ name: 'palestralogger-sync', ...opts })
const socialStore = getStore({ name: 'palestralogger-social', ...opts })

async function listKeys(store, prefix) {
  const keys = []
  for await (const page of store.list({ prefix, paginate: true })) {
    for (const blob of page.blobs) keys.push(blob.key)
  }
  return keys
}

// 1. codice amico -> uid
let uid = null
let socialDoc = null
try {
  uid = await socialStore.get('code/' + FRIEND_CODE)
  console.log('code lookup:', uid ? 'trovato' : 'assente')
} catch (err) {
  console.error('code lookup errore:', err.message)
}

if (!uid) {
  const keys = await listKeys(socialStore, 'u/')
  console.log('documenti social:', keys.length)
  for (const key of keys) {
    const doc = await socialStore.get(key, { type: 'json' })
    if (doc && doc.friendCode === FRIEND_CODE) {
      uid = doc.uid
      console.log('trovato per scansione friendCode')
      break
    }
  }
}

if (uid) {
  socialDoc = await socialStore.get('u/' + uid, { type: 'json' })
}

// 2. tutti gli snapshot sync, con evidenza di quello che appartiene a uid
const syncKeys = await listKeys(syncStore, 'd/')
console.log('blob sync totali:', syncKeys.length)

const candidates = []
for (const key of syncKeys) {
  let doc = null
  try {
    doc = await syncStore.get(key, { type: 'json' })
  } catch {
    continue
  }
  if (!doc || typeof doc !== 'object') continue
  const payload = doc.payload || null
  const profile = payload && payload.profile ? payload.profile : null
  candidates.push({
    key,
    revision: doc.revision ?? 0,
    updatedAt: doc.updatedAt ?? null,
    matchesUid: !!(profile && uid && profile.id === uid),
    payload,
  })
}

const match = candidates.find((c) => c.matchesUid) || null
console.log('match esatto:', match ? 'si' : 'no')
if (match) {
  console.log('revision:', match.revision, 'allenamenti:', (match.payload.workouts || []).length)
}

const secret = {
  friendCode: FRIEND_CODE,
  uid,
  socialDoc,
  match: match ? { key: match.key, revision: match.revision, payload: match.payload } : null,
  candidates: candidates.map((c) => ({
    key: c.key,
    revision: c.revision,
    updatedAt: c.updatedAt,
    matchesUid: c.matchesUid,
    profileId: c.payload?.profile?.id ?? null,
    name: c.payload?.profile?.name ?? null,
    workouts: (c.payload?.workouts || []).length,
    exercises: (c.payload?.exercises || []).length,
    payload: c.payload,
  })),
}

const salt = randomBytes(16)
const iv = randomBytes(12)
const key = scryptSync(PASSPHRASE, salt, 32)
const cipher = createCipheriv('aes-256-gcm', key, iv)
const data = Buffer.concat([cipher.update(JSON.stringify(secret), 'utf8'), cipher.final()])
const out = {
  v: 1,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  tag: cipher.getAuthTag().toString('base64'),
  data: data.toString('base64'),
}
writeFileSync('recovered.enc', JSON.stringify(out))

writeFileSync(
  'recovery-meta.json',
  JSON.stringify(
    {
      candidates: secret.candidates.map(({ payload, ...rest }) => rest),
      found: !!match,
      at: new Date().toISOString(),
    },
    null,
    2,
  ),
)
console.log('artifact cifrato pronto')
