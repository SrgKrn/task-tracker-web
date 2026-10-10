import { describe, expect, it } from 'vitest'
import {
  childrenByParent,
  deleteDescription,
  isOverdue,
  nextSprintDates,
  nextSprintName,
  rollupFact,
  runningWithin,
  suggestedStatus,
} from './tree'
import type { Status, Task } from './types'

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
    duplicated_from: null,
    parent_id: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...fields,
  }
}

function status(id: string, label: string, isFinal = false): Status {
  return { id, user_id: 'u', label, sort_order: 0, is_final: isFinal, created_at: '', updated_at: '' }
}

describe('childrenByParent', () => {
  it('собирает подзадачи по спринту и сортирует по сроку, без срока — в конце', () => {
    const map = childrenByParent([
      task({ id: 'sprint' }),
      task({ id: 'no-date', parent_id: 'sprint', created_at: '2026-10-01T09:00:00Z' }),
      task({ id: 'late', parent_id: 'sprint', end_date: '2026-10-20' }),
      task({ id: 'early', parent_id: 'sprint', end_date: '2026-10-05' }),
      task({ id: 'no-date-newer', parent_id: 'sprint', created_at: '2026-10-02T09:00:00Z' }),
    ])
    expect(map.get('sprint')?.map((t) => t.id)).toEqual(['early', 'late', 'no-date', 'no-date-newer'])
    expect(map.has('no-date')).toBe(false)
  })

  it('при одинаковом сроке — в порядке создания', () => {
    const map = childrenByParent([
      task({ id: 'b', parent_id: 's', end_date: '2026-10-05', created_at: '2026-10-02T00:00:00Z' }),
      task({ id: 'a', parent_id: 's', end_date: '2026-10-05', created_at: '2026-10-01T00:00:00Z' }),
    ])
    expect(map.get('s')?.map((t) => t.id)).toEqual(['a', 'b'])
  })
})

describe('rollupFact и runningWithin', () => {
  const sprint = task({ id: 's', fact_hours: 2 })
  const kids = [task({ id: 'c1', parent_id: 's', fact_hours: 1.5 }), task({ id: 'c2', parent_id: 's', fact_hours: 0.5 })]

  it('факт спринта — свой плюс подзадачи', () => {
    expect(rollupFact(sprint, kids)).toBe(4)
    expect(rollupFact(sprint, undefined)).toBe(2)
  })

  it('спринт «идёт», если учёт по нему или по подзадаче', () => {
    expect(runningWithin(sprint, kids, 's')).toBe(true)
    expect(runningWithin(sprint, kids, 'c2')).toBe(true)
    expect(runningWithin(sprint, kids, 'other')).toBe(false)
    expect(runningWithin(sprint, kids, null)).toBe(false)
  })
})

describe('suggestedStatus', () => {
  const scale = [status('s0', '0%'), status('s25', '25%'), status('s50', '50 %'), status('s75', '75%'), status('s100', '100%', true)]

  it('подсказывает ближайший процент по доле закрытых', () => {
    const kids = [
      task({ id: 'a', status_id: 's100' }),
      task({ id: 'b', status_id: 's0' }),
      task({ id: 'c', status_id: 's0' }),
      task({ id: 'd', status_id: 's0' }),
    ]
    expect(suggestedStatus(kids, scale, 's0')?.status.id).toBe('s25')
  })

  it('«100%» — только когда закрыто всё', () => {
    const almost = Array.from({ length: 8 }, (_, i) => task({ id: `t${i}`, status_id: i < 7 ? 's100' : 's0' }))
    expect(suggestedStatus(almost, scale, null)?.status.id).toBe('s75')
    const all = almost.map((t) => ({ ...t, status_id: 's100' }))
    expect(suggestedStatus(all, scale, null)?.status.id).toBe('s100')
  })

  it('не предлагает то, что уже стоит, и молчит без процентной шкалы', () => {
    const kids = [task({ id: 'a', status_id: 's100' }), task({ id: 'b', status_id: 's0' })]
    expect(suggestedStatus(kids, scale, 's50')).toBeNull()
    expect(suggestedStatus(kids, [status('x', 'В работе'), status('y', 'Готово', true)], null)).toBeNull()
    expect(suggestedStatus([], scale, null)).toBeNull()
  })
})

describe('следующий спринт', () => {
  it('увеличивает первое отдельное число в названии', () => {
    expect(nextSprintName('Спринт 6')).toBe('Спринт 7')
    expect(nextSprintName('Спринт 4 б24')).toBe('Спринт 5 б24')
    expect(nextSprintName('  Спринт 9  ')).toBe('Спринт 10')
    expect(nextSprintName('Без номера')).toBe('Без номера')
  })

  it('месячный спринт переезжает на следующий месяц целиком', () => {
    expect(nextSprintDates('2026-09-01', '2026-09-30')).toEqual({ start_date: '2026-10-01', end_date: '2026-10-31' })
    expect(nextSprintDates('2026-09-08', '2026-10-07')).toEqual({ start_date: '2026-10-08', end_date: '2026-11-07' })
    expect(nextSprintDates('2027-01-01', '2027-01-31')).toEqual({ start_date: '2027-02-01', end_date: '2027-02-28' })
  })

  it('другой отрезок встаёт вплотную той же длины', () => {
    expect(nextSprintDates('2026-10-05', '2026-10-11')).toEqual({ start_date: '2026-10-12', end_date: '2026-10-18' })
    expect(nextSprintDates(null, null)).toEqual({ start_date: null, end_date: null })
  })
})

describe('isOverdue и deleteDescription', () => {
  it('просрочена — срок раньше сегодняшнего и статус не финальный', () => {
    expect(isOverdue(task({ id: 'a', end_date: '2020-01-01' }), undefined)).toBe(true)
    expect(isOverdue(task({ id: 'a', end_date: '2020-01-01' }), status('d', 'Готово', true))).toBe(false)
    expect(isOverdue(task({ id: 'a', end_date: '2999-01-01' }), undefined)).toBe(false)
    expect(isOverdue(task({ id: 'a' }), undefined)).toBe(false)
  })

  it('предупреждает о подзадачах с верным склонением', () => {
    expect(deleteDescription(0)).toMatch(/вся история/)
    expect(deleteDescription(1)).toMatch(/удалится 1 подзадача/)
    expect(deleteDescription(3)).toMatch(/удалятся 3 подзадачи/)
    expect(deleteDescription(11)).toMatch(/удалятся 11 подзадач/)
  })
})
