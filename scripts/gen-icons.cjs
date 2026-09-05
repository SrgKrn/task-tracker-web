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
 * Знак Semternity: незамкнутое кольцо с одной точкой в разрыве.
 *
 * Раньше кольцо было сплошным, а точка сидела на ободе и сливалась с ним в нашлёпку —
 * читалось как дефект, а не как знак. Теперь в кольце настоящий разрыв, точка стоит
 * в нём отдельно: то же «подвижное подобие вечности», но видно замысел.
 *
 * `scale` сжимает знак к центру для maskable-версии: Android обрезает иконку по
 * своей маске, и полнокадровый знак терял края.
 */
function hitsMark(x, y, size, scale) {
  const cx = size / 2
  const cy = size / 2
  const r = size * 0.28 * scale
  const sw = size * 0.068 * scale
  const dotR = size * 0.056 * scale
  const innerR = r * 0.46
  const innerSw = size * 0.024 * scale

  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)

  // внешнее кольцо с разрывом сверху: угол считаем от «12 часов» по часовой стрелке
  if (Math.abs(dist - r) <= sw / 2) {
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI // 0 сверху, +90 справа
    const GAP = 30 // половина разрыва в градусах
    if (Math.abs(deg) > GAP) return true
  }

  // внутреннее кольцо — тонкий отголосок внешнего
  if (Math.abs(dist - innerR) <= innerSw / 2) return true

  // точка в разрыве, ровно на окружности обода
  if (Math.hypot(dx, dy + r) <= dotR) return true

  return false
}

function renderIcon(size, { scale = 1 } = {}) {
  const SS = 4 // supersample factor for antialiasing
  const rgb = Buffer.alloc(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (hitsMark(px, py, size, scale)) hits++
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

// PNG-фавиконки нужны отдельно от SVG: ярлык на рабочем столе Windows и часть
// браузеров SVG-фавиконку не растеризуют и подставляют свою заглушку.
fs.writeFileSync(path.join(outDir, 'favicon-32.png'), renderIcon(32))
fs.writeFileSync(path.join(outDir, 'favicon-48.png'), renderIcon(48))
fs.writeFileSync(path.join(outDir, 'icon-192.png'), renderIcon(192))
fs.writeFileSync(path.join(outDir, 'icon-512.png'), renderIcon(512))
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), renderIcon(180))
// maskable: знак ужат до 72% кадра, чтобы пережить круглую/скруглённую маску Android
fs.writeFileSync(path.join(outDir, 'icon-maskable-512.png'), renderIcon(512, { scale: 0.72 }))

console.log('Semternity mark icons written to public/')
