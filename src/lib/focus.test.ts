import { describe, expect, it } from 'vitest'
import { FOCUS_DEFAULTS, buildPlan, focusSettingsOf, formatCountdown, phaseAt, secondsLeft, suggestTask, workNumber } from './focus'
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
    workspace_id: 'w',
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

describe('план фокуса', () => {
  it('Pomodoro: 4 помидора, после последнего длинный перерыв', () => {
    const plan = buildPlan('pomodoro', FOCUS_DEFAULTS)
    expect(plan.map((p) => `${p.kind}${p.seconds / 60}`)).toEqual([
      'work25', 'break5', 'work25', 'break5', 'work25', 'break5', 'work25', 'long15',
    ])
  })

  it('90/30 с отдыхом 20 минут', () => {
    const plan = buildPlan('9030', focusSettingsOf({ deep: { work: 90, rest: 20 } }))
    expect(plan.map((p) => `${p.kind}${p.seconds / 60}`)).toEqual(['work90', 'break20'])
  })

  it('план идёт по кругу, номер помидора считается внутри круга', () => {
    const plan = buildPlan('pomodoro', FOCUS_DEFAULTS)
    expect(phaseAt(plan, 8).kind).toBe('work')
    expect(workNumber(plan, 0)).toEqual({ n: 1, of: 4 })
    expect(workNumber(plan, 6)).toEqual({ n: 4, of: 4 })
    expect(workNumber(plan, 7)).toEqual({ n: 4, of: 4 })
    expect(workNumber(plan, 10)).toEqual({ n: 2, of: 4 })
  })

  it('мусорные настройки заменяются разумными', () => {
    const s = focusSettingsOf({ pomodoro: { work: 0, short: NaN, long: 500, cycles: 4 } })
    expect(s.pomodoro).toEqual({ work: 5, short: 5, long: 60, cycles: 4 })
    expect(s.deep).toEqual(FOCUS_DEFAULTS.deep)
  })
})

describe('остаток и отображение', () => {
  it('идущий отрезок — до конца, на паузе — запомненное', () => {
    const now = Date.parse('2026-10-19T10:00:00Z')
    expect(secondsLeft({ state: 'running', phase_ends_at: '2026-10-19T10:01:30Z', left_seconds: null }, now)).toBe(90)
    expect(secondsLeft({ state: 'running', phase_ends_at: '2026-10-19T09:59:00Z', left_seconds: null }, now)).toBe(0)
    expect(secondsLeft({ state: 'paused', phase_ends_at: null, left_seconds: 600 }, now)).toBe(600)
  })

  it('обратный отсчёт', () => {
    expect(formatCountdown(1500)).toBe('25:00')
    expect(formatCountdown(65)).toBe('1:05')
    expect(formatCountdown(5400)).toBe('1:30:00')
  })
})

describe('какую задачу предложить', () => {
  const day = [
    task({ id: 'small', planned_hours: 0.2 }),
    task({ id: 'q1', important: true, urgent: true, abc_letter: 'B', abc_rank: 1 }),
    task({ id: 'frog', frog_date: TODAY, abc_letter: 'A', abc_rank: 1, planned_hours: 3 }),
  ]
  it('по методике', () => {
    expect(suggestTask(day, 'frog', TODAY, null)?.task.id).toBe('frog')
    expect(suggestTask(day, 'eisenhower', TODAY, null)?.task.id).toBe('q1')
    expect(suggestTask(day, 'abcde', TODAY, null)?.task.id).toBe('frog')
    expect(suggestTask(day, '135', TODAY, null)?.task.id).toBe('frog')
  })
  it('без методики — то, что в учёте, иначе первое из плана', () => {
    expect(suggestTask(day, 'none', TODAY, 'q1')?.task.id).toBe('q1')
    expect(suggestTask(day, 'none', TODAY, null)?.task.id).toBe('small')
    expect(suggestTask([], 'none', TODAY, null)).toBeNull()
  })
})
