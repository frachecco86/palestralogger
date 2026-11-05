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

globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url
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
    const account = {
      id: 'acct-1',
      uid: 'acct-1',
      email: body.email || 'marco@example.com',
      name: body.name || 'Marco',
      createdAt: '2026-10-26T10:00:00.000Z',
    }
    if (body.action === 'register' || body.action === 'login') {
      return json({ token: 'token-di-prova-0123456789abcdef', account, recoveryCode: 'AAAA-BBBB-CCCC-DDDD', revision: 0 })
    }
    if (body.action === 'session') return json({ account, revision: 0 })
    if (body.action === 'pull') return json({ revision: 0, payload: null })
    if (body.action === 'push') return json({ revision: 1, updatedAt: now })
    if (body.action === 'claimSyncCode') return json({ error: 'no_data' }, 404)
    if (body.action === 'delete') return json({ ok: true })
    return json({ ok: true })
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
setValue(inputs[0], 'marco@example.com')
setValue(inputs[1], 'Marco')
setValue(inputs[2], 'password123')
setValue(inputs[3], 'password123')
// il submit è l'ultimo bottone "Crea account" (il primo è la tab)
const submit = [...window.document.querySelectorAll('button')]
  .filter((b) => (b.textContent || '').replace(/\s+/g, ' ').trim() === 'Crea account')
  .pop()
if (!submit) throw new Error('bottone crea account non trovato')
submit.click()
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
const notes = window.document.querySelector('textarea')
setValue(notes, 'Nota di prova')
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

if (!buttons().some((b) => aria(b).startsWith('Aggiungi foto')))
  throw new Error('tasto foto mancante in modalità modifica')

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
if (!buttonWithText('Aggiungi esercizio'))
  throw new Error('«Aggiungi esercizio» non attivo in modalità modifica')
if (!buttons().some((b) => aria(b).startsWith('Aggiungi foto')))
  throw new Error('foto non attivabile in modalità modifica')
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
if (!body().includes('Completo') || !body().includes('Essenziale') || !body().includes('Sticker'))
  throw new Error('stili di condivisione mancanti')
window.document.querySelector('[aria-label="Chiudi"]')?.click()
await wait(400)
window.document.querySelector('[aria-label="Torna indietro"]')?.click()
await wait(600)
if (!body().includes('Ciao, Marco')) throw new Error('ritorno alla home dopo la condivisione fallito')

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
// regressione: riavvio con sessione salvata (niente schermo nero)
window.location.hash = '#/home'
window.document.body.innerHTML = '<div id="root"></div>'
await import(pathToFileURL(bundlePath).href + '?reload=1')
await wait(1800)
console.log('8. riavvio con sessione:', body().slice(0, 140))
if (body().includes('Qualcosa è andato storto')) throw new Error('crash al riavvio')
if (!body().includes('Ciao, Marco')) throw new Error('sessione non ripristinata al riavvio')

console.log('--- ERRORS ---')
console.log(errors.length ? errors.join('\n') : '(none)')
if (errors.length) process.exit(1)
console.log('BROWSER SMOKE OK')
process.exit(0)
