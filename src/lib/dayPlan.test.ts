import { describe, expect, it } from 'vitest'
import { isInDay, planDiff, planSections } from './dayPlan'
import { childrenByParent } from './tree'
import type { Task } from './types'

const TODAY = '2026-10-12'

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
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-01T10:00:00Z',
    ...fields,
  }
}

function sections(tasks: Task[], extra: { done?: string[]; recent?: string[]; locked?: string[] } = {}) {
  const done = new Set(extra.done ?? [])
  const result = planSections({
    tasks,
    childrenOf: childrenByParent(tasks),
    isDone: (t) => done.has(t.id),
    today: TODAY,
    recentTaskIds: extra.recent ?? [],
    lockedIds: new Set(extra.locked ?? []),
  })
  return Object.fromEntries(result.map((s) => [s.key, s.tasks.map((t) => t.id)]))
}

describe('isInDay', () => {
  it('в дне: выбранная сегодня, ежедневная, с идущим или сегодняшним учётом', () => {
    const none = new Set<string>()
    expect(isInDay(task({ id: 'a', plan_date: TODAY }), TODAY, null, none)).toBe(true)
    expect(isInDay(task({ id: 'b', is_daily: true }), TODAY, null, none)).toBe(true)
    expect(isInDay(task({ id: 'c' }), TODAY, 'c', none)).toBe(true)
    expect(isInDay(task({ id: 'd' }), TODAY, null, new Set(['d']))).toBe(true)
  })

  it('не в дне: срок сегодня сам по себе, выбранная на другой день', () => {
    const none = new Set<string>()
    expect(isInDay(task({ id: 'a', start_date: TODAY, end_date: TODAY }), TODAY, null, none)).toBe(false)
    expect(isInDay(task({ id: 'b', plan_date: '2026-10-11' }), TODAY, null, none)).toBe(false)
  })
})

describe('planSections', () => {
  it('раскладывает по важности и не повторяет задачу в двух секциях', () => {
    const s = sections(
      [
        task({ id: 'planned', plan_date: TODAY }),
        task({ id: 'carry', plan_date: '2026-10-11' }),
        task({ id: 'due', start_date: '2026-10-01', end_date: '2026-10-20' }),
        task({ id: 'overdue', end_date: '2026-10-05' }),
        task({ id: 'recent' }),
        task({ id: 'rest' }),
      ],
      { recent: ['recent', 'carry'] },
    )
    expect(s).toEqual({
      planned: ['planned'],
      carry: ['carry'],
      due: ['overdue', 'due'],
      recent: ['recent'],
      rest: ['rest'],
    })
  })

  it('закрытые, задачи уже в дне и давние выборы не предлагаются как «со вчера»', () => {
    const s = sections(
      [
        task({ id: 'done', end_date: TODAY }),
        task({ id: 'locked', end_date: TODAY }),
        task({ id: 'old-plan', plan_date: '2026-10-01' }),
      ],
      { done: ['done'], locked: ['locked'] },
    )
    expect(s).toEqual({ rest: ['old-plan'] })
  })

  it('спринт с подзадачами не предлагается — предлагаются подзадачи; закрытый спринт скрывает их', () => {
    const tasks = [
      task({ id: 'sprint', end_date: TODAY }),
      task({ id: 'sub', parent_id: 'sprint', end_date: TODAY }),
      task({ id: 'closed', end_date: TODAY }),
      task({ id: 'closed-sub', parent_id: 'closed' }),
    ]
    expect(sections(tasks, { done: ['closed'] })).toEqual({ due: ['sub'] })
  })
})

describe('planDiff', () => {
  it('добавленные и снятые', () => {
    expect(planDiff(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({ add: ['c'], remove: ['a'] })
  })
})
