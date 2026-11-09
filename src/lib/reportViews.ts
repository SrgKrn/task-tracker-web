/**
 * Разрезы для экрана «Сводка» (0.66): фильтр по значениям групп и задачам, «куда ушло
 * время» по любой группе или по задачам, таблица часов по задачам с подзадачами.
 *
 * Всё считается на клиенте из уже загруженных записей: щёлкнуть клиента, сменить разрез или
 * отсортировать таблицу — мгновенно, без запросов. Фильтр применяется ДО buildReport, поэтому
 * все цифры экрана, PDF и Excel считаются по одному и тому же срезу.
 */
import type { GroupModel } from './groups'
import { entryMinutes } from './time'
import type { Status, Task, TimeEntry } from './types'

export interface ReportFilter {
  /** значения групп: внутри одной группы — «или», между группами — «и» */
  items: string[]
  /** головные задачи (спринты); подзадачи входят вместе со своим спринтом */
  tasks: string[]
}

export const EMPTY_FILTER: ReportFilter = { items: [], tasks: [] }

export function isFilterEmpty(f: ReportFilter): boolean {
  return f.items.length === 0 && f.tasks.length === 0
}

export function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

/** id спринта задачи: у подзадачи — родитель, у спринта — он сам */
function headId(t: Pick<Task, 'id' | 'parent_id'>): string {
  return t.parent_id ?? t.id
}

/**
 * Какие задачи проходят фильтр. Значения групп у подзадачи те же, что у спринта (держит
 * база), но на всякий случай смотрим и на значения спринта.
 */
export function taskMatcher(
  tasks: Task[],
  itemGroup: (itemId: string) => string | undefined,
  filter: ReportFilter,
): (taskId: string) => boolean {
  if (isFilterEmpty(filter)) return () => true
  const byId = new Map(tasks.map((t) => [t.id, t]))
  // выбранные значения по группам
  const wanted = new Map<string, Set<string>>()
  for (const id of filter.items) {
    const g = itemGroup(id)
    if (!g) continue
    wanted.set(g, (wanted.get(g) ?? new Set()).add(id))
  }
  const heads = new Set(filter.tasks)
  const cache = new Map<string, boolean>()
  return (taskId: string) => {
    const hit = cache.get(taskId)
    if (hit !== undefined) return hit
    const t = byId.get(taskId)
    let ok = !!t
    if (t && heads.size > 0) ok = heads.has(headId(t))
    if (t && ok && wanted.size > 0) {
      const head = t.parent_id ? byId.get(t.parent_id) : undefined
      const own = new Set([...t.item_ids, ...(head?.item_ids ?? [])])
      for (const set of wanted.values()) {
        if (![...set].some((id) => own.has(id))) {
          ok = false
          break
        }
      }
    }
    cache.set(taskId, ok)
    return ok
  }
}

/** Срез: только задачи фильтра (спринты — вместе с подзадачами) и их записи. */
export function applyFilter<E extends Pick<TimeEntry, 'task_id'>>(
  tasks: Task[],
  entries: E[],
  itemGroup: (itemId: string) => string | undefined,
  filter: ReportFilter,
): { tasks: Task[]; entries: E[] } {
  if (isFilterEmpty(filter)) return { tasks, entries }
  const match = taskMatcher(tasks, itemGroup, filter)
  return { tasks: tasks.filter((t) => match(t.id)), entries: entries.filter((e) => match(e.task_id)) }
}

/* ── «куда ушло время» ───────────────────────────────────────────── */

export type BreakdownDim = { kind: 'group'; groupId: string } | { kind: 'task' }

export interface BreakdownRow {
  /** id значения группы или спринта; '' — «не указано» */
  id: string
  name: string
  color: string | null
  hours: number
  prevHours: number
  share: number
  /** сколько спринтов набрали часы внутри строки */
  tasks: number
}

export function breakdown(
  dim: BreakdownDim,
  current: TimeEntry[],
  previous: TimeEntry[],
  tasks: Task[],
  model: Pick<GroupModel, 'valueOf' | 'itemById'>,
): BreakdownRow[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const keyOf = (taskId: string): { id: string; name: string; color: string | null } => {
    const t = byId.get(taskId)
    if (!t) return { id: '', name: 'Удалённые задачи', color: null }
    const head = t.parent_id ? (byId.get(t.parent_id) ?? t) : t
    if (dim.kind === 'task') return { id: head.id, name: head.name.trim(), color: null }
    const v = model.valueOf(t, dim.groupId) ?? model.valueOf(head, dim.groupId)
    return v ? { id: v.id, name: v.name, color: v.color ?? null } : { id: '', name: 'Не указано', color: null }
  }
  const rows = new Map<string, BreakdownRow & { heads: Set<string> }>()
  const row = (k: { id: string; name: string; color: string | null }) => {
    let r = rows.get(k.id)
    if (!r) {
      r = { ...k, hours: 0, prevHours: 0, share: 0, tasks: 0, heads: new Set() }
      rows.set(k.id, r)
    }
    return r
  }
  let total = 0
  for (const e of current) {
    const h = entryMinutes(e) / 60
    const r = row(keyOf(e.task_id))
    r.hours += h
    total += h
    const t = byId.get(e.task_id)
    if (t && h > 0) r.heads.add(headId(t))
  }
  for (const e of previous) row(keyOf(e.task_id)).prevHours += entryMinutes(e) / 60
  return [...rows.values()]
    .filter((r) => Math.abs(r.hours) > 0.004 || Math.abs(r.prevHours) > 0.004)
    .map(({ heads, ...r }) => ({ ...r, tasks: heads.size, share: total > 0 ? r.hours / total : 0 }))
    .sort((a, b) => b.hours - a.hours || b.prevHours - a.prevHours)
}

/* ── часы по задачам ─────────────────────────────────────────────── */

export interface TaskHoursRow {
  id: string
  name: string
  /** часы за период — у спринта вместе с подзадачами */
  hours: number
  /** записей учёта за период */
  sessions: number
  /** дней, в которые по задаче шёл учёт */
  days: number
  lastDate: string | null
  plan: number
  /** факт за всё время (у спринта — с подзадачами) */
  factTotal: number
  stage: string | null
  isFinal: boolean
  /** значения групп задачи — для подписи и фильтра */
  itemIds: string[]
  children: TaskHoursRow[]
}

export type TaskSortKey = 'hours' | 'name' | 'plan' | 'last'

export function taskHours(current: TimeEntry[], tasks: Task[], statuses: Status[]): TaskHoursRow[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const statusById = new Map(statuses.map((s) => [s.id, s]))
  const acc = new Map<string, { minutes: number; sessions: number; days: Set<string>; last: string | null }>()
  const bump = (id: string, e: TimeEntry) => {
    const a = acc.get(id) ?? { minutes: 0, sessions: 0, days: new Set<string>(), last: null }
    a.minutes += entryMinutes(e)
    a.sessions += 1
    a.days.add(e.effective_date)
    if (!a.last || e.effective_date > a.last) a.last = e.effective_date
    acc.set(id, a)
  }
  for (const e of current) {
    const t = byId.get(e.task_id)
    if (!t) continue
    bump(t.id, e)
    if (t.parent_id) bump(`head:${t.parent_id}`, e)
    else bump(`head:${t.id}`, e)
  }
  const children = new Map<string, Task[]>()
  for (const t of tasks) if (t.parent_id) children.set(t.parent_id, [...(children.get(t.parent_id) ?? []), t])

  const make = (t: Task, a: ReturnType<typeof acc.get>, kids: TaskHoursRow[]): TaskHoursRow => {
    const status = t.status_id ? statusById.get(t.status_id) : undefined
    const factTotal = t.parent_id ? t.fact_hours : (children.get(t.id) ?? []).reduce((s, c) => s + c.fact_hours, t.fact_hours)
    return {
      id: t.id,
      name: t.name.trim(),
      hours: (a?.minutes ?? 0) / 60,
      sessions: a?.sessions ?? 0,
      days: a?.days.size ?? 0,
      lastDate: a?.last ?? null,
      plan: t.planned_hours,
      factTotal,
      stage: status?.label ?? null,
      isFinal: !!status?.is_final,
      itemIds: t.item_ids,
      children: kids,
    }
  }

  const out: TaskHoursRow[] = []
  for (const t of tasks) {
    if (t.parent_id) continue
    const total = acc.get(`head:${t.id}`)
    if (!total) continue
    const kids = (children.get(t.id) ?? [])
      .map((c) => ({ c, a: acc.get(c.id) }))
      .filter((x) => !!x.a)
      .map((x) => make(x.c, x.a, []))
      .sort((a, b) => b.hours - a.hours)
    out.push(make(t, total, kids))
  }
  return out
}

export function sortTaskHours(rows: TaskHoursRow[], key: TaskSortKey, desc: boolean): TaskHoursRow[] {
  const dir = desc ? -1 : 1
  const cmp = (a: TaskHoursRow, b: TaskHoursRow): number => {
    if (key === 'name') return a.name.localeCompare(b.name, 'ru') * dir
    if (key === 'plan') return (a.plan - b.plan) * dir || b.hours - a.hours
    if (key === 'last') return (a.lastDate ?? '').localeCompare(b.lastDate ?? '') * dir
    return (a.hours - b.hours) * dir
  }
  return [...rows].sort(cmp).map((r) => ({ ...r, children: [...r.children].sort(cmp) }))
}

/** поиск по названию спринта и подзадач: подходящая подзадача оставляет свой спринт */
export function searchTaskHours(rows: TaskHoursRow[], query: string): TaskHoursRow[] {
  const q = query.trim().toLocaleLowerCase('ru')
  if (!q) return rows
  return rows.flatMap((r) => {
    if (r.name.toLocaleLowerCase('ru').includes(q)) return [r]
    const kids = r.children.filter((c) => c.name.toLocaleLowerCase('ru').includes(q))
    return kids.length ? [{ ...r, children: kids }] : []
  })
}

/* ── столбики: по дням, неделям или месяцам ──────────────────────── */

export type Grain = 'day' | 'week' | 'month'

export interface ChartSeries {
  key: string
  name: string
  /** 'label-N' значения группы; null — нейтральный */
  color: string | null
}

export interface Bucket {
  from: string
  to: string
  /** подпись под столбиком: «9», «2–8», «ноя» */
  label: string
  hours: number
  /** норма отрезка; null — нормы нет */
  norm: number | null
  weekend: boolean
  /** часы по сериям — в порядке series */
  parts: number[]
}

const MONTHS_3 = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']

interface DayIn {
  date: string
  day: number
  weekend: boolean
  hours: number
  norm: number
}
interface ClientIn {
  key: string
  name: string
  color: string | null
  hours: number
  byDay: number[]
}

/** до 45 дней — по дням, до полугода — по неделям, дальше — по месяцам */
export function grainFor(days: number): Grain {
  return days <= 45 ? 'day' : days <= 190 ? 'week' : 'month'
}

export function bucketize(
  days: DayIn[],
  clients: ClientIn[],
  hasNorm: boolean,
  maxSeries = 6,
): { grain: Grain; series: ChartSeries[]; buckets: Bucket[] } {
  const grain = grainFor(days.length)
  const ranked = clients.filter((c) => c.hours > 0.004)
  const top = ranked.slice(0, maxSeries)
  const rest = ranked.slice(maxSeries)
  const series: ChartSeries[] = top.map((c) => ({ key: c.key, name: c.name, color: c.color }))
  if (rest.length) series.push({ key: 'other', name: `Остальные (${rest.length})`, color: null })
  const partsAt = (i: number) => {
    const p = top.map((c) => Math.max(0, c.byDay[i] ?? 0))
    if (rest.length) p.push(rest.reduce((s, c) => s + Math.max(0, c.byDay[i] ?? 0), 0))
    return p
  }
  const buckets: Bucket[] = []
  days.forEach((d, i) => {
    const [y, m] = d.date.split('-').map(Number)
    const dow = new Date(y, m - 1, d.day).getDay()
    const last = buckets[buckets.length - 1]
    const fresh =
      !last || grain === 'day' || (grain === 'week' ? dow === 1 : d.date.slice(0, 7) !== last.from.slice(0, 7))
    if (fresh) {
      buckets.push({
        from: d.date,
        to: d.date,
        label: grain === 'month' ? MONTHS_3[m - 1] : String(d.day),
        hours: d.hours,
        norm: hasNorm ? d.norm : null,
        weekend: grain === 'day' && d.weekend,
        parts: partsAt(i),
      })
    } else {
      last.to = d.date
      last.hours += d.hours
      if (last.norm !== null) last.norm += d.norm
      partsAt(i).forEach((v, k) => (last.parts[k] += v))
      if (grain === 'week') last.label = `${Number(last.from.slice(8))}–${d.day}`
    }
  })
  return { grain, series, buckets }
}
