import { Window } from 'happy-dom'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const window = new Window({ url: 'https://palestralogger.netlify.app/' })
globalThis.window = window
globalThis.document = window.document
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true })
Object.defineProperty(globalThis, 'location', { value: window.location, configurable: true })
globalThis.localStorage = window.localStorage
globalThis.sessionStorage = window.sessionStorage
globalThis.HTMLElement = window.HTMLElement
globalThis.Element = window.Element
globalThis.Node = window.Node
globalThis.CustomEvent = window.CustomEvent
globalThis.Event = window.Event
globalThis.getComputedStyle = window.getComputedStyle.bind(window)

const { default: indexedDB } = await import('fake-indexeddb')
globalThis.indexedDB = indexedDB
window.indexedDB = indexedDB

window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
Object.defineProperty(window.navigator, 'serviceWorker', {
  value: { register: async () => ({}), addEventListener() {}, removeEventListener() {}, controller: null },
  configurable: true,
})

window.document.body.innerHTML = '<div id="root"></div>'

const LIVE = process.env.LIVE === '1'
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
const ORIGIN = 'https://palestralogger.netlify.app'
const realFetch = globalThis.fetch

let bundlePath = resolve('dist/assets', readdirSync('dist/assets').find((f) => f.startsWith('index-') && f.endsWith('.js')))
if (LIVE) {
  const html = await (await realFetch(ORIGIN + '/')).text()
  const src = html.match(/\/assets\/index-[^"']+\.js/)[0]
  const code = await (await realFetch(ORIGIN + src)).text()
  bundlePath = '/tmp/palestralogger-prod-bundle.mjs'
  writeFileSync(bundlePath, code)
  console.log('live bundle:', src)
}

const sharedLibrary = [
  {
    id: 'shared-remote-1',
    name: 'Rematore Kayak',
    alias: 'kayak row, rematore kayak',
    muscle: 'Schiena',
    equipment: 'Manubri',
    tracking: 'reps',
    authorId: 'acct-luca',
    authorName: 'Luca',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  },
]

const hiddenDefaults = []
const workoutSent = []
const workoutInbox = [
  {
    id: '1740000000000-abcdef',
    fromUid: 'friend-1',
    fromName: 'Luca',
    createdAt: '2026-11-13T10:00:00.000Z',
    workout: {
      date: '2026-11-13',
      name: 'Scheda di Luca',
      notes: 'Prova condivisa',
      entries: [
        {
          name: 'Panca piana',
          muscle: 'Petto',
          equipment: 'Bilanciere',
          tracking: 'reps',
          notes: '',
          sets: [{ reps: 8, weight: 80, rpe: null }],
        },
        {
          name: 'Rematore Kayak',
          muscle: 'Schiena',
          equipment: 'Manubri',
          tracking: 'reps',
          notes: '',
          sets: [{ reps: 10, weight: 30, rpe: null }],
        },
      ],
    },
  },
]

let offline = false
let lastPushPayload = null

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
  if (offline && url.includes('/api/')) throw new TypeError('offline')
  const file = url.split('/').pop() || ''
  if (file.endsWith('.wasm')) {
    if (LIVE) {
      const res = await realFetch(ORIGIN + '/' + file)
      console.log('live wasm:', res.status, res.headers.get('content-type'))
      return res
    }
    return new Response(readFileSync(resolve('dist', file)), {
      status: 200,
      headers: { 'content-type': 'application/wasm' },
    })
  }
  if (url.includes('api/account')) {
    const body = JSON.parse(init?.body || '{}')
    const adminEmail = 'francescochecco@gmail.com'
    const admin = String(body.token || '').startsWith('token-admin') || body.email === adminEmail
    const account = {
      id: 'acct-1',
      uid: 'acct-1',
      email: admin ? adminEmail : body.email || 'marco@example.com',
      name: body.name || 'Marco',
      createdAt: '2026-10-26T10:00:00.000Z',
      role: admin ? 'admin' : 'user',
    }
    if (body.action === 'register' || body.action === 'login') {
      const token = admin ? 'token-admin-0123456789abcdef' : 'token-di-prova-0123456789abcdef'
      return json({ token, account, recoveryCode: 'AAAA-BBBB-CCCC-DDDD', revision: 0 })
    }
    if (body.action === 'session') return json({ account, revision: 0 })
    if (body.action === 'pull') return json({ revision: 0, payload: null })
    if (body.action === 'push') {
      lastPushPayload = body.payload
      return json({ revision: 1, updatedAt: now })
    }
    if (body.action === 'claimSyncCode') return json({ error: 'no_data' }, 404)
    if (body.action === 'delete') return json({ ok: true })
    return json({ ok: true })
  }
  if (url.includes('api/exercises')) {
    const body = JSON.parse(init?.body || '{}')
    if (body.action === 'list') return json({ exercises: sharedLibrary, hiddenDefaults })
    if (body.action === 'publish') {
      const input = body.exercise || {}
      const index = sharedLibrary.findIndex((e) => e.id === input.id)
      if (
        index < 0 &&
        sharedLibrary.some(
          (e) => String(e.name).toLowerCase() === String(input.name || '').toLowerCase(),
        )
      ) {
        return json({ error: 'duplicate_name' }, 409)
      }
      const record = {
        id: input.id,
        name: input.name,
        alias: input.alias || '',
        muscle: input.muscle,
        equipment: input.equipment || '',
        tracking: input.tracking === 'time' ? 'time' : 'reps',
        authorId: 'acct-1',
        authorName: 'Marco',
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      }
      if (index >= 0) sharedLibrary[index] = record
      else sharedLibrary.push(record)
      return json({ ok: true, exercises: sharedLibrary, hiddenDefaults })
    }
    if (body.action === 'delete') {
      const id = String(body.exerciseId || '')
      if (id.startsWith('def-')) {
        if (!hiddenDefaults.includes(id)) hiddenDefaults.push(id)
      } else {
        const index = sharedLibrary.findIndex((e) => e.id === id)
        if (index >= 0) sharedLibrary.splice(index, 1)
      }
      return json({ ok: true, exercises: sharedLibrary, hiddenDefaults })
    }
    return json({ ok: true })
  }
  if (url.includes('api/workouts')) {
    const body = JSON.parse(init?.body || '{}')
    if (body.action === 'users') {
      return json({
        users: [
          { uid: 'friend-1', name: 'Luca' },
          { uid: 'friend-2', name: 'Sara' },
        ],
      })
    }
    if (body.action === 'share') {
      workoutSent.push({ toUid: body.toUid, workout: body.workout })
      return json({ ok: true, id: '1740000000001-aaaaaa' })
    }
    if (body.action === 'inbox') return json({ shares: workoutInbox })
    if (body.action === 'delete') {
      const index = workoutInbox.findIndex((share) => share.id === body.id)
      if (index >= 0) workoutInbox.splice(index, 1)
      return json({ ok: true })
    }
    return json({ ok: true })
  }
  if (url.includes('api/photo')) {
    const body = JSON.parse(init?.body || '{}')
    if (body.action === 'list') return json({ photos: {}, deleted: {} })
    return json({ error: 'not_found' }, 404)
  }
  if (url.includes('api/social')) {
    if (LIVE) return realFetch(input, init)
    const body = JSON.parse(init?.body || '{}')
    const now = new Date().toISOString()
    const friendSnap = {
      version: 1, generatedAt: now,
      stats: {
        totalWorkouts: 12, totalVolume: 24000, totalSets: 90, totalReps: 900, activeDays: 20,
        weekWorkouts: 3, weekVolume: 6000, monthWorkouts: 8, monthVolume: 15000,
        currentStreak: 2, bestStreak: 5, firstDate: '2026-09-01', lastDate: '2026-10-25',
        muscles: [{ muscle: 'Petto', volume: 9000, sets: 40 }],
        topExercises: [{ name: 'Panca piana', muscle: 'Petto', volume: 9000, sets: 40, bestWeight: 90, bestE1rm: 110, lastDate: '2026-10-25' }],
        weekly: [],
      },
      workouts: [{
        id: 'fw1', date: '2026-10-25', name: 'Push', muscles: ['Petto'], volume: 3000, sets: 9,
        exercises: [{ name: 'Panca piana', muscle: 'Petto', equipment: 'Bilanciere', sets: [{ reps: 10, weight: 80 }] }],
        note: 'Ottima sessione',
      }],
    }
    const luca = { uid: 'friend-1', name: 'Luca', snapshot: friendSnap, updatedAt: now }
    const sara = { uid: 'friend-2', name: 'Sara', snapshot: null, updatedAt: now }
    let state = {
      exists: true,
      me: { uid: 'uid-self', name: 'Marco', friendCode: 'QQQQ-WWWW-EEEE', snapshot: null, updatedAt: now },
      friends: [luca],
      incoming: [{ uid: 'friend-2', name: 'Sara', at: now }],
      outgoing: [],
    }
    if (body.action === 'activate') state = { ...state, incoming: state.incoming }
    else if (body.action === 'request') return json({ status: 'requested', target: { uid: 'friend-3', name: 'Anna' } })
    else if (body.action === 'respond' && body.accept) {
      state = { ...state, incoming: [], friends: [luca, sara] }
      return json(state)
    } else if (body.action === 'publish') return json({ ok: true, updatedAt: now })
    else if (body.action === 'delete') return json({ ok: true })
    return json(state)
  }
  return realFetch(input, init)
}
window.fetch = globalThis.fetch
const asset = bundlePath.split('/').pop()
const errors = []
window.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || e.error)))
process.on('unhandledRejection', (e) => errors.push('unhandled: ' + (e && e.message ? e.message : String(e))))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const body = () => window.document.body.textContent.replace(/\s+/g, ' ').trim()
const aria = (el) => el.getAttribute('aria-label') || ''
const buttons = () => [...window.document.querySelectorAll('button')]
const buttonWithText = (text) =>
  buttons().find((b) => (b.textContent || '').replace(/\s+/g, ' ').trim() === text)

function setValue(el, value) {
  if (!el) throw new Error('input non trovato')
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set
  setter.call(el, value)
  el.dispatchEvent(new window.Event('input', { bubbles: true }))
}

async function clickText(text, { exact = false } = {}) {
  const buttons = [...window.document.querySelectorAll('button')]
  const target = buttons.find((b) => {
    const t = (b.textContent || '').replace(/\s+/g, ' ').trim()
    return exact ? t === text : t.includes(text)
  })
  if (!target) throw new Error('bottone non trovato: ' + text + ' | body: ' + body().slice(0, 200))
  target.click()
  await wait(350)
}

await import(bundlePath)
for (let i = 0; i < 25 && !body().includes('Registrati'); i++) await wait(300)
await wait(400)

console.log('1. avvio:', body().slice(0, 60))

await clickText('Registrati')
await wait(300)
const inputs = [...window.document.querySelectorAll('input')]
// il submit è l'ultimo bottone "Crea account" (il primo è la tab)
const registerSubmit = () =>
  [...window.document.querySelectorAll('button')]
    .filter((b) => (b.textContent || '').replace(/\s+/g, ' ').trim() === 'Crea account')
    .pop()
if (!registerSubmit()) throw new Error('bottone crea account non trovato')
// il pulsante è sempre attivo e spiega cosa manca
registerSubmit().click()
await wait(300)
if (!body().includes('Inserisci un indirizzo email valido'))
  throw new Error('validazione email non mostrata')
setValue(inputs[0], 'marco@example.com')
setValue(inputs[1], 'Marco')
setValue(inputs[2], 'corta')
setValue(inputs[3], 'corta')
await wait(250)
registerSubmit().click()
await wait(300)
if (!body().includes('almeno 8 caratteri')) throw new Error('validazione password non mostrata')
setValue(inputs[2], 'password123')
setValue(inputs[3], 'password123')
await wait(250)
registerSubmit().click()
await wait(900)

// sheet con il codice di recupero
if (!body().includes('AAAA-BBBB-CCCC-DDDD')) throw new Error('codice di recupero non mostrato')
await clickText('Inizia a usare l’app')
await wait(1800)

console.log('2. home:', body().slice(0, 120))
if (!body().includes('Ciao, Marco')) throw new Error('login/creazione account fallita')

await clickText('Nuovo allenamento')
await wait(600)
console.log('3. editor:', body().slice(0, 100))

await clickText('Aggiungi esercizio')
await wait(600)
const search = window.document.querySelector('input[inputmode="search"]')
setValue(search, 'panca')
await wait(600)
console.log('4. picker:', body().slice(0, 160))

await clickText('Panca piana')
await wait(600)

const reps = window.document.querySelector('input[aria-label="ripetizioni serie 1"]')
const weight = window.document.querySelector('input[aria-label="peso serie 1"]')
setValue(reps, '10')
setValue(weight, '80')
const notes = window.document.querySelector('textarea[aria-label="Note della sessione"]')
setValue(notes, 'Nota di prova')
const entryNotes = window.document.querySelector('textarea[aria-label="Note Panca piana"]')
if (!entryNotes) throw new Error('campo note dell’esercizio mancante')
setValue(entryNotes, 'Nota esercizio di prova')
await wait(300)

// "applica a tutte": copia i kg della serie 1 su tutte le serie
const applyAll = window.document.querySelector(
  'button[aria-label="Applica il peso della serie 1 a tutte le serie"]',
)
if (!applyAll) throw new Error('tasto «applica a tutte» mancante')
applyAll.click()
await wait(350)
const w2 = window.document.querySelector('input[aria-label="peso serie 2"]')
const w3 = window.document.querySelector('input[aria-label="peso serie 3"]')
if (!w2 || !w3 || w2.value !== '80' || w3.value !== '80')
  throw new Error('peso non applicato a tutte le serie')
setValue(w2, '0')
setValue(w3, '0')
await wait(250)

// le foto si modificano solo dalla pagina Esercizi
if (buttons().some((b) => aria(b).startsWith('Aggiungi foto')))
  throw new Error('foto modificabile nell’allenamento')

console.log('5. serie:', window.document.querySelectorAll('input[aria-label^="ripetizioni"]').length)
if (![...window.document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === 'Aggiungi serie'))
  throw new Error('«Aggiungi serie» assente in un nuovo allenamento')
await clickText('Salva', { exact: true })
await wait(1600)

console.log('6. dopo salvataggio:', body().slice(0, 500))
if (!body().includes('Nota di prova')) throw new Error('note non mostrate in home')
if (!body().includes('800 kg')) throw new Error('volume non mostrato in home')
// condivisione come immagine: in happy-dom manca il canvas, ma il foglio si deve aprire
await clickText('Petto')
await wait(700)

// schede esercizio compresse dopo il salvataggio + cancellazione solo in modalità modifica
if (window.document.querySelector('input[aria-label="ripetizioni serie 1"]'))
  throw new Error('esercizio salvato non compresso')
if (buttons().some((b) => aria(b).startsWith('Rimuovi ')))
  throw new Error('cestino visibile senza modalità modifica')
const expand = buttons().find((b) => aria(b).startsWith('Espandi '))
if (!expand) throw new Error('icona espandi mancante')
expand.click()
await wait(400)
if (!window.document.querySelector('span[aria-label^="ripetizioni serie 1"]'))
  throw new Error('espansione non mostra le serie')
// la nota dell'esercizio resta leggibile in sola lettura (anche da compressa)
if (!body().includes('Nota esercizio di prova'))
  throw new Error('nota esercizio non mostrata in sola lettura')
if (window.document.querySelector('textarea[aria-label="Note Panca piana"]'))
  throw new Error('note esercizio modificabili in sola lettura')
// in sola lettura: niente input, niente aggiunta serie/esercizi/foto
if (buttonWithText('Aggiungi esercizio'))
  throw new Error('«Aggiungi esercizio» attivo in sola lettura')
if (!body().includes('Tocca «Modifica» per aggiungere esercizi'))
  throw new Error('avviso di sola lettura mancante')
if (buttons().some((b) => aria(b).startsWith('Aggiungi foto')))
  throw new Error('foto modificabile in sola lettura')
const addSet = () => buttonWithText('Aggiungi serie')
if (addSet()) throw new Error('«Aggiungi serie» attivo senza modalità modifica')
if (window.document.querySelector('input[aria-label^="ripetizioni"]'))
  throw new Error('input attivo senza modalità modifica')
await clickText('Modifica', { exact: true })
await wait(300)
if (!buttons().some((b) => aria(b).startsWith('Rimuovi Panca')))
  throw new Error('cestino non compare in modalità modifica')
if (!addSet()) throw new Error('«Aggiungi serie» assente in modalità modifica')
if (!window.document.querySelector('input[aria-label="ripetizioni serie 1"]'))
  throw new Error('input non attivo in modalità modifica')
const noteField = window.document.querySelector('textarea[aria-label="Note Panca piana"]')
if (!noteField || noteField.value !== 'Nota esercizio di prova')
  throw new Error('note esercizio non modificabili in modalità modifica')
if (!buttonWithText('Aggiungi esercizio'))
  throw new Error('«Aggiungi esercizio» non attivo in modalità modifica')
if (buttons().some((b) => aria(b).startsWith('Aggiungi foto')))
  throw new Error('foto ancora modificabile nell’allenamento')
await clickText('Fine', { exact: true })
await wait(300)
if (buttons().some((b) => aria(b).startsWith('Rimuovi Panca')))
  throw new Error('cestino ancora visibile dopo aver chiuso la modifica')
if (addSet()) throw new Error('«Aggiungi serie» ancora attivo dopo la modifica')
if (buttonWithText('Aggiungi esercizio'))
  throw new Error('«Aggiungi esercizio» ancora attivo dopo la modifica')
console.log('6a. schede compresse + modifica protetta ok')

await clickText('Condividi come immagine')
await wait(500)
console.log('6b. condivisione:', body().slice(0, 160))
if (!body().includes("Condividi l'allenamento")) throw new Error('foglio condivisione non aperto')
if (!body().includes('Con foto') || !body().includes('Solo dati'))
  throw new Error('stili di condivisione mancanti')
if (!buttons().some((b) => aria(b) === 'Scegli la foto di sfondo'))
  throw new Error('caricamento foto di sfondo mancante')
window.document.querySelector('[aria-label="Chiudi"]')?.click()
await wait(400)

// invio dell'allenamento a un altro utente
await clickText('Invia a un utente')
await wait(800)
if (!body().includes('Condividi con un utente')) throw new Error('foglio invio utenti non aperto')
if (!body().includes('Luca')) throw new Error('utenti non elencati')
await clickText('Luca')
await wait(900)
if (workoutSent.length !== 1 || workoutSent[0].toUid !== 'friend-1')
  throw new Error('allenamento non inviato all’utente')
if (workoutSent[0].workout?.entries?.[0]?.name !== 'Panca piana')
  throw new Error('payload dell’allenamento inviato errato')
console.log('6c. invio allenamento a un utente ok')

// duplicazione: nuova sessione di oggi con gli stessi esercizi
await clickText('Duplica')
await wait(1000)
if (!body().includes('Panca piana')) throw new Error('clone senza esercizi')
if (!body().includes('3 serie')) throw new Error('clone senza serie')
console.log('6d. duplicazione allenamento ok')

window.document.querySelector('[aria-label="Torna indietro"]')?.click()
await wait(700)
if (!body().includes('Ciao, Marco')) throw new Error('ritorno alla home dopo la condivisione fallito')

// posta in arrivo: importazione di un allenamento ricevuto
await wait(800)
if (!body().includes('Allenamenti condivisi')) throw new Error('scheda allenamenti condivisi mancante')
await clickText('Allenamenti condivisi')
await wait(900)
if (!body().includes('Scheda di Luca')) throw new Error('allenamento ricevuto non mostrato')
await clickText('Importa')
await wait(1400)
if (!body().includes('Scheda di Luca')) throw new Error('allenamento importato non aperto')
if (!body().includes('Panca piana')) throw new Error('esercizi importati mancanti')
console.log('6e. import allenamento ricevuto ok')

// riordino degli esercizi in modalità Modifica
await clickText('Modifica', { exact: true })
await wait(500)
const exerciseOrder = () =>
  [...window.document.querySelectorAll('button[aria-label^="Dettagli "]')].map((b) =>
    aria(b).replace('Dettagli ', ''),
  )
if (exerciseOrder()[0] !== 'Panca piana')
  throw new Error('ordine iniziale inatteso: ' + exerciseOrder().join(', '))

// trascinamento dalla maniglia (niente più frecce)
if (buttons().some((b) => aria(b).startsWith('Sposta giù ') || aria(b).startsWith('Sposta su ')))
  throw new Error('frecce di riordino ancora presenti')
const grip = window.document.querySelector('[aria-label="Trascina per riordinare Panca piana"]')
if (!grip) throw new Error('maniglia di trascinamento mancante')
const rowNodes = [...window.document.querySelectorAll('[data-workout-row]')]
if (rowNodes.length !== 2) throw new Error('righe esercizio inattese: ' + rowNodes.length)
// happy-dom non calcola il layout: diamo posizioni finte alle due righe
rowNodes.forEach((node, index) => {
  node.getBoundingClientRect = () => ({
    top: index * 100,
    bottom: index * 100 + 90,
    height: 90,
    left: 0,
    right: 300,
    width: 300,
    x: 0,
    y: index * 100,
    toJSON() {},
  })
})
const pointer = (type, clientY) => {
  const Ctor = window.PointerEvent || window.MouseEvent
  grip.dispatchEvent(
    new Ctor(type, { bubbles: true, cancelable: true, clientY, pointerId: 1 }),
  )
}
pointer('pointerdown', 60)
pointer('pointermove', 260)
pointer('pointerup', 260)
await wait(500)
if (exerciseOrder()[0] !== 'Rematore Kayak')
  throw new Error('riordino con trascinamento non applicato: ' + exerciseOrder().join(', '))
console.log('6f. riordino con trascinamento ok')

// esco senza salvare: l'allenamento importato resta com'era
window.document.querySelector('[aria-label="Torna indietro"]')?.click()
await wait(500)
await clickText('Esci senza salvare')
await wait(800)
if (!body().includes('Ciao, Marco')) throw new Error('ritorno alla home dopo l’import fallito')

// statistiche
await clickText('Statistiche')
await wait(800)
console.log('7. stats:', body().slice(0, 180))
if (!body().includes('I tuoi progressi')) throw new Error('statistiche non aperte')

// footer
if (!body().includes('CHECCO digital creaction 2026')) throw new Error('footer mancante')
console.log('8. footer ok')

// modale storia versioni
const appVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
await clickText('versione ' + appVersion)
await wait(500)
if (!body().includes('Novità di PalestraLogger')) throw new Error('modale versioni non aperta')
if (!body().includes('La storia delle novità')) throw new Error('versione attuale assente')
if (!body().includes('Si comincia')) throw new Error('storia versioni incompleta')
if (!body().includes('v1.0.0')) throw new Error('badge versione assente')
console.log('8b. modale versioni ok')
window.document.querySelector('[aria-label="Chiudi"]')?.click()
await wait(400)
if (body().includes('Novità di PalestraLogger')) throw new Error('modale versioni non chiusa')

// pagina Esercizi: miniature con segnaposto e immagine grande, nessuna modifica per i non admin
await clickText('Esercizi')
await wait(900)
console.log('9a. esercizi:', body().slice(0, 160))
if (!body().includes('disponibili')) throw new Error('pagina esercizi non aperta')
const placeholders = [...window.document.querySelectorAll('span[aria-hidden="true"]')].filter((el) =>
  String(el.className).includes('h-11 w-11'),
)
if (placeholders.length === 0) throw new Error('miniature segnaposto mancanti nella lista')
await clickText('Panca piana')
await wait(700)
if (!body().includes('Nessuna foto')) throw new Error('immagine grande con segnaposto mancante')
if (buttons().some((b) => aria(b).startsWith('Aggiungi foto')))
  throw new Error('utente normale può aggiungere foto')
if (buttons().some((b) => aria(b).startsWith('Rimuovi foto')))
  throw new Error('utente normale può rimuovere foto')
window.document.querySelector('[aria-label="Chiudi"]')?.click()
await wait(400)

// cardio: etichetta «minuti» e serie a tempo invece che a ripetizioni
await clickText('Tapis roulant')
await wait(700)
if (!body().includes('minuti')) throw new Error('etichetta «minuti» mancante nel dettaglio del cardio')
await clickText('Usa in allenamento')
await wait(800)
if (!window.document.querySelector('input[aria-label="minuti serie 1"]'))
  throw new Error('campo minuti mancante per un esercizio cardio')
if (window.document.querySelector('input[aria-label="peso serie 1"]'))
  throw new Error('peso mostrato per un esercizio cardio')
if (!body().includes('Minuti')) throw new Error('intestazione «Minuti» mancante nelle serie')
window.document.querySelector('[aria-label="Torna indietro"]')?.click()
await wait(600)
await clickText('Esci senza salvare')
await wait(800)
if (!body().includes('Ciao, Marco')) throw new Error('uscita dall’allenamento cardio fallita')
await clickText('Esercizi')
await wait(800)
if (!body().includes('disponibili')) throw new Error('ritorno alla libreria dopo il cardio fallito')
console.log('9b. cardio a minuti ok')

// libreria comune: l'esercizio condiviso da un altro utente è già disponibile
if (!body().includes('Rematore Kayak'))
  throw new Error('esercizio della libreria comune non mostrato')
if (!body().includes('condiviso')) throw new Error('etichetta «condiviso» mancante')
await clickText('Rematore Kayak')
await wait(500)
if (buttons().some((b) => aria(b).startsWith('Elimina')))
  throw new Error('utente normale può eliminare un esercizio della libreria comune')
window.document.querySelector('[aria-label="Chiudi"]')?.click()
await wait(300)
console.log('9b2. libreria comune ricevuta ok')

// ogni utente può creare un esercizio con la propria foto
await clickText('Nuovo')
await wait(500)
if (!buttons().some((b) => aria(b).startsWith('Aggiungi foto al nuovo esercizio')))
  throw new Error('foto mancante nella creazione esercizio')
const newNameInput = [...window.document.querySelectorAll('input')].find((i) =>
  String(i.getAttribute('placeholder') || '').includes('Chest press'),
)
setValue(newNameInput, 'Pressa sperimentale')
const newAliasInput = [...window.document.querySelectorAll('input')].find((i) =>
  String(i.getAttribute('placeholder') || '').includes('bench press, panca'),
)
if (!newAliasInput) throw new Error('campo alias mancante nella creazione')
setValue(newAliasInput, 'leg press experiment, pressa prova')
await wait(250)
await clickText('Crea esercizio')
await wait(800)
if (!body().includes('Pressa sperimentale')) throw new Error('esercizio personalizzato non creato')
if (!sharedLibrary.some((e) => e.name === 'Pressa sperimentale'))
  throw new Error('esercizio non pubblicato nella libreria comune')
if (!buttons().some((b) => aria(b).startsWith('Aggiungi foto a Pressa sperimentale')))
  throw new Error('l’autore non può aggiungere la foto del suo esercizio')
window.document.querySelector('[aria-label="Chiudi"]')?.click()
await wait(400)

// modifica dell’esercizio: la misura passa da ripetizioni a minuti e si pubblica
await clickText('Pressa sperimentale')
await wait(600)
await clickText('Modifica', { exact: true })
await wait(500)
await clickText('Minuti', { exact: true })
await wait(250)
await clickText('Salva modifiche')
await wait(900)
if (!body().includes('minuti')) throw new Error('modifica della misura a minuti non applicata')
const published = sharedLibrary.find((e) => e.name === 'Pressa sperimentale')
if (!published || published.tracking !== 'time')
  throw new Error('modifica non pubblicata nella libreria comune')
console.log('9c. modifica misura esercizio ok')

// ritiro dalla libreria comune: torna privato per l’autore
await clickText('Modifica', { exact: true })
await wait(500)
const shareToggle = window.document.querySelector('[aria-label="Disponibile a tutti"]')
if (!shareToggle) throw new Error('interruttore «Disponibile a tutti» mancante')
if (shareToggle.getAttribute('aria-checked') !== 'true')
  throw new Error('condivisione non attiva nella modifica')
shareToggle.click()
await wait(250)
await clickText('Salva modifiche')
await wait(900)
if (sharedLibrary.some((e) => e.name === 'Pressa sperimentale'))
  throw new Error('ritiro dalla libreria comune non riuscito')
window.document.querySelector('[aria-label="Chiudi"]')?.click()
await wait(400)
console.log('9d. ritiro condivisione ok')

// ricerca per alias: sia l'esercizio personale sia quelli pre-caricati
const searchInput = window.document.querySelector('input[inputmode="search"]')
if (!searchInput) throw new Error('campo di ricerca esercizi mancante')
setValue(searchInput, 'leg press experiment')
await wait(500)
if (!body().includes('Pressa sperimentale'))
  throw new Error('ricerca per alias dell’esercizio personale non funzionante')
setValue(searchInput, 'deadlift')
await wait(500)
if (!body().includes('Stacco da terra'))
  throw new Error('alias dei seed non trovato dalla ricerca')
setValue(searchInput, 'kayak row')
await wait(500)
if (!body().includes('Rematore Kayak'))
  throw new Error('alias di un esercizio condiviso non sincronizzato')
setValue(searchInput, '')
await wait(400)
console.log('9e. ricerca per alias ok')

// amici (API mockata; in LIVE richiederebbe account reali)
if (!LIVE) {
await clickText('Oggi')
await wait(400)
window.document.querySelector('[aria-label="Amici"]')?.click()
await wait(700)
await wait(900)
console.log('9. amici:', body().slice(0, 220))
if (!body().includes('QQQQ-WWWW-EEEE')) throw new Error('codice amico non mostrato')
if (!body().includes('Luca')) throw new Error('amico non mostrato')
if (!body().includes('Sara')) throw new Error('richiesta non mostrata')

await clickText('Accetta')
await wait(700)
if (body().includes('vuole diventare tuo amico')) throw new Error('richiesta non accettata')

await clickText('Luca')
await wait(800)
console.log('10. amico:', body().slice(0, 200))
if (!body().includes('Panca piana')) throw new Error('allenamento amico non mostrato')
if (!body().includes('Ottima sessione')) throw new Error('nota amico non mostrata')
if (!body().includes('CHECCO digital creaction 2026')) throw new Error('footer mancante nel dettaglio amico')

}

// offline: l'allenamento si salva sul telefono e sale al cloud appena torna la rete
if (!LIVE) {
  window.location.hash = '#/home'
  await wait(900)
  offline = true
  Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true })
  window.document.querySelector('[aria-label="Nuovo allenamento"]')?.click()
  await wait(700)
  await clickText('Aggiungi esercizio')
  await wait(600)
  setValue(window.document.querySelector('input[inputmode="search"]'), 'panca')
  await wait(600)
  await clickText('Panca piana')
  await wait(600)
  setValue(window.document.querySelector('input[aria-label="ripetizioni serie 1"]'), '5')
  setValue(window.document.querySelector('input[aria-label="peso serie 1"]'), '60')
  await wait(250)
  await clickText('Salva', { exact: true })
  await wait(800)
  if (!body().includes('Salvato sul telefono'))
    throw new Error('avviso di salvataggio offline mancante')
  if (!body().includes('Ciao, Marco') || !body().includes('300 kg'))
    throw new Error('allenamento offline non visibile in home: ' + body().slice(0, 300))
  console.log('10b. allenamento salvato offline ok')

  offline = false
  Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true })
  window.dispatchEvent(new window.Event('online'))
  await wait(2800)
  const offlinePush = lastPushPayload?.workouts?.find((w) =>
    (w.sets || []).some((s) => s.reps === 5 && s.weight === 60),
  )
  if (!offlinePush) throw new Error('allenamento offline non arrivato al cloud')
  console.log('10c. sincronizzazione al ritorno della rete ok')
}

// regressione: riavvio con sessione salvata (niente schermo nero)
window.location.hash = '#/home'
window.document.body.innerHTML = '<div id="root"></div>'
await import(pathToFileURL(bundlePath).href + '?reload=1')
await wait(1800)
console.log('8. riavvio con sessione:', body().slice(0, 140))
if (body().includes('Qualcosa è andato storto')) throw new Error('crash al riavvio')
if (!body().includes('Ciao, Marco')) throw new Error('sessione non ripristinata al riavvio')

// amministratore: gestione foto dalla pagina Esercizi
window.localStorage.setItem('palestralogger:account-token', 'token-admin-0123456789abcdef')
const cachedAccount = JSON.parse(window.localStorage.getItem('palestralogger:account-info') || '{}')
window.localStorage.setItem(
  'palestralogger:account-info',
  JSON.stringify({ ...cachedAccount, email: 'francescochecco@gmail.com', role: 'admin' }),
)
window.location.hash = '#/ex'
window.document.body.innerHTML = '<div id="root"></div>'
await import(pathToFileURL(bundlePath).href + '?reload=admin')
await wait(2200)
console.log('11. esercizi admin:', body().slice(0, 140))
await clickText('Panca piana')
await wait(700)
if (!body().includes('Nessuna foto')) throw new Error('immagine grande mancante per admin')
if (!buttons().some((b) => aria(b).startsWith('Aggiungi foto')))
  throw new Error('admin non può aggiungere foto')
window.document.querySelector('[aria-label="Chiudi"]')?.click()
await wait(300)
console.log('11a. admin può gestire le foto ok')
// anche l'amministratore gestisce la foto di un esercizio personalizzato
await clickText('Pressa sperimentale')
await wait(600)
if (!buttons().some((b) => aria(b).startsWith('Aggiungi foto a Pressa sperimentale')))
  throw new Error('admin non può gestire la foto di un esercizio personalizzato')
window.document.querySelector('[aria-label="Chiudi"]')?.click()
await wait(300)

// l'amministratore elimina dalla libreria comune un esercizio di un altro autore
await clickText('Rematore Kayak')
await wait(600)
if (!buttons().some((b) => aria(b) === 'Elimina Rematore Kayak'))
  throw new Error('admin non può eliminare un esercizio della libreria comune')
buttons().find((b) => aria(b) === 'Elimina Rematore Kayak').click()
await wait(400)
if (!body().includes('verrà eliminato dalla libreria comune'))
  throw new Error('conferma di eliminazione dalla libreria comune mancante')
await clickText('Elimina', { exact: true })
await wait(900)
if (body().includes('Rematore Kayak'))
  throw new Error('esercizio ancora visibile dopo l’eliminazione')
if (sharedLibrary.some((e) => e.id === 'shared-remote-1'))
  throw new Error('eliminazione non arrivata al server')
console.log('11b. admin elimina un esercizio della libreria comune ok')

// l'amministratore elimina anche un esercizio pre-caricato: sparisce per tutti
await clickText('Panca piana')
await wait(600)
if (!buttons().some((b) => aria(b) === 'Elimina Panca piana'))
  throw new Error('admin non può eliminare un esercizio pre-caricato')
buttons().find((b) => aria(b) === 'Elimina Panca piana').click()
await wait(400)
if (!body().includes('esercizio pre-caricato'))
  throw new Error('conferma di eliminazione del pre-caricato mancante')
await clickText('Elimina', { exact: true })
await wait(900)
if (body().includes('Panca piana'))
  throw new Error('pre-caricato ancora visibile dopo l’eliminazione')
if (!hiddenDefaults.includes('def-panca-piana'))
  throw new Error('pre-caricato non nascosto sul server')
console.log('11c. admin elimina un pre-caricato ok')

console.log('--- ERRORS ---')
console.log(errors.length ? errors.join('\n') : '(none)')
if (errors.length) process.exit(1)
console.log('BROWSER SMOKE OK')
process.exit(0)
