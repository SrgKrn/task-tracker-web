import { describe, expect, it } from 'vitest'
import { dayNormFor, normSettingsOf, periodNorm, workdaysBetween } from './norm'

describe('норма по рабочим дням', () => {
  it('октябрь 2026: 22 будних дня при пятидневке, 27 — при шестидневке (пять суббот)', () => {
    expect(workdaysBetween('2026-10-01', '2026-10-31', 5)).toBe(22)
    expect(workdaysBetween('2026-10-01', '2026-10-31', 6)).toBe(27)
    expect(workdaysBetween('2026-10-01', '2026-10-31', 7)).toBe(31)
  })

  it('только дневная цель — день × рабочие дни, а не × 31', () => {
    const s = { perDay: 7, perMonth: null, workDays: 5 }
    expect(periodNorm('2026-10-01', '2026-10-31', s)).toBe(154)
  })

  it('месячная цель: целый месяц — ровно она, часть — доля по рабочим дням', () => {
    const s = { perDay: 7, perMonth: 140, workDays: 5 }
    expect(periodNorm('2026-10-01', '2026-10-31', s)).toBe(140)
    // 1–15 октября — 11 рабочих дней из 22
    expect(periodNorm('2026-10-01', '2026-10-15', s)).toBe(70)
  })

  it('период через два месяца складывается помесячно', () => {
    const s = { perDay: null, perMonth: 140, workDays: 5 }
    expect(periodNorm('2026-09-01', '2026-10-31', s)).toBeCloseTo(280)
  })

  it('норма дня: дневная цель, иначе месяц / рабочие дни месяца', () => {
    expect(dayNormFor('2026-10-10', { perDay: 7, perMonth: 140, workDays: 5 })).toBe(7)
    expect(dayNormFor('2026-10-10', { perDay: null, perMonth: 154, workDays: 5 })).toBe(7)
    expect(dayNormFor('2026-10-10', { perDay: null, perMonth: null, workDays: 5 })).toBeNull()
  })

  it('настройки из базы: numeric строкой, без колонки — пятидневка', () => {
    expect(normSettingsOf({ planned_hours_per_day: '7.00', planned_hours_per_month: null })).toEqual({
      perDay: 7,
      perMonth: null,
      workDays: 5,
    })
    expect(normSettingsOf({ work_days_per_week: 6 }).workDays).toBe(6)
  })
})
