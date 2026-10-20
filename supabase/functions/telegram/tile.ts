// Плитка дня: день учёта — квадрат из пятен. Пятно — заход по клиенту (записи учёта подряд),
// цвет — цвет клиента, площадь — минуты, порядок — с утра (слева сверху) к вечеру. Недобор
// до нормы рабочего дня остаётся пустым. Логика общая: её же берёт приложение
// (src/lib/dayTile.ts), здесь же — PNG для «Итогов дня» в Telegram. Без зависимостей.

export interface TileClient {
  /** id значения группы; у задач без клиента — 'none' */
  key: string
  name: string
  /** 'label-1'…'label-8'; null — нейтральный */
  color: string | null
}

export interface TileEntryInput {
  task_id: string
  entry_type: string
  started_at: string | null
  duration_seconds?: number | null
  duration_minutes?: number | null
}

export interface TileSeg {
  client: TileClient
  minutes: number
  /** начало, мс; у ручных правок нет */
  start: number | null
}

export interface DayTile {
  segs: TileSeg[]
  total: number
  /** норма дня в минутах; 0 — выходной или нормы нет: пустого остатка не будет */
  norm: number
  /** день ещё идёт: остаток до нормы — пунктиром */
  live?: boolean
}

export interface TileRect {
  x: number
  y: number
  w: number
  h: number
  /** null — пустой остаток до нормы */
  seg: TileSeg | null
}

/** паузы короче — тот же заход: учёт остановили на минуту и продолжили */
const MERGE_GAP_MS = 5 * 60_000

const minutesOf = (e: TileEntryInput) =>
  e.duration_seconds != null ? Number(e.duration_seconds) / 60 : Number(e.duration_minutes ?? 0)

/**
 * Записи дня → заходы. Учёт — по времени начала; подряд у одного клиента с паузой меньше
 * 5 минут — один заход. Ручные правки: прибавка — отдельным пятном в конце дня, вычет —
 * из последних заходов того же клиента. Идущий учёт — последним заходом до now.
 */
export function buildSegments(
  entries: TileEntryInput[],
  clientOf: (taskId: string) => TileClient,
  running?: { task_id: string; started_at: string; now: number } | null,
): TileSeg[] {
  const timed = entries
    .filter((e) => e.entry_type === 'timer' && e.started_at && minutesOf(e) > 0)
    .map((e) => ({ client: clientOf(e.task_id), start: Date.parse(e.started_at!), minutes: minutesOf(e) }))
  if (running) {
    const start = Date.parse(running.started_at)
    const minutes = (running.now - start) / 60_000
    if (minutes > 0) timed.push({ client: clientOf(running.task_id), start, minutes })
  }
  timed.sort((a, b) => a.start - b.start)

  const segs: TileSeg[] = []
  for (const t of timed) {
    const last = segs[segs.length - 1]
    if (last && last.client.key === t.client.key && last.start != null && t.start - (last.start + last.minutes * 60_000) < MERGE_GAP_MS) {
      last.minutes = (t.start + t.minutes * 60_000 - last.start) / 60_000
    } else segs.push({ ...t })
  }

  // правки — по клиенту: прибавка пятном в конце, вычет снимается с последних заходов
  const manual = new Map<string, { client: TileClient; minutes: number }>()
  for (const e of entries) {
    if (e.entry_type === 'timer') continue
    const client = clientOf(e.task_id)
    const m = manual.get(client.key) ?? { client, minutes: 0 }
    m.minutes += minutesOf(e)
    manual.set(client.key, m)
  }
  for (const { client, minutes } of manual.values()) {
    if (minutes > 0) segs.push({ client, minutes, start: null })
    else {
      let left = -minutes
      for (let i = segs.length - 1; i >= 0 && left > 0; i--) {
        if (segs[i].client.key !== client.key) continue
        const take = Math.min(left, segs[i].minutes)
        segs[i].minutes -= take
        left -= take
      }
    }
  }
  return segs.filter((s) => s.minutes >= 0.5)
}

export function makeTile(segs: TileSeg[], norm: number, live = false): DayTile {
  return { segs, total: segs.reduce((s, x) => s + x.minutes, 0), norm, live }
}

/**
 * Раскладка в квадрат 0…1: делим список пополам по минутам, режем вдоль длинной стороны —
 * порядок заходов сохраняется, крупный заход остаётся крупным пятном.
 */
export function layoutTile(tile: DayTile): TileRect[] {
  const items: { minutes: number; seg: TileSeg | null }[] = tile.segs.map((seg) => ({ minutes: seg.minutes, seg }))
  if (tile.norm > tile.total) items.push({ minutes: tile.norm - tile.total, seg: null })
  const out: TileRect[] = []
  if (!items.length) return out
  const split = (list: typeof items, x: number, y: number, w: number, h: number) => {
    if (list.length === 1) {
      out.push({ x, y, w, h, seg: list[0].seg })
      return
    }
    const total = list.reduce((s, i) => s + i.minutes, 0)
    let best = 1
    let bestD = Infinity
    let acc = 0
    for (let k = 1; k < list.length; k++) {
      acc += list[k - 1].minutes
      const d = Math.abs(acc - total / 2)
      if (d < bestD) {
        bestD = d
        best = k
      }
    }
    const a = list.slice(0, best)
    const b = list.slice(best)
    const f = a.reduce((s, i) => s + i.minutes, 0) / total
    if (w >= h) {
      split(a, x, y, w * f, h)
      split(b, x + w * f, y, w * (1 - f), h)
    } else {
      split(a, x, y, w, h * f)
      split(b, x, y + h * f, w, h * (1 - f))
    }
  }
  split(items, 0, 0, 1, 1)
  return out
}

export interface TileRhythm {
  name: 'Длинные заходы' | 'Ровный день' | 'Рваный день'
  longest: TileSeg
}

/** Ритм дня по средней длине захода; null — учёта не было. */
export function tileRhythm(tile: DayTile): TileRhythm | null {
  const timed = tile.segs.filter((s) => s.start != null)
  const list = timed.length ? timed : tile.segs
  if (!list.length) return null
  const longest = list.reduce((a, s) => (s.minutes > a.minutes ? s : a), list[0])
  const avg = list.reduce((s, x) => s + x.minutes, 0) / list.length
  const name = avg >= 85 ? 'Длинные заходы' : avg <= 38 && list.length >= 5 ? 'Рваный день' : 'Ровный день'
  return { name, longest }
}

/** часы по клиентам, больше — выше */
export function tileClients(tile: DayTile): { client: TileClient; minutes: number }[] {
  const map = new Map<string, { client: TileClient; minutes: number }>()
  for (const s of tile.segs) {
    const m = map.get(s.client.key) ?? { client: s.client, minutes: 0 }
    m.minutes += s.minutes
    map.set(s.client.key, m)
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes)
}

/* ── PNG для Telegram ──────────────────────────────────────────────────── */

/** светлая палитра дизайн-системы: в чат картинка уходит одна на любую тему */
export const PNG_PALETTE: Record<string, string> = {
  bg: '#F7F6F2',
  sunken: '#F0EEE8',
  ring: '#FFFFFF',
  dashed: '#D6D2C8',
  'label-1': '#B4532A',
  'label-2': '#4A72C9',
  'label-3': '#7A5AF0',
  'label-4': '#C2538A',
  'label-5': '#C27C18',
  'label-6': '#2E9B5E',
  'label-7': '#6E8B3D',
  'label-8': '#6B6860',
}

const hex = (c: string): [number, number, number] => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
]

/** расстояние до скруглённого прямоугольника: <0 — внутри */
function sdRoundRect(px: number, py: number, x: number, y: number, w: number, h: number, r: number) {
  const cx = x + w / 2
  const cy = y + h / 2
  const qx = Math.abs(px - cx) - (w / 2 - r)
  const qy = Math.abs(py - cy) - (h / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/** Растр плитки: size×size, RGB. Сглаживание — по расстоянию до края. */
export function rasterTile(tile: DayTile, size = 640): Uint8Array {
  const px = new Uint8Array(size * size * 3)
  const paint = (x: number, y: number, rgb: [number, number, number], a: number) => {
    if (a <= 0) return
    const i = (y * size + x) * 3
    const k = Math.min(1, a)
    px[i] += (rgb[0] - px[i]) * k
    px[i + 1] += (rgb[1] - px[i + 1]) * k
    px[i + 2] += (rgb[2] - px[i + 2]) * k
  }
  const bg = hex(PNG_PALETTE.bg)
  for (let i = 0; i < size * size; i++) px.set(bg, i * 3)

  const pad = Math.round(size * 0.06)
  const s = size - pad * 2
  const radius = s * 0.06
  const fillShape = (x: number, y: number, w: number, h: number, r: number, rgb: [number, number, number], alpha = 1, stroke = 0) => {
    const x0 = Math.max(0, Math.floor(x - 1))
    const y0 = Math.max(0, Math.floor(y - 1))
    const x1 = Math.min(size - 1, Math.ceil(x + w + 1))
    const y1 = Math.min(size - 1, Math.ceil(y + h + 1))
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const d = sdRoundRect(xx + 0.5, yy + 0.5, x, y, w, h, r)
        const cov = stroke ? stroke / 2 + 0.5 - Math.abs(d) : 0.5 - d
        paint(xx, yy, rgb, Math.max(0, Math.min(1, cov)) * alpha)
      }
  }
  fillShape(pad, pad, s, s, radius, hex(PNG_PALETTE.sunken))
  const gap = s * 0.022
  for (const r of layoutTile(tile)) {
    const x = pad + r.x * s + gap / 2
    const y = pad + r.y * s + gap / 2
    const w = r.w * s - gap
    const h = r.h * s - gap
    if (w <= 0.5 || h <= 0.5) continue
    if (!r.seg) {
      if (tile.live) fillShape(x, y, w, h, s * 0.03, hex(PNG_PALETTE.dashed), 1, 1.5)
      continue
    }
    fillShape(x, y, w, h, Math.min(s * 0.03, w / 2, h / 2), hex(PNG_PALETTE[r.seg.client.color ?? 'label-8'] ?? PNG_PALETTE['label-8']))
    // длинный заход: по кольцу на каждый полный час, как годовые кольца
    const hours = r.seg.minutes >= 90 ? Math.floor(r.seg.minutes / 60) : 0
    for (let i = 1; i <= hours; i++) {
      const k = i / (hours + 1)
      fillShape(x + (w * k) / 2, y + (h * k) / 2, w * (1 - k), h * (1 - k), s * 0.02, hex(PNG_PALETTE.ring), 0.28, Math.max(1.5, s * 0.006))
    }
  }
  return px
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

async function zlib(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  // 'deflate' в CompressionStream — это zlib-обёртка, ровно то, что ждёт PNG
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('deflate'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** PNG плитки: RGB 8 бит, без фильтров строк */
export async function tilePng(tile: DayTile, size = 640): Promise<Uint8Array<ArrayBuffer>> {
  const rgb = rasterTile(tile, size)
  const raw = new Uint8Array(size * (size * 3 + 1))
  for (let y = 0; y < size; y++) raw.set(rgb.subarray(y * size * 3, (y + 1) * size * 3), y * (size * 3 + 1) + 1)
  const ihdr = new Uint8Array(13)
  const v = new DataView(ihdr.buffer)
  v.setUint32(0, size)
  v.setUint32(4, size)
  ihdr[8] = 8 // бит на канал
  ihdr[9] = 2 // RGB
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', await zlib(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}
