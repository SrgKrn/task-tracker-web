import { describe, expect, it } from 'vitest'
import { activePreset, clampPeriod, customPeriod, periodTitle, presetPeriod, shiftPeriod } from './reportPeriod'

const TODAY = '2026-11-09' // понедельник

describe('пресеты периода', () => {
  it('неделя — с понедельника по воскресенье', () => {
    expect(presetPeriod('week', TODAY)).toEqual({ unit: 'week', from: '2026-11-09', to: '2026-11-15' })
    expect(presetPeriod('last_week', '2026-11-12')).toEqual({ unit: 'week', from: '2026-11-02', to: '2026-11-08' })
  })
  it('месяц, квартал, год', () => {
    expect(presetPeriod('last_month', '2026-01-15')).toEqual({ unit: 'month', from: '2025-12-01', to: '2025-12-31' })
    expect(presetPeriod('quarter', TODAY)).toEqual({ unit: 'quarter', from: '2026-10-01', to: '2026-12-31' })
    expect(presetPeriod('last_quarter', '2026-02-01')).toEqual({ unit: 'quarter', from: '2025-10-01', to: '2025-12-31' })
    expect(presetPeriod('year', TODAY)).toEqual({ unit: 'year', from: '2026-01-01', to: '2026-12-31' })
  })
  it('последние 30 дней включают сегодня', () => {
    expect(presetPeriod('d30', TODAY)).toEqual({ unit: 'range', from: '2026-10-11', to: TODAY })
  })
  it('узнаёт выбранный пресет', () => {
    expect(activePreset(presetPeriod('quarter', TODAY), TODAY)).toBe('quarter')
    expect(activePreset({ unit: 'range', from: '2026-11-02', to: '2026-11-04' }, TODAY)).toBeNull()
  })
})

describe('стрелки ‹ ›', () => {
  it('месяц листается целыми месяцами, даже из 31 дня в 28', () => {
    expect(shiftPeriod({ unit: 'month', from: '2026-01-01', to: '2026-01-31' }, 1)).toEqual({
      unit: 'month',
      from: '2026-02-01',
      to: '2026-02-28',
    })
  })
  it('квартал и год через границу года', () => {
    expect(shiftPeriod({ unit: 'quarter', from: '2026-01-01', to: '2026-03-31' }, -1)).toEqual({
      unit: 'quarter',
      from: '2025-10-01',
      to: '2025-12-31',
    })
    expect(shiftPeriod({ unit: 'year', from: '2026-01-01', to: '2026-12-31' }, 1).from).toBe('2027-01-01')
  })
  it('свой отрезок — на свою длину', () => {
    expect(shiftPeriod({ unit: 'range', from: '2026-11-01', to: '2026-11-10' }, -1)).toEqual({
      unit: 'range',
      from: '2026-10-22',
      to: '2026-10-31',
    })
  })
})

describe('свой период', () => {
  it('целый месяц сам становится месяцем, даты меняются местами', () => {
    expect(customPeriod('2026-02-28', '2026-02-01')).toEqual({ unit: 'month', from: '2026-02-01', to: '2026-02-28' })
    expect(customPeriod('2026-11-09', '2026-11-15').unit).toBe('week')
    expect(customPeriod('2026-11-03', '2026-11-15').unit).toBe('range')
  })
  it('обрезка историей тарифа', () => {
    const p = { unit: 'year' as const, from: '2025-01-01', to: '2025-12-31' }
    expect(clampPeriod(p, '2025-11-09')).toEqual({ period: { unit: 'range', from: '2025-11-09', to: '2025-12-31' }, cut: true })
    expect(clampPeriod(p, null).cut).toBe(false)
  })
})

describe('подпись периода', () => {
  it('по-русски и без лишнего года', () => {
    expect(periodTitle(presetPeriod('month', TODAY), TODAY)).toBe('Ноябрь 2026')
    expect(periodTitle(presetPeriod('quarter', TODAY), TODAY)).toBe('IV квартал 2026')
    expect(periodTitle(presetPeriod('week', TODAY), TODAY)).toBe('9–15 ноября')
    expect(periodTitle({ unit: 'range', from: '2025-12-20', to: '2026-01-05' }, TODAY)).toBe('20 декабря 2025 – 5 января 2026')
  })
})
