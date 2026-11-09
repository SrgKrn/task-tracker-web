import { describe, expect, it } from 'vitest'
import { calendarWeeks, moveDueFields } from './taskView'
import { orderFolders } from './taskFolders'

describe('календарь задач (0.64)', () => {
  it('ноябрь 2026: с понедельника 26 октября по воскресенье 6 декабря', () => {
    const weeks = calendarWeeks(2026, 10)
    expect(weeks).toHaveLength(6)
    expect(weeks[0][0]).toBe('2026-10-26')
    expect(weeks[0][6]).toBe('2026-11-01')
    expect(weeks[5][6]).toBe('2026-12-06')
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('февраль 2027 с понедельника — ровно четыре недели', () => {
    const weeks = calendarWeeks(2027, 1)
    expect(weeks).toHaveLength(4)
    expect(weeks[0][0]).toBe('2027-02-01')
    expect(weeks[3][6]).toBe('2027-02-28')
  })

  it('перенос срока раньше начала подтягивает начало', () => {
    expect(moveDueFields({ start_date: '2026-11-10' }, '2026-11-05')).toEqual({ end_date: '2026-11-05', start_date: '2026-11-05' })
    expect(moveDueFields({ start_date: '2026-11-01' }, '2026-11-05')).toEqual({ end_date: '2026-11-05' })
    expect(moveDueFields({ start_date: '2026-11-01' }, null)).toEqual({ end_date: null })
  })
})

describe('порядок папок (0.64)', () => {
  const f = (key: string) => ({ key })
  it('свой порядок первым, новые — следом в исходном порядке', () => {
    expect(orderFolders([f('a'), f('b'), f('c'), f('d')], ['c', 'x', 'a']).map((x) => x.key)).toEqual(['c', 'a', 'b', 'd'])
    expect(orderFolders([f('a'), f('b')], []).map((x) => x.key)).toEqual(['a', 'b'])
  })
})
