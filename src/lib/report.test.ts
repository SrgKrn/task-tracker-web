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
