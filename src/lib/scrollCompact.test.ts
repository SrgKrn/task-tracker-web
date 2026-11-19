import { describe, expect, it } from 'vitest'
import { COMPACT_DOWN, COMPACT_FROM, COMPACT_UP, nextCompact, type CompactState } from './scrollCompact'

const run = (ys: number[], start: CompactState = { compact: false, anchor: 0 }) => ys.reduce(nextCompact, start)

describe('nextCompact', () => {
  it('у верха экрана панель полная, сколько бы ни листали', () => {
    expect(run([10, 40, COMPACT_FROM]).compact).toBe(false)
  })

  it('сжимается, когда пролистали вниз достаточно', () => {
    // хук берёт за точку отсчёта положение при первом событии прокрутки
    const start = { compact: false, anchor: COMPACT_FROM + 10 }
    expect(run([start.anchor + COMPACT_DOWN - 1], start).compact).toBe(false)
    expect(run([start.anchor + COMPACT_DOWN], start).compact).toBe(true)
  })

  it('мелкое дрожание вверх-вниз панель не дёргает', () => {
    const s = run([300, 400])
    expect(s.compact).toBe(true)
    expect(run([400 - COMPACT_UP + 1, 400, 400 - 5], s).compact).toBe(true)
  })

  it('разворачивается, когда пролистали вверх', () => {
    const s = run([300, 400])
    expect(run([400 - COMPACT_UP], s).compact).toBe(false)
  })

  it('после разворота путь вниз считается заново', () => {
    const s = run([300, 400, 380])
    expect(s.compact).toBe(false)
    expect(run([380 + COMPACT_DOWN - 1], s).compact).toBe(false)
    expect(run([380 + COMPACT_DOWN], s).compact).toBe(true)
  })

  it('возврат к началу разворачивает сразу', () => {
    const s = run([300, 600])
    expect(run([COMPACT_FROM], s).compact).toBe(false)
  })
})
