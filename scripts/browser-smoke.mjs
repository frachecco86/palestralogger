import { Window } from 'happy-dom'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  if (url.includes('api/sync')) return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  return realFetch(input, init)
}
window.fetch = globalThis.fetch
const asset = bundlePath.split('/').pop()
const errors = []
window.addEventListener('error', (e) => errors.push('window.error: ' + (e.message || e.error)))
process.on('unhandledRejection', (e) => errors.push('unhandled: ' + (e && e.message ? e.message : String(e))))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const body = () => window.document.body.textContent.replace(/\s+/g, ' ').trim()

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
await wait(1200)

console.log('1. avvio:', body().slice(0, 60))

const inputs = [...window.document.querySelectorAll('input')]
setValue(inputs[0], 'Marco')
setValue(inputs[1], '1234')
setValue(inputs[2], '1234')
await clickText('Crea profilo')
await wait(1600)

console.log('2. home:', body().slice(0, 120))
if (!body().includes('Ciao, Marco')) throw new Error('login/creazione profilo fallita')

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

console.log('5. serie:', window.document.querySelectorAll('input[aria-label^="ripetizioni"]').length)
await clickText('Salva', { exact: true })
await wait(1600)

console.log('6. dopo salvataggio:', body().slice(0, 500))
if (!body().includes('Nota di prova')) throw new Error('note non mostrate in home')
if (!body().includes('800 kg')) throw new Error('volume non mostrato in home')

// statistiche
await clickText('Statistiche')
await wait(800)
console.log('7. stats:', body().slice(0, 180))
if (!body().includes('I tuoi progressi')) throw new Error('statistiche non aperte')

console.log('--- ERRORS ---')
console.log(errors.length ? errors.join('\n') : '(none)')
if (errors.length) process.exit(1)
console.log('BROWSER SMOKE OK')
process.exit(0)
