import { describe, expect, it } from 'vitest'
import { buildGroupModel } from './groups'
import { applyFilter, breakdown, searchTaskHours, sortTaskHours, taskHours } from './reportViews'
import type { Group, GroupItem, Status, Task, TimeEntry } from './types'

const group = (id: string, name: string): Group =>
  ({ id, name, item_name: name, sort_order: 0, show_in_list: true, required: false, parent_group_id: null }) as Group
const item = (id: string, group_id: string, name: string, color: string | null = null): GroupItem =>
  ({ id, group_id, name, color, sort_order: 0, archived: false }) as GroupItem
const task = (id: string, name: string, item_ids: string[], extra: Partial<Task> = {}): Task =>
  ({ id, name, item_ids, parent_id: null, planned_hours: 0, fact_hours: 0, status_id: null, ...extra }) as Task
const entry = (id: string, task_id: string, date: string, minutes: number): TimeEntry =>
  ({ id, task_id, effective_date: date, duration_minutes: minutes, duration_seconds: minutes * 60, entry_type: 'timer' }) as TimeEntry

const groups = [group('g1', 'Клиенты'), group('g2', 'Разделы')]
const items = [item('c1', 'g1', 'SANQ', 'label-1'), item('c2', 'g1', 'Wclass', 'label-2'), item('s1', 'g2', 'Дизайн')]
const tasks = [
  task('t1', 'Спринт SANQ', ['c1', 's1'], { planned_hours: 10, fact_hours: 3 }),
  task('t1a', 'Макеты', ['c1', 's1'], { parent_id: 't1', fact_hours: 2 }),
  task('t2', 'Спринт Wclass', ['c2'], { fact_hours: 4 }),
]
const entries = [
  entry('e1', 't1', '2026-11-02', 60),
  entry('e2', 't1a', '2026-11-03', 120),
  entry('e3', 't2', '2026-11-03', 240),
]
const itemGroup = (id: string) => items.find((i) => i.id === id)?.group_id

describe('фильтр среза', () => {
  it('по клиенту — спринт вместе с подзадачами и их записями', () => {
    const r = applyFilter(tasks, entries, itemGroup, { items: ['c1'], tasks: [] })
    expect(r.tasks.map((t) => t.id)).toEqual(['t1', 't1a'])
    expect(r.entries.map((e) => e.id)).toEqual(['e1', 'e2'])
  })
  it('внутри группы — «или», между группами — «и»', () => {
    expect(applyFilter(tasks, entries, itemGroup, { items: ['c1', 'c2'], tasks: [] }).entries).toHaveLength(3)
    expect(applyFilter(tasks, entries, itemGroup, { items: ['c2', 's1'], tasks: [] }).entries).toHaveLength(0)
  })
  it('по спринту', () => {
    expect(applyFilter(tasks, entries, itemGroup, { items: [], tasks: ['t2'] }).entries.map((e) => e.id)).toEqual(['e3'])
  })
})

describe('куда ушло время', () => {
  const model = buildGroupModel(groups, items)
  it('по группе — с долями и «не указано»', () => {
    const rows = breakdown({ kind: 'group', groupId: 'g2' }, entries, [], tasks, model)
    expect(rows.map((r) => [r.name, r.hours])).toEqual([
      ['Не указано', 4],
      ['Дизайн', 3],
    ])
    expect(rows[1].share).toBeCloseTo(3 / 7)
  })
  it('по задачам — подзадачи складываются в спринт', () => {
    const rows = breakdown({ kind: 'task' }, entries, [entry('p', 't1', '2026-10-02', 30)], tasks, model)
    expect(rows.map((r) => [r.id, r.hours, r.prevHours])).toEqual([
      ['t2', 4, 0],
      ['t1', 3, 0.5],
    ])
  })
})

describe('часы по задачам', () => {
  const statuses = [] as Status[]
  it('спринт — сумма с подзадачами, подзадачи внутри', () => {
    const rows = taskHours(entries, tasks, statuses)
    const t1 = rows.find((r) => r.id === 't1')!
    expect(t1.hours).toBe(3)
    expect(t1.days).toBe(2)
    expect(t1.lastDate).toBe('2026-11-03')
    expect(t1.factTotal).toBe(5)
    expect(t1.children.map((c) => [c.id, c.hours])).toEqual([['t1a', 2]])
  })
  it('сортировка и поиск по подзадаче', () => {
    const rows = taskHours(entries, tasks, statuses)
    expect(sortTaskHours(rows, 'hours', true).map((r) => r.id)).toEqual(['t2', 't1'])
    expect(sortTaskHours(rows, 'name', false).map((r) => r.id)).toEqual(['t1', 't2'])
    expect(searchTaskHours(rows, 'макет').map((r) => [r.id, r.children.length])).toEqual([['t1', 1]])
  })
})

import { bucketize, grainFor } from './reportViews'

describe('столбики графика', () => {
  const day = (date: string, hours: number) => {
    const d = new Date(`${date}T00:00:00`)
    return { date, day: d.getDate(), weekend: d.getDay() === 0 || d.getDay() === 6, hours, norm: 7 }
  }
  it('зерно по длине периода', () => {
    expect([grainFor(30), grainFor(92), grainFor(365)]).toEqual(['day', 'week', 'month'])
  })
  it('недели режутся по понедельникам, серии складываются', () => {
    const days = Array.from({ length: 60 }, (_, i) => {
      const d = new Date(2026, 9, 1 + i)
      return day(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, 1)
    })
    const clients = [{ key: 'a', name: 'A', color: 'label-1', hours: 60, byDay: days.map(() => 1) }]
    const { grain, buckets, series } = bucketize(days, clients, true)
    expect(grain).toBe('week')
    expect(series).toHaveLength(1)
    // 1 окт 2026 — четверг: первая неделя из 4 дней
    expect(buckets[0]).toMatchObject({ from: '2026-10-01', to: '2026-10-04', label: '1–4', hours: 4, norm: 28, parts: [4] })
    expect(buckets[1]).toMatchObject({ from: '2026-10-05', to: '2026-10-11', hours: 7 })
    expect(buckets.reduce((s, b) => s + b.hours, 0)).toBe(60)
  })
  it('лишние серии уходят в «Остальные»', () => {
    const days = [day('2026-11-02', 3)]
    const clients = ['a', 'b', 'c'].map((k, i) => ({ key: k, name: k, color: null, hours: 3 - i, byDay: [1] }))
    const { series, buckets } = bucketize(days, clients, false, 2)
    expect(series.map((s) => s.key)).toEqual(['a', 'b', 'other'])
    expect(buckets[0].parts).toEqual([1, 1, 1])
    expect(buckets[0].norm).toBeNull()
  })
})
