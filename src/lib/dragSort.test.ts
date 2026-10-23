import { describe, expect, it } from 'vitest'
import { freezeAndMove, freezeOrder, reorderPatch, targetIndex } from './dragSort'

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

describe('переход на свой порядок перетаскиванием', () => {
  const ids = (...names: string[]) => names.map((id) => ({ id }))
  const apply = (patch: { id: string; sort_order: number }[]) =>
    [...patch].sort((a, b) => a.sort_order - b.sort_order).map((p) => p.id)

  it('порядок экрана становится своим: места 1, 2, 3… у головных и в каждом составе', () => {
    const order = freezeOrder(ids('a', 'b', 'c'), [ids('a1', 'a2'), ids('c1')])
    expect([...order]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['a1', 1],
      ['a2', 2],
      ['c1', 1],
    ])
  })

  it('после заморозки двигается одна задача, остальные на своих местах', () => {
    const order = freezeOrder(ids('a', 'b', 'c', 'd'), [])
    const patch = freezeAndMove(order, ids('a', 'b', 'c', 'd'), 3, 1)
    expect(apply(patch)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('видна только часть списка (фильтр, «Без готовых») — скрытые не прыгают', () => {
    // b — готовая и скрыта; тянем d между a и c
    const order = freezeOrder(ids('a', 'b', 'c', 'd'), [])
    const patch = freezeAndMove(order, ids('a', 'c', 'd'), 2, 1)
    expect(apply(patch)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('подзадачи переставляются внутри своего состава, головные не трогаются', () => {
    const order = freezeOrder(ids('a', 'b'), [ids('a1', 'a2', 'a3')])
    const patch = freezeAndMove(order, ids('a1', 'a2', 'a3'), 0, 2)
    const map = new Map(patch.map((p) => [p.id, p.sort_order]))
    expect(map.get('a')).toBe(1)
    expect(map.get('b')).toBe(2)
    expect(['a1', 'a2', 'a3'].sort((x, y) => map.get(x)! - map.get(y)!)).toEqual(['a2', 'a3', 'a1'])
  })
})
