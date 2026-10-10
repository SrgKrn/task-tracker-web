import { describe, expect, it } from 'vitest'
import {
  addDays,
  currentWeekRange,
  daysBetweenInclusive,
  daysInCalendarMonth,
  nextFriday,
  overlapsPeriod,
  toDateString,
} from './period'
import type { Task } from './types'

const span = (start_date: string | null, end_date: string | null) => ({ start_date, end_date }) as Task

describe('даты', () => {
  it('toDateString — местная дата без сдвига в UTC', () => {
    expect(toDateString(new Date(2026, 9, 11, 23, 59))).toBe('2026-10-11')
    expect(toDateString(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05')
  })

  it('addDays переходит через месяц и год', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('nextFriday — ближайшая пятница после дня, в пятницу — следующая', () => {
    expect(nextFriday('2026-10-12')).toBe('2026-10-16') // пн
    expect(nextFriday('2026-10-15')).toBe('2026-10-16') // чт
    expect(nextFriday('2026-10-16')).toBe('2026-10-23') // пт
    expect(nextFriday('2026-10-18')).toBe('2026-10-23') // вс
  })

  it('дни в отрезке и в месяце', () => {
    expect(daysBetweenInclusive('2026-10-01', '2026-10-31')).toBe(31)
    expect(daysBetweenInclusive('2026-10-05', '2026-10-05')).toBe(1)
    expect(daysInCalendarMonth('2028-02-10')).toBe(29)
    expect(daysInCalendarMonth('2026-02-10')).toBe(28)
  })

  it('неделя — семь дней с понедельника', () => {
    const week = currentWeekRange()
    expect(week.days).toHaveLength(7)
    expect(new Date(`${week.from}T00:00:00`).getDay()).toBe(1)
    expect(week.to).toBe(addDays(week.from, 6))
  })
})

describe('overlapsPeriod', () => {
  it('пересечение со сроками задачи, открытые концы совпадают со всем', () => {
    expect(overlapsPeriod(span('2026-10-01', '2026-10-31'), '2026-10-10', '2026-10-20')).toBe(true)
    expect(overlapsPeriod(span('2026-11-01', null), '2026-10-01', '2026-10-31')).toBe(false)
    expect(overlapsPeriod(span(null, '2026-09-30'), '2026-10-01', '2026-10-31')).toBe(false)
    expect(overlapsPeriod(span(null, null), '2026-10-01', '2026-10-31')).toBe(true)
    expect(overlapsPeriod(span('2026-10-31', '2026-11-05'), '2026-10-01', '2026-10-31')).toBe(true)
  })
})
