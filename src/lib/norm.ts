import { addDays, toDateString } from './period'

/**
 * Норма часов по настройкам «Ещё → План часов». Считается только по рабочим дням:
 * раньше «Сводка» умножала дневную цель на все дни периода (7 ч × 31 = 217 ч за октябрь),
 * хотя в выходные никто не работает.
 *
 * Рабочие дни — первые N дней недели с понедельника: 5 — пн–пт, 6 — пн–сб, 7 — без выходных.
 */

export const DEFAULT_WORK_DAYS = 5

export interface NormSettings {
  perDay: number | null
  perMonth: number | null
  /** рабочих дней в неделе, 1–7 */
  workDays: number
}

/** из строки user_settings: numeric приходит строкой, колонки может ещё не быть */
export function normSettingsOf(
  s: { planned_hours_per_day?: number | string | null; planned_hours_per_month?: number | string | null; work_days_per_week?: number | null } | null | undefined,
): NormSettings {
  const num = (v: number | string | null | undefined) => (v == null || v === '' ? null : Number(v) || null)
  const wd = Number(s?.work_days_per_week)
  return {
    perDay: num(s?.planned_hours_per_day),
    perMonth: num(s?.planned_hours_per_month),
    workDays: wd >= 1 && wd <= 7 ? Math.round(wd) : DEFAULT_WORK_DAYS,
  }
}

function parse(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/** понедельник — 1, воскресенье — 7 */
function isoDow(iso: string): number {
  return parse(iso).getDay() || 7
}

export function isWorkday(iso: string, workDays: number): boolean {
  return isoDow(iso) <= workDays
}

/** рабочие дни в [from, to] включительно; пустой отрезок — 0 */
export function workdaysBetween(from: string, to: string, workDays: number): number {
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) if (isWorkday(d, workDays)) n++
  return n
}

function monthBounds(iso: string): { first: string; last: string } {
  const d = parse(iso)
  return {
    first: toDateString(new Date(d.getFullYear(), d.getMonth(), 1)),
    last: toDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  }
}

/** норма одного рабочего дня: дневная цель, иначе месячная, делённая на рабочие дни месяца */
export function dayNormFor(iso: string, s: NormSettings): number | null {
  if (s.perDay) return s.perDay
  if (!s.perMonth) return null
  const { first, last } = monthBounds(iso)
  const wd = workdaysBetween(first, last, s.workDays)
  return wd > 0 ? s.perMonth / wd : null
}

/**
 * Норма за период. Если задана месячная — она и есть «норма часов»: целый месяц даёт ровно её,
 * часть месяца — долю по рабочим дням. Период через несколько месяцев складывается помесячно.
 * Без месячной — дневная цель × рабочие дни.
 */
export function periodNorm(from: string, to: string, s: NormSettings): number | null {
  if (from > to) return 0
  if (!s.perMonth) return s.perDay ? s.perDay * workdaysBetween(from, to, s.workDays) : null
  let sum = 0
  for (let cur = from; cur <= to; ) {
    const { first, last } = monthBounds(cur)
    const end = last < to ? last : to
    const inMonth = workdaysBetween(first, last, s.workDays)
    if (inMonth > 0) sum += (s.perMonth * workdaysBetween(cur, end, s.workDays)) / inMonth
    cur = addDays(last, 1)
  }
  return sum
}
