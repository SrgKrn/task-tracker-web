import { describe, expect, it } from 'vitest'
import { entryMinutes, entrySeconds, formatDuration, formatHoursMinutes, formatHoursRu, plural, TASKS } from './time'

describe('длительность записи', () => {
  it('секунды, а у старых записей — минуты × 60', () => {
    expect(entrySeconds({ duration_seconds: 20, duration_minutes: 0 })).toBe(20)
    expect(entrySeconds({ duration_minutes: 15 })).toBe(900)
    expect(entrySeconds({ duration_seconds: null, duration_minutes: -30 })).toBe(-1800)
    expect(entryMinutes({ duration_seconds: 90, duration_minutes: 2 })).toBe(1.5)
  })

  it('короткая сессия не превращается в «0 мин»', () => {
    expect(formatDuration(20)).toBe('20 с')
    expect(formatDuration(0)).toBe('0 с')
    expect(formatDuration(66)).toBe('1 мин')
    expect(formatDuration(3900)).toBe('1 ч 5 мин')
    expect(formatDuration(3600)).toBe('1 ч')
    expect(formatDuration(-900)).toBe('−15 мин')
    expect(formatDuration(-20)).toBe('−20 с')
  })
})

describe('часы по-русски', () => {
  it('десятые с запятой', () => {
    expect(formatHoursRu(3.5)).toBe('3,5')
    expect(formatHoursRu(14.44)).toBe('14,4')
    expect(formatHoursRu(2)).toBe('2')
  })

  it('часы и минуты словами — четверти часа не округляются', () => {
    expect(formatHoursMinutes(0.25)).toBe('15 мин')
    expect(formatHoursMinutes(1.75)).toBe('1 ч 45 мин')
    expect(formatHoursMinutes(2)).toBe('2 ч')
    expect(formatHoursMinutes(-1)).toBe('0 мин')
  })

  it('склонения', () => {
    expect(plural(1, TASKS)).toBe('1 задача')
    expect(plural(2, TASKS)).toBe('2 задачи')
    expect(plural(5, TASKS)).toBe('5 задач')
    expect(plural(11, TASKS)).toBe('11 задач')
    expect(plural(21, TASKS)).toBe('21 задача')
    expect(plural(112, TASKS)).toBe('112 задач')
  })
})
