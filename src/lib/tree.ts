import { plural } from './time'
import type { Status, Task } from './types'

/**
 * Спринт и его подзадачи — строки одной таблицы. Все задачи и так грузятся одним запросом,
 * поэтому дерево собирается на клиенте, а не отдельными запросами на каждый спринт.
 */

/** подзадачи по id спринта; внутри — в порядке создания, новые внизу, у кнопки «+ Подзадача» */
export function childrenByParent(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.parent_id) continue
    const list = map.get(t.parent_id)
    if (list) list.push(t)
    else map.set(t.parent_id, [t])
  }
  for (const list of map.values()) list.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return map
}

/** id спринта, к которому относится задача: у головной — она сама */
export function headIdOf(task: Task): string {
  return task.parent_id ?? task.id
}

/**
 * Факт спринта = свои записи + записи подзадач. tasks.fact_hours у каждой строки остаётся
 * «своим», поэтому суммы по time_entries в сводке и отчёте ничего не считают дважды.
 */
export function rollupFact(task: Task, children: Task[] | undefined): number {
  return (children ?? []).reduce((sum, c) => sum + c.fact_hours, task.fact_hours)
}

/** Идёт ли учёт по самой задаче или по любой её подзадаче. */
export function runningWithin(
  task: Task,
  children: Task[] | undefined,
  runningTaskId: string | null | undefined,
): boolean {
  if (!runningTaskId) return false
  return runningTaskId === task.id || !!children?.some((c) => c.id === runningTaskId)
}

/** Процент из названия статуса: «25%», «75 %». Статусы без процента не участвуют. */
function percentOf(status: Status): number | null {
  const m = status.label.match(/(\d{1,3})\s*%/)
  return m ? Number(m[1]) : null
}

/**
 * Статус, который соответствует доле закрытых подзадач. Работает только когда статусы
 * у пользователя процентные — иначе подсказывать нечего. Возвращает null, если
 * подсказка совпадает с текущим статусом: предлагать то, что уже стоит, незачем.
 */
export function suggestedStatus(
  children: Task[],
  statuses: Status[],
  currentStatusId: string | null,
): { status: Status; done: number; total: number } | null {
  if (children.length === 0) return null
  const byId = new Map(statuses.map((s) => [s.id, s]))
  const done = children.filter((c) => c.status_id && byId.get(c.status_id)?.is_final).length
  const derived = (done / children.length) * 100

  const scale = statuses
    .map((status) => ({ status, pct: percentOf(status) }))
    .filter((x): x is { status: Status; pct: number } => x.pct !== null)
  if (scale.length < 2) return null

  // «100%» — только когда закрыто всё: ближайший по округлению статус
  // объявлял бы спринт готовым при одной открытой подзадаче из восьми
  const candidates = done === children.length ? scale : scale.filter((x) => x.pct < 100)
  if (candidates.length === 0) return null
  const best = candidates.reduce((a, b) => (Math.abs(b.pct - derived) < Math.abs(a.pct - derived) ? b : a))
  if (best.status.id === currentStatusId) return null
  return { status: best.status, done, total: children.length }
}

/** «Спринт 6» → «Спринт 7», «Спринт 4 б24» → «Спринт 5 б24». Номер — первое отдельное число. */
export function nextSprintName(name: string): string {
  const trimmed = name.trim()
  const m = trimmed.match(/(^|\s)(\d+)(?=\s|$)/)
  if (!m || m.index === undefined) return trimmed
  const start = m.index + m[1].length
  return `${trimmed.slice(0, start)}${Number(m[2]) + 1}${trimmed.slice(start + m[2].length)}`
}

function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

/** тот же день через n месяцев; 31 января + 1 месяц = 28 февраля, а не 3 марта */
function addMonths(d: Date, months: number): Date {
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  return new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), lastDay))
}

/**
 * Сроки следующего спринта. Спринты обычно месячные: «1–30 сен» или «8 сен – 7 окт».
 * Такой спринт переезжает на месяц вперёд — «1–31 окт», «8 окт – 7 ноя». Простой сдвиг
 * на то же число дней терял бы день на каждом месяце короче предыдущего.
 * Любой другой отрезок встаёт вплотную за текущим той же длины.
 */
export function nextSprintDates(
  start: string | null,
  end: string | null,
): { start_date: string | null; end_date: string | null } {
  if (start && end) {
    const s = parseDate(start)
    const e = parseDate(end)
    const nextStart = addDays(e, 1)
    const monthly = formatDate(addDays(addMonths(s, 1), -1)) === end
    const nextEnd = monthly
      ? addDays(addMonths(nextStart, 1), -1)
      : addDays(nextStart, Math.round((e.getTime() - s.getTime()) / 86_400_000))
    return { start_date: formatDate(nextStart), end_date: formatDate(nextEnd) }
  }
  if (end) {
    const e = parseDate(end)
    return { start_date: formatDate(addDays(e, 1)), end_date: formatDate(addMonths(e, 1)) }
  }
  return { start_date: null, end_date: null }
}

export function isOverdue(task: Task, status: Status | undefined): boolean {
  if (!task.end_date || status?.is_final) return false
  return new Date(task.end_date) < new Date(new Date().toDateString())
}

export const SUBTASKS: [string, string, string] = ['подзадача', 'подзадачи', 'подзадач']

/** удаление спринта уносит и его подзадачи — об этом надо сказать до нажатия, а не после */
export function deleteDescription(subtaskCount: number): string {
  if (subtaskCount === 0) return 'Вместе с задачей удалится вся история трекинга по ней.'
  const one = subtaskCount % 10 === 1 && subtaskCount % 100 !== 11
  return `Вместе с задачей ${one ? 'удалится' : 'удалятся'} ${plural(subtaskCount, SUBTASKS)} и вся история трекинга по ним.`
}
