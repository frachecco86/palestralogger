// Genera le icone PNG dell'app senza dipendenze esterne (encoder PNG minimale + supersampling).
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = resolve(root, 'public/icons')
mkdirSync(outDir, { recursive: true })

const LIME = [200, 255, 61]
const CREAM = [242, 245, 239]
const BG = [10, 12, 9]

const crcTable = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function roundedRect(x, y, w, h, r) {
  return (px, py) => {
    if (px < x || px > x + w || py < y || py > y + h) return false
    const cx = Math.min(Math.max(px, x + r), x + w - r)
    const cy = Math.min(Math.max(py, y + r), y + h - r)
    const dx = px - cx
    const dy = py - cy
    return dx * dx + dy * dy <= r * r + 0.0001 || (px >= x + r && px <= x + w - r) || (py >= y + r && py <= y + h - r) || (px >= x + r && px <= x + w - r && py >= y + r && py <= y + h - r)
  }
}

function drawIcon(size, { maskable = false } = {}) {
  const SS = 4
  const S = size * SS
  const buf = Buffer.alloc(size * size * 4)
  const scale = maskable ? 0.68 : 0.82
  const m = (S * (1 - scale)) / 2

  // geometria del manubrio, espressa su base 512 poi scalata
  const u = (v) => m + (v / 512) * S * scale
  const shapes = []
  const add = (fn, color) => shapes.push({ fn, color })
  const rect = (x1, y1, x2, y2, r) => roundedRect(u(x1), u(y1), u(x2) - u(x1), u(y2) - u(y1), (r / 512) * S * scale)

  // barra
  add(rect(140, 243, 372, 269, 13), CREAM)
  // dischi esterni
  add(rect(96, 160, 142, 352, 16), LIME)
  add(rect(370, 160, 416, 352, 16), LIME)
  // dischi interni
  add(rect(142, 186, 186, 326, 14), LIME)
  add(rect(326, 186, 370, 326, 14), LIME)
  // tacca centrale luminosa
  add(rect(246, 243, 266, 269, 6), LIME)

  const bgRadius = maskable ? 0 : (size * 0.22) / 1
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x * SS + sx + 0.5
          const py = y * SS + sy + 0.5
          let col = null
          for (const s of shapes) {
            if (s.fn(px, py)) col = s.color
          }
          let alpha = 1
          if (!maskable) {
            // angoli trasparenti fuori dal quadrato arrotondato
            const rr = bgRadius * SS
            const cx = Math.min(Math.max(px, rr), S - rr)
            const cy = Math.min(Math.max(py, rr), S - rr)
            const inside = (px - cx) ** 2 + (py - cy) ** 2 <= rr * rr
            if (!inside) alpha = 0
          }
          if (alpha > 0) {
            const c = col ?? BG
            r += c[0]; g += c[1]; b += c[2]; a += 1
          }
        }
      }
      const i = (y * size + x) * 4
      if (a > 0) {
        buf[i] = Math.round(r / a)
        buf[i + 1] = Math.round(g / a)
        buf[i + 2] = Math.round(b / a)
        buf[i + 3] = Math.round((a / (SS * SS)) * 255)
      }
    }
  }
  return encodePng(size, size, buf)
}

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, {}],
]
for (const [name, size, opts] of targets) {
  writeFileSync(resolve(outDir, name), drawIcon(size, opts))
  console.log('icona:', name)
}
