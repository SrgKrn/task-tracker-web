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

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
