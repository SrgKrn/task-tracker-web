import { describe, expect, it } from 'vitest'
import { bridgePath, span } from './liquid'

const nums = (d: string) => [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))

describe('перешеек плашки и «+» (0.60)', () => {
  const stop = { x: 0, y: 0, r: 22 }
  const fab = { x: 0, y: 69, r: 32 }

  it('стоп-кнопка ровно над «+» — перешеек симметричен', () => {
    const d = bridgePath(stop, fab)!
    expect(d).toMatch(/^M.*C.*L.*C.*Z$/)
    const n = nums(d)
    // p1 и p2 (начало и конец) — зеркальны по x и на одной высоте
    expect(n[0]).toBeCloseTo(-n[n.length - 2], 1)
    expect(n[1]).toBeCloseTo(n[n.length - 1], 1)
  })

  it('концы перешейка лежат на окружностях — стыка нет', () => {
    const n = nums(bridgePath(stop, fab)!)
    const [x1, y1] = [n[0], n[1]]
    const [x3, y3] = [n[6], n[7]]
    expect(Math.hypot(x1 - stop.x, y1 - stop.y)).toBeCloseTo(stop.r, 1)
    expect(Math.hypot(x3 - fab.x, y3 - fab.y)).toBeCloseTo(fab.r, 1)
  })

  it('капля внутри «+» или слишком далеко — перешейка нет', () => {
    expect(bridgePath({ x: 0, y: 60, r: 8 }, fab)).toBeNull()
    expect(bridgePath({ x: 0, y: -200, r: 22 }, fab)).toBeNull()
  })

  it('span обрезает шкалу', () => {
    expect(span(0.1, 0.2, 0.4)).toBe(0)
    expect(span(0.3, 0.2, 0.4)).toBeCloseTo(0.5)
    expect(span(0.9, 0.2, 0.4)).toBe(1)
  })
})
