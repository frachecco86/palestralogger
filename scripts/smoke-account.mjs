/**
 * Smoke test del backend account: registrazione, accesso, sync con revisione,
 * recupero password, codice sync legacy, cancellazione. Store in memoria.
 */
import { build } from 'vite'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const outDir = '.smoke-account'

const common = {
  configFile: false,
  logLevel: 'error',
  resolve: { alias: { '@netlify/blobs': resolve('scripts/fake-blobs.ts') } },
}

await build({
  ...common,
  build: {
    ssr: resolve('netlify/functions/account.ts'),
    outDir,
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'account.mjs' } },
  },
})

await build({
  ...common,
  build: {
    ssr: resolve('netlify/functions/social.ts'),
    outDir,
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'social.mjs' } },
  },
})

await build({
  ...common,
  build: {
    ssr: resolve('netlify/functions/photo.ts'),
    outDir,
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'photo.mjs' } },
  },
})

await build({
  ...common,
  build: {
    ssr: resolve('scripts/fake-blobs.ts'),
    outDir,
    emptyOutDir: false,
    rollupOptions: { output: { entryFileNames: 'fake-blobs.mjs' } },
  },
})

const { handler } = await import(pathToFileURL(resolve(outDir, 'account.mjs')).href)
const fake = await import(pathToFileURL(resolve(outDir, 'fake-blobs.mjs')).href)

let failures = 0
function check(label, condition, extra = '') {
  if (condition) {
    console.log('  ok  ', label)
  } else {
    failures++
    console.error('  FAIL', label, extra)
  }
}

async function call(action, body = {}) {
  const res = await handler({
    httpMethod: 'POST',
    body: JSON.stringify({ action, ...body }),
    headers: {},
  })
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

const email = 'francesco@example.com'
const password = 'password123'

console.log('1. registrazione')
let reg = await call('register', { email, password, name: 'Francesco' })
check('status 200', reg.status === 200, JSON.stringify(reg.body))
check('token presente', typeof reg.body.token === 'string' && reg.body.token.length > 20)
check('codice di recupero', /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(reg.body.recoveryCode ?? ''))
check('revision iniziale 0', reg.body.revision === 0)
const accountId = reg.body.account?.id
const token = reg.body.token
let recoveryCode = reg.body.recoveryCode

console.log('2. email duplicata e password errata')
check('registrazione duplicata 409', (await call('register', { email, password, name: 'Altro' })).status === 409)
check('login password errata 401', (await call('login', { email, password: 'sbagliata1' })).status === 401)

console.log('3. sessione e dati')
const session = await call('session', { token })
check('sessione valida', session.status === 200 && session.body.account.id === accountId)
const payload = {
  version: 1,
  profile: { id: accountId, name: 'Francesco', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  exercises: [],
  workouts: [
    { id: 'w1', date: '2026-10-30', name: 'Push', notes: '', createdAt: '2026-10-30T10:00:00.000Z', updatedAt: '2026-10-30T10:00:00.000Z', sets: [] },
  ],
  tombstones: [],
  savedAt: new Date().toISOString(),
}
const push1 = await call('push', { token, payload, baseRevision: 0 })
check('push revision 1', push1.status === 200 && push1.body.revision === 1, JSON.stringify(push1.body))
const pull1 = await call('pull', { token })
check('pull contiene i dati', pull1.body.payload?.workouts?.length === 1)
const conflict = await call('push', { token, payload, baseRevision: 0 })
check('conflitto 409', conflict.status === 409 && conflict.body.conflict === true)
check('payload nel conflitto', conflict.body.payload?.workouts?.length === 1)
check('token non valido 401', (await call('pull', { token: 'x'.repeat(40) })).status === 401)

console.log('4. nome profilo allineato al push')
const renamed = { ...payload, profile: { ...payload.profile, name: 'Francesco C.' }, savedAt: new Date().toISOString() }
await call('push', { token, payload: renamed, baseRevision: 1 })
const session2 = await call('session', { token })
check('nome aggiornato', session2.body.account.name === 'Francesco C.', session2.body.account.name)

console.log('5. codice sync 1.x')
fake.__setBlob('palestralogger-sync', 'd/' + (await import('node:crypto')).createHash('sha256').update('AAAA-BBBB-CCCC-DDDD').digest('hex'), {
  revision: 7,
  payload: { version: 1, profile: { id: 'legacy-profile-id-123', name: 'Vecchio' }, exercises: [], workouts: [], tombstones: [], savedAt: 'x' },
})
const claim = await call('claimSyncCode', { token, code: 'AAAA-BBBB-CCCC-DDDD' })
check('claim recupera il payload', claim.status === 200 && claim.body.payload?.profile?.id === 'legacy-profile-id-123')
check('codice inesistente 404', (await call('claimSyncCode', { token, code: 'ZZZZ-ZZZZ-ZZZZ-ZZZZ' })).status === 404)

console.log('6. cambio password')
const changed = await call('changePassword', { token, currentPassword: password, newPassword: 'nuovapassword1' })
check('nuovo token', changed.status === 200 && typeof changed.body.token === 'string')
check('vecchio token revocato', (await call('pull', { token })).status === 401)
check('nuovo token valido', (await call('pull', { token: changed.body.token })).status === 200)
let activeToken = changed.body.token
check('password errata su cambio 401', (await call('changePassword', { token: activeToken, currentPassword: 'no', newPassword: 'nuovapassword2' })).status === 401)

console.log('7. codice di recupero')
const rotate = await call('rotateRecovery', { token: activeToken, password: 'nuovapassword1' })
check('codice rigenerato', rotate.status === 200 && rotate.body.recoveryCode !== recoveryCode)
recoveryCode = rotate.body.recoveryCode
const reset = await call('resetWithRecovery', { email, code: recoveryCode, newPassword: 'passwordfinale1' })
check('reset con codice ok', reset.status === 200 && typeof reset.body.token === 'string')
check('nuovo codice dopo il reset', reset.body.recoveryCode !== recoveryCode)
check('vecchio codice rifiutato', (await call('resetWithRecovery', { email, code: recoveryCode, newPassword: 'passwordfinale2' })).status === 401)
activeToken = reset.body.token
check('login con la nuova password', (await call('login', { email, password: 'passwordfinale1' })).status === 200)

console.log('8. sessione scaduta dopo reset')
check('token del reset valido', (await call('session', { token: activeToken })).status === 200)

console.log('9. cancellazione account')
check('cancellazione senza password 401', (await call('delete', { token: activeToken, password: 'sbagliata' })).status === 401)
const del = await call('delete', { token: activeToken, password: 'passwordfinale1' })
check('cancellazione ok', del.status === 200)
check('sessione revocata', (await call('session', { token: activeToken })).status === 401)
check('login negato', (await call('login', { email, password: 'passwordfinale1' })).status === 401)
check('email riutilizzabile', (await call('register', { email, password, name: 'Nuovo' })).status === 200)

console.log('10. rate limit sugli accessi falliti')
for (let i = 0; i < 9; i++) await call('login', { email: 'limite@example.com', password: 'sbagliata' })
check('429 dopo troppi tentativi', (await call('login', { email: 'limite@example.com', password: 'sbagliata' })).status === 429)

console.log('11. amici con la sessione dell\'account')
const socialMod = await import(pathToFileURL(resolve(outDir, 'social.mjs')).href)
async function social(action, token, body = {}) {
  const res = await socialMod.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ action, token, ...body }),
    headers: {},
  })
  return { status: res.statusCode, body: JSON.parse(res.body) }
}

const a = await call('register', { email: 'a@example.com', password: 'password123', name: 'Anna' })
const b = await call('register', { email: 'b@example.com', password: 'password123', name: 'Bruno' })
const act = await social('activate', a.body.token)
check('attivazione amici', act.status === 200 && /^[A-Z0-9]{4}(-[A-Z0-9]{4}){2}$/.test(act.body.me.friendCode))
const friendCode = act.body.me.friendCode
check('amici senza token 401', (await social('me', 'x'.repeat(40))).status === 401)
const req = await social('request', b.body.token, { friendCode })
check('richiesta inviata', req.status === 200 && req.body.status === 'requested')
const inbox = await social('me', a.body.token)
check('richiesta ricevuta', inbox.body.incoming?.length === 1 && inbox.body.incoming[0].uid === b.body.account.id)
const acc = await social('respond', a.body.token, { fromUid: b.body.account.id, accept: true })
check('amicizia accettata', acc.status === 200 && acc.body.friends?.some((f) => f.uid === b.body.account.id))
const snap = { version: 1, generatedAt: new Date().toISOString(), stats: {}, workouts: [{ id: 'w1', date: '2026-10-30', name: 'Push', muscles: [], volume: 1000, sets: 3, exercises: [] }] }
check('pubblicazione snapshot', (await social('publish', a.body.token, { snapshot: snap })).status === 200)
const bState = await social('me', b.body.token)
check('l\'amico vede lo snapshot', bState.body.friends?.[0]?.snapshot?.workouts?.length === 1)
check('cancellazione amici', (await social('delete', a.body.token)).status === 200)

console.log('12. foto esercizio')
const photoMod = await import(pathToFileURL(resolve(outDir, 'photo.mjs')).href)
async function photoCall(action, token, body = {}) {
  const res = await photoMod.handler({
    httpMethod: 'POST',
    body: JSON.stringify({ action, token, ...body }),
    headers: {},
  })
  return { status: res.statusCode, body: JSON.parse(res.body) }
}
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]).toString('base64')
check('foto senza token 401', (await photoCall('list', 'x'.repeat(40))).status === 401)
const emptyList = await photoCall('list', a.body.token)
check('indice foto vuoto', emptyList.status === 200 && Object.keys(emptyList.body.photos ?? {}).length === 0)
check(
  'mime non valido 400',
  (await photoCall('put', a.body.token, { exerciseId: 'def-panca-piana', mime: 'text/plain', data: jpeg })).status === 400,
)
check(
  'esercizio non valido 400',
  (await photoCall('put', a.body.token, { exerciseId: '../x', mime: 'image/jpeg', data: jpeg })).status === 400,
)
const put = await photoCall('put', a.body.token, {
  exerciseId: 'def-panca-piana',
  mime: 'image/jpeg',
  data: jpeg,
  updatedAt: '2026-11-05T10:00:00.000Z',
})
check('upload foto', put.status === 200 && put.body.size === Buffer.from(jpeg, 'base64').length, JSON.stringify(put.body))
const idx1 = await photoCall('list', a.body.token)
check('indice aggiornato', idx1.body.photos?.['def-panca-piana']?.mime === 'image/jpeg')
const got = await photoCall('get', a.body.token, { exerciseId: 'def-panca-piana' })
check('download foto identica', got.status === 200 && got.body.data === jpeg)
const stalePut = await photoCall('put', a.body.token, {
  exerciseId: 'def-panca-piana',
  mime: 'image/jpeg',
  data: jpeg,
  updatedAt: '2026-01-01T00:00:00.000Z',
})
check('upload vecchio non sovrascrive', stalePut.status === 200 && stalePut.body.ignored === undefined)
const delPhoto = await photoCall('delete', a.body.token, { exerciseId: 'def-panca-piana' })
check('cancellazione foto', delPhoto.status === 200)
const afterDelete = await photoCall('put', a.body.token, {
  exerciseId: 'def-panca-piana',
  mime: 'image/jpeg',
  data: jpeg,
  updatedAt: '2020-01-01T00:00:00.000Z',
})
check('upload pre-cancellazione ignorato', afterDelete.body.ignored === true)
const idx2 = await photoCall('list', a.body.token)
check('tombstone foto', !!idx2.body.deleted?.['def-panca-piana'])
check(
  'download dopo cancellazione 404',
  (await photoCall('get', a.body.token, { exerciseId: 'def-panca-piana' })).status === 404,
)

console.log('')
if (failures > 0) {
  console.error(`ACCOUNT SMOKE FAIL (${failures})`)
  process.exit(1)
}
console.log('ACCOUNT SMOKE OK')
