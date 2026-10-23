import { describe, expect, it } from 'vitest'
import { buildReport, comparisonPeriod } from './report'
import type { Group, GroupItem, Task, TimeEntry } from './types'

describe('comparisonPeriod — с чем сравнивает отчёт', () => {
  it('идущий месяц — с тем же числом дней прошлого: 1–15 окт с 1–15 сент', () => {
    expect(comparisonPeriod('2026-10-01', '2026-10-31', '2026-10-15')).toEqual({
      from: '2026-09-01',
      to: '2026-09-15',
      partial: true,
    })
  })

  it('прошлый месяц короче — не дальше его конца', () => {
    expect(comparisonPeriod('2026-03-01', '2026-03-31', '2026-03-30')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
      partial: false,
    })
    expect(comparisonPeriod('2026-03-01', '2026-03-31', '2026-03-20')).toEqual({
      from: '2026-02-01',
      to: '2026-02-20',
      partial: true,
    })
  })

  it('закрытый месяц — с целым прошлым календарным месяцем', () => {
    expect(comparisonPeriod('2026-09-01', '2026-09-30', '2026-10-15')).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
      partial: false,
    })
  })

  it('последний день периода — сравниваем целиком', () => {
    expect(comparisonPeriod('2026-10-01', '2026-10-31', '2026-10-31')).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
      partial: false,
    })
  })

  it('произвольный отрезок — с отрезком той же длины перед ним, идущий — урезанный', () => {
    expect(comparisonPeriod('2026-10-12', '2026-10-18', '2026-10-20')).toEqual({
      from: '2026-10-05',
      to: '2026-10-11',
      partial: false,
    })
    expect(comparisonPeriod('2026-10-12', '2026-10-18', '2026-10-14')).toEqual({
      from: '2026-10-05',
      to: '2026-10-07',
      partial: true,
    })
  })

  it('начало месяца по сегодня (как ставит экспорт) — с теми же числами прошлого месяца', () => {
    expect(comparisonPeriod('2026-10-01', '2026-10-15', '2026-10-15')).toEqual({
      from: '2026-09-01',
      to: '2026-09-15',
      partial: true,
    })
    // в прошлом месяце дней меньше — до его конца, это уже целый месяц
    expect(comparisonPeriod('2026-03-01', '2026-03-30', '2026-03-30')).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
      partial: false,
    })
  })

  it('будущий период не урезаем', () => {
    expect(comparisonPeriod('2026-11-01', '2026-11-30', '2026-10-15').partial).toBe(false)
  })
})

describe('buildReport — сравнение идущего месяца', () => {
  const entry = (effective_date: string, hours: number) =>
    ({
      id: effective_date,
      task_id: 't',
      entry_type: 'manual_adjustment',
      started_at: null,
      ended_at: null,
      duration_seconds: hours * 3600,
      duration_minutes: hours * 60,
      note: null,
      effective_date,
      created_at: `${effective_date}T12:00:00Z`,
    }) as TimeEntry
  const base = () => ({
    from: '2026-10-01',
    to: '2026-10-31',
    tasks: [],
    groups: [],
    items: [],
    statuses: [],
    entries: [entry('2026-09-10', 8), entry('2026-09-25', 8), entry('2026-10-05', 6)],
    comments: [],
    closedTaskIds: [],
    firstEntryDate: '2026-01-01',
    perDay: null,
    perMonth: null,
    generatedAt: new Date(2026, 9, 15, 11, 0),
    options: { includeChecks: false, includeComments: false },
  })
  const report = (generatedAt: Date) =>
    buildReport({
      from: '2026-10-01',
      to: '2026-10-31',
      tasks: [],
      groups: [],
      items: [],
      statuses: [],
      entries: [entry('2026-09-10', 8), entry('2026-09-25', 8), entry('2026-10-05', 6)],
      comments: [],
      closedTaskIds: [],
      firstEntryDate: '2026-01-01',
      perDay: null,
      perMonth: null,
      generatedAt,
      options: { includeChecks: false, includeComments: false },
    })

  it('15 октября — только 1–15 сентября и подпись «к 15 сент»', () => {
    const r = report(new Date(2026, 9, 15, 11, 0))
    expect(r.prevTotal).toBe(8)
    expect(r.prevDative).toBe('15 сент')
    expect(r.prevName).toBe('1–15 сент')
    expect(r.prevTo).toBe('2026-09-15')
  })

  it('экспорт по умолчанию 1–15 октября — тоже 1–15 сентября, а не 16–30', () => {
    const r = buildReport({ ...base(), to: '2026-10-15', generatedAt: new Date(2026, 9, 15, 11, 0) })
    expect(r.prevFrom).toBe('2026-09-01')
    expect(r.prevTo).toBe('2026-09-15')
    expect(r.prevTotal).toBe(8)
    expect(r.prevDative).toBe('15 сент')
  })

  it('после конца месяца — целый сентябрь', () => {
    const r = report(new Date(2026, 10, 2, 11, 0))
    expect(r.prevTotal).toBe(16)
    expect(r.prevDative).toBe('сентябрю')
    expect(r.prevName).toBe('сентябрь')
  })
})

describe('buildReport — сумма к оплате', () => {
  const group = { id: 'g', name: 'Проекты', item_name: 'Проект', sort_order: 0 } as unknown as Group
  const client = { id: 'c', name: 'А-Лизинг', group_id: 'g', hourly_rate: 40, rate_currency: 'BYN' } as unknown as GroupItem
  const sprint = {
    id: 't',
    name: 'Спринт 7',
    item_ids: ['c'],
    status_id: null,
    planned_hours: 4,
    fact_hours: 6,
    start_date: '2026-10-01',
    end_date: '2026-10-31',
    parent_id: null,
    hourly_rate: null,
    rate_currency: null,
  } as unknown as Task
  const entry = {
    id: 'e',
    task_id: 't',
    entry_type: 'manual_adjustment',
    started_at: null,
    ended_at: null,
    duration_seconds: 6 * 3600,
    duration_minutes: 360,
    note: null,
    effective_date: '2026-10-05',
    created_at: '2026-10-05T12:00:00Z',
  } as TimeEntry
  const input = (includeOvertime: boolean) => ({
    from: '2026-10-01',
    to: '2026-10-31',
    tasks: [sprint],
    groups: [group],
    items: [client],
    statuses: [],
    entries: [entry],
    comments: [],
    closedTaskIds: [],
    firstEntryDate: '2026-01-01',
    perDay: null,
    perMonth: null,
    generatedAt: new Date(2026, 9, 20, 12, 0),
    options: { includeChecks: false, includeComments: false, includeOvertime },
  })

  it('до плана — в итог, переработка отдельно', () => {
    const r = buildReport(input(false))
    expect(r.sprints[0].bill).toMatchObject({ hours: 4, amount: 160, overHours: 2, overAmount: 80 })
    expect(r.billing).toEqual([{ currency: 'BYN', hours: 4, amount: 160, overHours: 2, overAmount: 80, due: 160 }])
  })

  it('с галочкой переработка входит в итог', () => {
    expect(buildReport(input(true)).billing[0].due).toBe(240)
  })

  it('без ставок раздела нет', () => {
    const r = buildReport({ ...input(false), items: [{ ...client, hourly_rate: null } as GroupItem] })
    expect(r.billing).toEqual([])
    expect(r.sprints[0].bill).toBeNull()
  })
})

describe('buildReport — дашборд 0.42', () => {
  const group = { id: 'g', name: 'Клиенты', item_name: 'Клиент', sort_order: 0, show_in_list: true } as unknown as Group
  const north = { id: 'n', name: 'Студия Север', group_id: 'g', color: 'label-1', hourly_rate: 30, rate_currency: 'BYN' } as unknown as GroupItem
  const cafe = { id: 'k', name: 'Кофейня', group_id: 'g', color: 'label-2', hourly_rate: null, rate_currency: null } as unknown as GroupItem
  const task = (id: string, item: string, extra: Partial<Task> = {}) =>
    ({
      id,
      name: id,
      item_ids: [item],
      status_id: null,
      planned_hours: 10,
      fact_hours: 6,
      start_date: '2026-10-01',
      end_date: '2026-10-31',
      parent_id: null,
      hourly_rate: null,
      rate_currency: null,
      abc_letter: null,
      ...extra,
    }) as unknown as Task
  // 5 октября (пн) 10:00–12:00 у Севера, 14:00–15:00 у Кофейни; 6-го — встреча Кофейни
  const at = (d: string, h: number) => new Date(2026, 9, Number(d.slice(8)), h).toISOString()
  const timer = (id: string, taskId: string, d: string, h0: number, h1: number) =>
    ({
      id,
      task_id: taskId,
      entry_type: 'timer',
      started_at: at(d, h0),
      ended_at: at(d, h1),
      duration_seconds: (h1 - h0) * 3600,
      duration_minutes: (h1 - h0) * 60,
      note: id === 'e1' ? 'Три варианта' : null,
      effective_date: d,
      created_at: at(d, h1),
    }) as TimeEntry
  const r = buildReport({
    from: '2026-10-01',
    to: '2026-10-31',
    tasks: [task('s1', 'n', { abc_letter: 'A' }), task('s2', 'k')],
    groups: [group],
    items: [north, cafe],
    statuses: [],
    entries: [timer('e1', 's1', '2026-10-05', 10, 12), timer('e2', 's2', '2026-10-05', 14, 15), timer('e3', 's2', '2026-10-06', 17, 18)],
    comments: [],
    closedTaskIds: [],
    firstEntryDate: '2026-01-01',
    perDay: 8,
    perMonth: null,
    generatedAt: new Date(2026, 9, 7, 12, 0),
    options: { includeChecks: false, includeComments: true },
    focusSessions: [{ task_id: 's1', mode: 'pomodoro', started_at: at('2026-10-05', 10), ended_at: new Date(2026, 9, 5, 10, 25).toISOString(), completed: true }],
    meetingEntryIds: ['e3'],
    priorityMethod: 'abcde',
  })

  it('клиенты — как точка в строке задачи: цвет, часы по дням, сумма по ставке', () => {
    expect(r.clients.map((c) => [c.name, c.color, c.hours])).toEqual([
      ['Студия Север', 'label-1', 2],
      ['Кофейня', 'label-2', 2],
    ])
    expect(r.clients[0].byDay[4]).toBe(2)
    expect(r.clients[0].rate).toEqual({ value: 30, currency: 'BYN' })
    expect(r.clients[1].money).toEqual([])
  })

  it('часы суток: понедельник 10 и 11, вторник 17', () => {
    expect(r.heat[0][10]).toBeCloseTo(1)
    expect(r.heat[0][11]).toBeCloseTo(1)
    expect(r.heat[1][17]).toBeCloseTo(1)
  })

  it('фокус и встречи считаются отдельно от таймера, журнал помечает записи', () => {
    expect(r.work.pomodoro).toBe(1)
    expect(r.work.meetings).toBe(1)
    expect(r.work.meetingCount).toBe(1)
    expect(r.work.timer).toBeCloseTo(4 - 1 - 25 / 60)
    const tags = r.journal.flatMap((d) => d.entries.map((e) => e.tag))
    expect(tags).toEqual(['pomodoro', null, 'meeting'])
    expect(r.journal[0].entries[0].note).toBe('Три варианта')
  })

  it('методика ABCDE: пустые буквы не печатаются', () => {
    expect(r.method?.rows.map((x) => [x.key, x.hours])).toEqual([
      ['A', 2],
      ['none', 2],
    ])
  })

  it('пока месяц идёт — среднее по прошедшим рабочим дням и прогноз', () => {
    // 1–7 октября: рабочих дней 5 (чт, пт, пн, вт, ср)
    expect(r.avgPerWeekday).toBeCloseTo(4 / 5)
    expect(r.forecast?.pace).toBeCloseTo(4 / 5)
    expect(r.tiles).toHaveLength(31)
    expect(r.tiles[4].tile.total).toBeCloseTo(180)
  })
})
