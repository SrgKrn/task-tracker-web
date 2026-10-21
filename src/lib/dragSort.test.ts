import { describe, expect, it } from 'vitest'
import { reorderPatch, targetIndex } from './dragSort'

const items = (...orders: number[]) => orders.map((o, i) => ({ id: `t${i}`, sort_order: o }))

describe('куда встанет строка', () => {
  const mids = [20, 60, 100, 140]
  it('остаётся, пока не перешла середину соседки', () => {
    expect(targetIndex(mids, 1, 75)).toBe(1)
    expect(targetIndex(mids, 1, 45)).toBe(1)
  })
  it('вниз и вверх через несколько строк', () => {
    expect(targetIndex(mids, 0, 105)).toBe(2)
    expect(targetIndex(mids, 3, 10)).toBe(0)
  })
})

describe('что записать в базу', () => {
  it('между соседями — среднее, одна строка', () => {
    expect(reorderPatch(items(1, 2, 3, 4), 0, 2)).toEqual([{ id: 't0', sort_order: 3.5 }])
    expect(reorderPatch(items(1, 2, 3, 4), 3, 1)).toEqual([{ id: 't3', sort_order: 1.5 }])
  })
  it('в начало и в конец — на единицу за краем', () => {
    expect(reorderPatch(items(1, 2, 3), 2, 0)).toEqual([{ id: 't2', sort_order: 0 }])
    expect(reorderPatch(items(1, 2, 3), 0, 2)).toEqual([{ id: 't0', sort_order: 4 }])
  })
  it('на то же место — ничего', () => {
    expect(reorderPatch(items(1, 2, 3), 1, 1)).toEqual([])
  })
  it('одинаковые места — перенумеровать всё', () => {
    expect(reorderPatch(items(5, 5, 5), 2, 1)).toEqual([
      { id: 't0', sort_order: 1 },
      { id: 't2', sort_order: 2 },
      { id: 't1', sort_order: 3 },
    ])
  })
})
