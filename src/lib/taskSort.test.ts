import { describe, expect, it } from 'vitest'
import { sortHeads } from './taskSort'
import type { Task } from './types'

const task = (id: string, name: string, fact: number, end: string | null = null) =>
  ({ id, name, fact_hours: fact, end_date: end, sort_order: 0 }) as unknown as Task

describe('порядок по заголовку таблицы (0.62)', () => {
  const list = [task('a', 'Спринт 10', 2), task('b', 'аудит', 5, '2026-11-10'), task('c', 'Спринт 9', 5, '2026-11-08')]

  it('по названию — по алфавиту без учёта регистра, числа по значению', () => {
    expect(sortHeads(list, 'name', 'none', '2026-11-07').map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('по часам — больше вверху, при равенстве по сроку', () => {
    expect(sortHeads(list, 'hours', 'none', '2026-11-07').map((t) => t.id)).toEqual(['c', 'b', 'a'])
  })

  it('по часам — с подзадачами, если их факт передали', () => {
    const withChildren = (t: Task) => t.fact_hours + (t.id === 'a' ? 10 : 0)
    expect(sortHeads(list, 'hours', 'none', '2026-11-07', withChildren)[0].id).toBe('a')
  })
})
