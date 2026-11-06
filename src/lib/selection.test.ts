import { describe, expect, it } from 'vitest'
import { rangeIds, selectAllStep, stepCursor, toggleId } from './selection'

const order = ['a', 'b', 'c', 'd', 'e']

describe('выделение строк (0.63)', () => {
  it('диапазон — в обе стороны, без якоря — одна строка', () => {
    expect(rangeIds(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeIds(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(rangeIds(order, null, 'c')).toEqual(['c'])
    expect(rangeIds(order, 'x', 'c')).toEqual(['c'])
    expect(rangeIds(order, 'a', 'x')).toEqual([])
  })

  it('курсор стоит у краёв, без курсора — с края', () => {
    expect(stepCursor(order, 'c', 1)).toBe('d')
    expect(stepCursor(order, 'e', 1)).toBe('e')
    expect(stepCursor(order, 'a', -1)).toBe('a')
    expect(stepCursor(order, null, 1)).toBe('a')
    expect(stepCursor(order, null, -1)).toBe('e')
    expect(stepCursor([], 'a', 1)).toBeNull()
  })

  it('переключение строки', () => {
    expect([...toggleId(new Set(['a']), 'b')]).toEqual(['a', 'b'])
    expect([...toggleId(new Set(['a', 'b']), 'a')]).toEqual(['b'])
  })

  it('Ctrl+A: секция, потом весь список', () => {
    const sections = [['a', 'b'], ['c', 'd', 'e']]
    expect([...selectAllStep(sections, 'd', new Set())]).toEqual(['c', 'd', 'e'])
    expect([...selectAllStep(sections, 'd', new Set(['c', 'd', 'e']))]).toEqual(order)
    expect([...selectAllStep(sections, null, new Set())]).toEqual(['a', 'b'])
  })
})
