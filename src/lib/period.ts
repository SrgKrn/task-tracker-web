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
