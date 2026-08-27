import type { Task } from './types'

/** true if the task's [start_date, end_date] range overlaps [from, to] (open ends match anything) */
export function overlapsPeriod(task: Task, from: string, to: string): boolean {
  if (!from && !to) return true
  if (task.start_date && to && task.start_date > to) return false
  if (task.end_date && from && task.end_date < from) return false
  return true
}

export interface PeriodPreset {
  key: 'this_month' | 'last_month'
  label: string
}

export const PERIOD_PRESETS: PeriodPreset[] = [
  { key: 'this_month', label: 'Этот месяц' },
  { key: 'last_month', label: 'Прошлый месяц' },
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Сегодня в формате YYYY-MM-DD по локальному времени. */
export function todayStr(): string {
  return toDateString(new Date())
}

/** [пн, вс] текущей недели — под столбики недельного ритма на «Сегодня». */
export function currentWeekRange(): { from: string; to: string; days: string[] } {
  const now = new Date()
  const dow = (now.getDay() + 6) % 7 // 0 = понедельник
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow)
  const days = Array.from({ length: 7 }, (_, i) =>
    toDateString(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)),
  )
  return { from: days[0], to: days[6], days }
}

/** «Вторник, 26 авг» — надзаголовок на «Сегодня». */
export function formatTodayLabel(d = new Date()): string {
  const weekday = d.toLocaleDateString('ru-RU', { weekday: 'long' })
  const rest = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
  return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${rest}`
}

/** [from, to] date-only strings (inclusive) for a preset month. */
export function rangeForPreset(key: PeriodPreset['key']): { from: string; to: string } {
  const now = new Date()
  const monthOffset = key === 'last_month' ? -1 : 0
  const from = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0)
  return { from: toDateString(from), to: toDateString(to) }
}

/** inclusive day count between two YYYY-MM-DD strings */
export function daysBetweenInclusive(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`)
  const b = new Date(`${to}T00:00:00`)
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1)
}

/** number of days in the calendar month that `dateStr` (YYYY-MM-DD) falls in */
export function daysInCalendarMonth(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00`)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}
