import { describe, expect, it } from 'vitest'
import {
  abcLabel,
  compareAbc,
  comparePriority,
  effortOf,
  frogOf,
  isAutoUrgent,
  layoutDay,
  nextAbcRank,
  quadrantOf,
  suggestEffort,
} from './priority'
import type { Task } from './types'

const TODAY = '2026-10-19'

function task(fields: Partial<Task> & { id: string }): Task {
  return {
    user_id: 'u',
    name: fields.id,
    item_ids: [],
    status_id: null,
    planned_hours: 0,
    fact_hours: 0,
    start_date: null,
    end_date: null,
    is_daily: false,
    plan_date: null,
    duplicated_from: null,
    parent_id: null,
    urgent: null,
    important: null,
    frog_date: null,
    effort: null,
    abc_letter: null,
    abc_rank: null,
    delegated_to: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...fields,
  }
}

describe('Эйзенхауэр', () => {
  it('срок через два дня и ближе — срочно само, через три — нет', () => {
    expect(isAutoUrgent({ end_date: '2026-10-21' }, TODAY)).toBe(true)
    expect(isAutoUrgent({ end_date: '2026-10-22' }, TODAY)).toBe(false)
    expect(isAutoUrgent({ end_date: '2026-10-10' }, TODAY)).toBe(true)
    expect(isAutoUrgent({ end_date: null }, TODAY)).toBe(false)
  })

  it('без отметки важности задача не разобрана', () => {
    expect(quadrantOf(task({ id: 'a', end_date: TODAY }), TODAY)).toBeNull()
  })

  it('квадрант по важности и срочности', () => {
    expect(quadrantOf(task({ id: 'a', important: true, end_date: TODAY }), TODAY)).toBe(1)
    expect(quadrantOf(task({ id: 'a', important: true }), TODAY)).toBe(2)
    expect(quadrantOf(task({ id: 'a', important: false, urgent: true }), TODAY)).toBe(3)
    expect(quadrantOf(task({ id: 'a', important: false }), TODAY)).toBe(4)
  })

  it('ручное «не срочно» перебивает близкий срок', () => {
    expect(quadrantOf(task({ id: 'a', important: true, urgent: false, end_date: TODAY }), TODAY)).toBe(2)
  })
})

describe('1-3-5', () => {
  it('размер по плану часов', () => {
    expect(suggestEffort(3)).toBe('big')
    expect(suggestEffort(2)).toBe('big')
    expect(suggestEffort(1)).toBe('medium')
    expect(suggestEffort(0.5)).toBe('medium')
    expect(suggestEffort(0.25)).toBe('small')
    expect(suggestEffort(0)).toBe('medium')
    expect(suggestEffort(8)).toBe('big')
    // спринт с планом на месяц — в день идёт кусок
    expect(suggestEffort(40)).toBe('medium')
  })

  it('выбранный размер важнее плана', () => {
    expect(effortOf(task({ id: 'a', planned_hours: 5, effort: 'small' }))).toBe('small')
  })

  it('места заполняются по порядку, лишнее уходит в «не влезло»', () => {
    const tasks = [
      task({ id: 'b1', planned_hours: 3 }),
      task({ id: 'b2', planned_hours: 4 }),
      ...['m1', 'm2', 'm3', 'm4'].map((id) => task({ id, planned_hours: 1 })),
      task({ id: 's1', planned_hours: 0.1 }),
    ]
    const day = layoutDay(tasks)
    expect(day.big.map((t) => t.id)).toEqual(['b1'])
    expect(day.medium.map((t) => t.id)).toEqual(['m1', 'm2', 'm3'])
    expect(day.small.map((t) => t.id)).toEqual(['s1'])
    expect(day.overflow.map((t) => t.id)).toEqual(['b2', 'm4'])
  })
})

describe('ABCDE', () => {
  it('подпись: номер только у A–C', () => {
    expect(abcLabel({ abc_letter: 'A', abc_rank: 2 })).toBe('A-2')
    expect(abcLabel({ abc_letter: 'D', abc_rank: 1 })).toBe('D')
    expect(abcLabel({ abc_letter: 'B', abc_rank: null })).toBe('B')
    expect(abcLabel({ abc_letter: null, abc_rank: null })).toBeNull()
  })

  it('порядок: буква, номер, без буквы — в конце', () => {
    const list = [
      task({ id: 'none' }),
      task({ id: 'b1', abc_letter: 'B', abc_rank: 1 }),
      task({ id: 'a2', abc_letter: 'A', abc_rank: 2 }),
      task({ id: 'a', abc_letter: 'A' }),
      task({ id: 'a1', abc_letter: 'A', abc_rank: 1 }),
    ]
    expect([...list].sort(compareAbc).map((t) => t.id)).toEqual(['a1', 'a2', 'a', 'b1', 'none'])
  })

  it('следующий номер в букве — после последнего, саму задачу не считаем', () => {
    const list = [task({ id: 'x', abc_letter: 'A', abc_rank: 3 }), task({ id: 'y', abc_letter: 'A', abc_rank: 1 })]
    expect(nextAbcRank(list, 'A')).toBe(4)
    expect(nextAbcRank(list, 'A', 'x')).toBe(2)
    expect(nextAbcRank(list, 'B')).toBe(1)
  })
})

describe('лягушка и общий порядок', () => {
  it('лягушка дня', () => {
    const list = [task({ id: 'a', frog_date: '2026-10-18' }), task({ id: 'b', frog_date: TODAY })]
    expect(frogOf(list, TODAY)?.id).toBe('b')
    expect(frogOf(list, '2026-10-20')).toBeUndefined()
  })

  it('сортировка списка по методике', () => {
    const list = [
      task({ id: 'q4', important: false }),
      task({ id: 'new' }),
      task({ id: 'q1', important: true, urgent: true }),
    ]
    expect([...list].sort(comparePriority('eisenhower', TODAY)).map((t) => t.id)).toEqual(['q1', 'q4', 'new'])
    const sizes = [task({ id: 's', planned_hours: 0.1 }), task({ id: 'b', planned_hours: 3 })]
    expect([...sizes].sort(comparePriority('135', TODAY)).map((t) => t.id)).toEqual(['b', 's'])
    const frogs = [task({ id: 'x' }), task({ id: 'f', frog_date: TODAY })]
    expect([...frogs].sort(comparePriority('frog', TODAY)).map((t) => t.id)).toEqual(['f', 'x'])
    expect(comparePriority('none', TODAY)(list[0], list[1])).toBe(0)
  })
})
