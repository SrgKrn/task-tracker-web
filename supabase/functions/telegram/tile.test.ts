import { describe, expect, it } from 'vitest'
import { buildSegments, layoutTile, makeTile, tileClients, tilePng, tileRhythm, type TileClient } from './tile.ts'

const A: TileClient = { key: 'a', name: 'Олари', color: 'label-1' }
const B: TileClient = { key: 'b', name: 'World Class', color: 'label-2' }
const clientOf = (taskId: string) => (taskId.startsWith('a') ? A : B)
const at = (hhmm: string) => `2026-10-20T${hhmm}:00Z`
const timer = (task_id: string, start: string, minutes: number) => ({
  task_id,
  entry_type: 'timer',
  started_at: at(start),
  duration_seconds: minutes * 60,
})

describe('buildSegments', () => {
  it('идёт по времени и склеивает короткие паузы у одного клиента', () => {
    const segs = buildSegments(
      [timer('b1', '11:30', 60), timer('a1', '09:00', 50), timer('a2', '09:52', 30), timer('a1', '13:00', 20)],
      clientOf,
    )
    expect(segs.map((s) => [s.client.key, Math.round(s.minutes)])).toEqual([
      ['a', 82],
      ['b', 60],
      ['a', 20],
    ])
  })

  it('прибавка — пятном в конце, вычет — с последнего захода клиента', () => {
    const segs = buildSegments(
      [
        timer('a1', '09:00', 60),
        timer('b1', '10:30', 60),
        { task_id: 'a1', entry_type: 'manual_adjustment', started_at: null, duration_seconds: -1200 },
        { task_id: 'b1', entry_type: 'manual_adjustment', started_at: null, duration_seconds: 900 },
      ],
      clientOf,
    )
    expect(segs.map((s) => [s.client.key, Math.round(s.minutes), s.start == null])).toEqual([
      ['a', 40, false],
      ['b', 60, false],
      ['b', 15, true],
    ])
  })

  it('идущий учёт — последним заходом', () => {
    const now = Date.parse(at('15:00'))
    const segs = buildSegments([timer('a1', '09:00', 60)], clientOf, { task_id: 'b1', started_at: at('14:00'), now })
    expect(segs.at(-1)).toMatchObject({ client: B, minutes: 60 })
  })
})

describe('layoutTile', () => {
  it('площади пропорциональны минутам, остаток до нормы пустой', () => {
    const tile = makeTile(
      buildSegments([timer('a1', '09:00', 120), timer('b1', '12:00', 90)], clientOf),
      420,
    )
    const rects = layoutTile(tile)
    const area = (r: { w: number; h: number }) => r.w * r.h
    expect(rects.reduce((s, r) => s + area(r), 0)).toBeCloseTo(1)
    expect(area(rects[0])).toBeCloseTo(120 / 420)
    expect(rects.at(-1)!.seg).toBeNull()
    expect(area(rects.at(-1)!)).toBeCloseTo(210 / 420)
  })

  it('без нормы и без учёта — пусто', () => {
    expect(layoutTile(makeTile([], 0))).toEqual([])
  })
})

describe('ритм и клиенты', () => {
  it('рваный день — много коротких заходов', () => {
    const entries = Array.from({ length: 8 }, (_, i) => timer(i % 2 ? 'a' : 'b', `${String(9 + i).padStart(2, '0')}:00`, 25))
    expect(tileRhythm(makeTile(buildSegments(entries, clientOf), 420))?.name).toBe('Рваный день')
  })

  it('длинные заходы и самый длинный', () => {
    const tile = makeTile(buildSegments([timer('a1', '09:00', 150), timer('b1', '12:00', 100)], clientOf), 420)
    const r = tileRhythm(tile)!
    expect(r.name).toBe('Длинные заходы')
    expect(r.longest.client).toBe(A)
    expect(tileClients(tile).map((c) => c.client.key)).toEqual(['a', 'b'])
  })
})

describe('tilePng', () => {
  it('собирает корректный PNG', async () => {
    const png = await tilePng(makeTile(buildSegments([timer('a1', '09:00', 150), timer('b1', '12:00', 100)], clientOf), 420), 64)
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(String.fromCharCode(...png.slice(12, 16))).toBe('IHDR')
  })
})
