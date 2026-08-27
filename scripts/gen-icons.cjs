// PWA icon generator: brass Semternity mark (ring + dot) on graphite, full-bleed square
// (iOS applies its own corner rounding/mask, so no rounding is baked in here).
// Rendered by supersampled distance-field hit-testing + box-downsample antialiasing,
// so no canvas/browser/native deps are needed — just zlib for PNG compression.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

function encodePng(size, rgbBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  const rowLen = size * 3 + 1
  const raw = Buffer.alloc(rowLen * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * rowLen
    raw[rowStart] = 0 // filter: none
    rgbBuffer.copy(raw, rowStart + 1, y * size * 3, (y + 1) * size * 3)
  }
  const idatData = zlib.deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idatData), chunk('IEND', Buffer.alloc(0))])
}

const BG = [21, 21, 26] // #15151a graphite
const BRASS = [232, 163, 61] // #e8a33d

/**
 * Знак Semternity: кольцо с одной точкой сверху («подвижное подобие вечности»)
 * плюс внутреннее кольцо. Никаких стрелок часов.
 */
function hitsMark(x, y, size) {
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.28
  const sw = size * 0.062
  const dotR = size * 0.062
  const innerR = r * 0.5
  const innerSw = size * 0.022

  const distFromCenter = Math.hypot(x - cx, y - cy)

  // внешнее кольцо
  if (Math.abs(distFromCenter - r) <= sw / 2) return true
  // внутреннее кольцо
  if (Math.abs(distFromCenter - innerR) <= innerSw / 2) return true
  // точка сверху по центру, сидит на ободе
  if (Math.hypot(x - cx, y - (cy - r)) <= dotR) return true

  return false
}

function renderIcon(size) {
  const SS = 4 // supersample factor for antialiasing
  const rgb = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (hitsMark(px, py, size)) hits++
        }
      }
      const alpha = hits / (SS * SS)
      const idx = (y * size + x) * 3
      for (let c = 0; c < 3; c++) {
        rgb[idx + c] = Math.round(BG[c] + (BRASS[c] - BG[c]) * alpha)
      }
    }
  }
  return encodePng(size, rgb)
}

const outDir = path.join(__dirname, '..', 'public')

fs.writeFileSync(path.join(outDir, 'icon-192.png'), renderIcon(192))
fs.writeFileSync(path.join(outDir, 'icon-512.png'), renderIcon(512))
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), renderIcon(180))

console.log('Semternity mark icons written to public/')
