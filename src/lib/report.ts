import { buildGroupModel } from './groups'
import { entryNote } from './notes'
import { overlapsPeriod, toDateString } from './period'
import type { Comment, Group, GroupItem, Status, Task, TimeEntry } from './types'

/**
 * Отчёт за период: всё, что потом рисуют PDF и Excel, считается здесь — одним проходом
 * и без обращений к базе. Выгрузки только раскладывают готовые числа по страницам и листам,
 * поэтому PDF и Excel не могут разойтись между собой.
 */

export interface ReportOptions {
  /** «Что проверить»: ночные сессии таймера, дни в минусе, будни без записей */
  includeChecks: boolean
  /** комментарии к задачам и к сессиям учёта в журнале — пишутся для себя и бывают неформальными */
  includeComments: boolean
}

export interface ReportInput {
  from: string
  to: string
  tasks: Task[]
  /** группы по порядку: первая — верхний уровень отчёта, вторая — то, что внутри */
  groups: Group[]
  items: GroupItem[]
  statuses: Status[]
  /** записи за [начало прошлого периода, конец текущего] — текущий период и то, с чем сравниваем */
  entries: TimeEntry[]
  /** комментарии за период; пусто, если в отчёт они не идут */
  comments: Comment[]
  /** задачи, переведённые в финальный статус внутри периода */
  closedTaskIds: string[]
  /** самая ранняя запись в базе — по ней видно, что прошлый период учтён не целиком */
  firstEntryDate: string | null
  perDay: number | null
  perMonth: number | null
  generatedAt: Date
  options: ReportOptions
}

export interface DayPoint {
  date: string
  day: number
  weekday: string
  weekend: boolean
  hours: number
  timer: number
  added: number
  /** отрицательное число: сколько убрано правками */
  removed: number
  norm: number
}

export interface WeekPoint {
  label: string
  from: string
  to: string
  hours: number
  norm: number | null
}

export interface DirectionRow {
  id: string
  name: string
  hours: number
  prevHours: number
  share: number
  prevShare: number
  /** сколько значений второй группы набрали часы внутри */
  childCount: number
}

export interface ProjectRow {
  id: string
  name: string
  hours: number
  prevHours: number
}

export interface DirectionGroup extends DirectionRow {
  rows: ProjectRow[]
  note: string
}

export type SprintGroup = 'over' | 'inplan' | 'noplan'

export interface SprintRow {
  id: string
  name: string
  /** значения первой и второй группы */
  outer: string
  inner: string
  plan: number
  /** факт за всё время спринта — план ведь тоже на весь спринт */
  factTotal: number
  factPeriod: number
  pct: number | null
  over: number
  status: string
  isFinal: boolean
  startDate: string | null
  endDate: string | null
  overdue: boolean
  group: SprintGroup
}

export interface JournalRow {
  title: string
  outer: string
  inner: string
  hours: number
  comments: string[]
}

export interface JournalDay {
  date: string
  label: string
  weekday: string
  total: number
  rows: JournalRow[]
}

export interface EntryRecord {
  date: string
  week: number
  weekday: string
  /** значения всех групп — по порядку ReportData.groupNames */
  dims: string[]
  sprint: string
  subtask: string
  hours: number
  source: 'таймер' | 'правка'
  start: string
  end: string
}

export interface ReportChecks {
  overnight: { date: string; task: string; hours: number; endedAt: string }[]
  negativeDays: { date: string; hours: number }[]
  emptyWeekdays: string[]
}

/** как называется группа в отчёте: «Проекты» и «Проект» */
export interface ReportDim {
  name: string
  item: string
}

export interface ReportData {
  from: string
  to: string
  label: string
  /** первая группа — верхний уровень, вторая — то, что внутри; без групп разрезов нет */
  outer: ReportDim | null
  inner: ReportDim | null
  /** все группы — колонки листа «Записи» */
  groupNames: string[]
  /** «август» или «прошлый период» — то, с чем сравниваем, в подписях колонок */
  prevName: string
  /** «к августу», «к прошлому периоду» */
  prevDative: string
  /** «с августом», «с прошлым периодом» */
  prevWith: string
  /** «сентябрь» или «этот период» — подпись текущего в легендах */
  curName: string
  prevFrom: string
  prevTo: string
  /** учёт начат внутри прошлого периода — сравнение с ним завышает рост */
  prevIncompleteSince: string | null
  generatedAt: Date
  options: ReportOptions

  total: number
  prevTotal: number
  target: { hours: number; label: string } | null
  dayNorm: number | null
  weekdays: number
  avgPerWeekday: number | null
  daysWithEntries: number

  closedCount: number
  inWorkCount: number
  overCount: number
  overHours: number
  overdueCount: number
  unplannedHours: number

  insights: string[]
  days: DayPoint[]
  weeks: WeekPoint[]
  directions: DirectionRow[]
  groups: DirectionGroup[]
  sprints: SprintRow[]

  composition: { timer: number; added: number; removed: number; sessions: number; manualCount: number }
  checks: ReportChecks | null
  journal: JournalDay[]
  records: EntryRecord[]
}

const MONTHS_NOM = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const MONTHS_INS = ['январём', 'февралём', 'мартом', 'апрелем', 'маем', 'июнем', 'июлем', 'августом', 'сентябрём', 'октябрём', 'ноябрём', 'декабрём']
const MONTHS_DAT = ['январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню', 'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
const WEEKDAYS_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

/* ── даты ─────────────────────────────────────────────────────────── */

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function addDays(iso: string, n: number): string {
  const d = parseDate(iso)
  return toDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n))
}

function daysOf(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

function isWeekend(iso: string): boolean {
  const dow = parseDate(iso).getDay()
  return dow === 0 || dow === 6
}

function lastDayOfMonth(iso: string): string {
  const d = parseDate(iso)
  return toDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

export function isWholeMonth(from: string, to: string): boolean {
  return from.endsWith('-01') && to === lastDayOfMonth(from)
}

/** ISO-неделя: Excel и календари считают именно так */
export function isoWeek(iso: string): number {
  const d = parseDate(iso)
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

/**
 * С чем сравнивать. Целый месяц — с прошлым целым месяцем, хотя дней в них может быть
 * разное число: сентябрь с августом сравнивают именно так. Любой другой отрезок —
 * с отрезком той же длины прямо перед ним.
 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  if (isWholeMonth(from, to)) {
    const d = parseDate(from)
    const prevFrom = toDateString(new Date(d.getFullYear(), d.getMonth() - 1, 1))
    return { from: prevFrom, to: lastDayOfMonth(prevFrom) }
  }
  const length = daysOf(from, to).length
  return { from: addDays(from, -length), to: addDays(from, -1) }
}

/** «Сентябрь 2026», «1–14 сентября 2026», «28 сентября – 4 октября 2026» */
export function periodLabel(from: string, to: string): string {
  const a = parseDate(from)
  const b = parseDate(to)
  if (isWholeMonth(from, to)) {
    const m = MONTHS_NOM[a.getMonth()]
    return `${m[0].toUpperCase()}${m.slice(1)} ${a.getFullYear()}`
  }
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return from === to
      ? `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} ${a.getFullYear()}`
      : `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[a.getMonth()]} ${a.getFullYear()}`
  }
  if (a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]} ${b.getFullYear()}`
  }
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]} ${b.getFullYear()}`
}

/** «1–6 сен», «28 сен – 4 окт» */
function shortRange(from: string, to: string): string {
  const a = parseDate(from)
  const b = parseDate(to)
  if (from === to) return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]}`
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS_SHORT[a.getMonth()]}`
  return `${a.getDate()} ${MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${MONTHS_SHORT[b.getMonth()]}`
}

/** «28 сентября, понедельник» */
function dayLabel(iso: string): string {
  const d = parseDate(iso)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WEEKDAYS_FULL[d.getDay()]}`
}

/** «26 августа» */
export function dayMonth(iso: string): string {
  const d = parseDate(iso)
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

/* ── числа ────────────────────────────────────────────────────────── */

/** часы одним знаком после запятой и с настоящим минусом: «168,6», «−7,0» */
export function f1(hours: number): string {
  const v = Math.round(hours * 10) / 10
  return (Object.is(v, -0) ? 0 : v).toFixed(1).replace('.', ',').replace('-', '−')
}

/** «3 ч 54 мин», «15 мин» — для журнала, где правят четвертями часа */
export function hm(hours: number): string {
  const total = Math.round(Math.abs(hours) * 60)
  const h = Math.floor(total / 60)
  const m = total % 60
  const sign = hours < 0 && total > 0 ? '−' : ''
  if (h === 0) return `${sign}${m} мин`
  return `${sign}${h} ч${m ? ` ${m} мин` : ''}`
}

/** «140» вместо «140,0» — для целых норм и целей */
export function fh(hours: number): string {
  return f1(hours).replace(/,0$/, '')
}

/** «1 октября 2026, 11:19» — без «г.» и «в», которые подставляет toLocaleString */
export function formatStamp(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}, ${hh}:${mm}`
}

/** доля в процентах для подписи; меньше полупроцента — «<1%», а не обманчивый «0%» */
export function pctLabel(part: number, whole: number): string {
  if (whole <= 0 || part <= 0) return '0%'
  const v = (part / whole) * 100
  return v < 0.5 ? '<1%' : `${Math.round(v)}%`
}

export function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

const toHours = (minutes: number) => minutes / 60

function localTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/* ── сборка ───────────────────────────────────────────────────────── */

export function buildReport(input: ReportInput): ReportData {
  const { from, to, tasks, statuses, options } = input
  const prev = previousPeriod(from, to)
  const whole = isWholeMonth(from, to)
  const prevMonth = parseDate(prev.from).getMonth()
  const prevName = whole ? MONTHS_NOM[prevMonth] : 'прошлый период'
  const prevDative = whole ? MONTHS_DAT[prevMonth] : 'прошлому периоду'
  const prevWith = whole ? MONTHS_INS[prevMonth] : 'прошлым периодом'
  const curName = whole ? MONTHS_NOM[parseDate(from).getMonth()] : 'этот период'

  const taskById = new Map(tasks.map((t) => [t.id, t]))
  const model = buildGroupModel(input.groups, input.items)
  const outerGroup = input.groups[0] ?? null
  const innerGroup = input.groups[1] ?? null
  const itemName = (id: string) => model.itemById.get(id)?.name ?? 'Не указано'
  /** id значения задачи в группе; '' — не указано */
  const valueId = (task: Task | undefined, group: Group | null) =>
    task && group ? (model.valueOf(task, group.id)?.id ?? '') : ''
  const valueName = (task: Task | undefined, group: Group | null) =>
    task && group ? (model.valueOf(task, group.id)?.name ?? '') : ''
  const statusById = new Map(statuses.map((s) => [s.id, s]))
  const headOf = (taskId: string): Task | undefined => {
    const t = taskById.get(taskId)
    return t?.parent_id ? (taskById.get(t.parent_id) ?? t) : t
  }

  const current = input.entries.filter((e) => e.effective_date >= from && e.effective_date <= to)
  const previous = input.entries.filter((e) => e.effective_date >= prev.from && e.effective_date <= prev.to)
  const sumHours = (list: TimeEntry[]) => toHours(list.reduce((s, e) => s + e.duration_minutes, 0))
  const total = sumHours(current)
  const prevTotal = sumHours(previous)

  // ── норма и цель
  const days = daysOf(from, to)
  const weekdays = days.filter((d) => !isWeekend(d)).length
  const weekdaysInMonth = daysOf(from.slice(0, 8) + '01', lastDayOfMonth(from)).filter((d) => !isWeekend(d)).length
  const dayNorm = input.perDay ?? (input.perMonth ? input.perMonth / weekdaysInMonth : null)
  const target =
    whole && input.perMonth
      ? { hours: input.perMonth, label: 'месячной цели' }
      : input.perDay
        ? { hours: input.perDay * weekdays, label: 'нормы' }
        : input.perMonth
          ? { hours: (input.perMonth * weekdays) / weekdaysInMonth, label: 'цели' }
          : null

  // ── по дням
  const byDay = new Map<string, { net: number; timer: number; added: number; removed: number }>()
  for (const e of current) {
    const b = byDay.get(e.effective_date) ?? { net: 0, timer: 0, added: 0, removed: 0 }
    b.net += e.duration_minutes
    if (e.entry_type === 'timer') b.timer += e.duration_minutes
    else if (e.duration_minutes > 0) b.added += e.duration_minutes
    else b.removed += e.duration_minutes
    byDay.set(e.effective_date, b)
  }
  const dayPoints: DayPoint[] = days.map((date) => {
    const b = byDay.get(date)
    const d = parseDate(date)
    const weekend = isWeekend(date)
    return {
      date,
      day: d.getDate(),
      weekday: WEEKDAYS_SHORT[d.getDay()],
      weekend,
      hours: toHours(b?.net ?? 0),
      timer: toHours(b?.timer ?? 0),
      added: toHours(b?.added ?? 0),
      removed: toHours(b?.removed ?? 0),
      norm: weekend || dayNorm === null ? 0 : dayNorm,
    }
  })

  // ── по неделям: неделя с понедельника, крайние недели обрезаны периодом
  const weeks: WeekPoint[] = []
  for (const p of dayPoints) {
    const last = weeks[weeks.length - 1]
    if (!last || parseDate(p.date).getDay() === 1) {
      weeks.push({ label: '', from: p.date, to: p.date, hours: p.hours, norm: dayNorm === null ? null : p.norm })
    } else {
      last.to = p.date
      last.hours += p.hours
      if (last.norm !== null) last.norm += p.norm
    }
  }
  for (const w of weeks) w.label = shortRange(w.from, w.to)

  // ── разрезы: первая группа и вторая внутри неё
  const sectionOf = (e: TimeEntry) => valueId(taskById.get(e.task_id), outerGroup)
  const projectOf = (e: TimeEntry) => valueId(taskById.get(e.task_id), innerGroup)
  const tally = (list: TimeEntry[], key: (e: TimeEntry) => string) => {
    const m = new Map<string, number>()
    for (const e of list) m.set(key(e), (m.get(key(e)) ?? 0) + e.duration_minutes)
    return m
  }
  const secCur = tally(current, sectionOf)
  const secPrev = tally(previous, sectionOf)
  const pairCur = tally(current, (e) => `${sectionOf(e)}|${projectOf(e)}`)
  const pairPrev = tally(previous, (e) => `${sectionOf(e)}|${projectOf(e)}`)
  const projCur = tally(current, projectOf)

  // часы без плана: спринт (или его подзадача), у которого план не задан
  const unplannedBySection = new Map<string, number>()
  let unplannedMinutes = 0
  for (const e of current) {
    const head = headOf(e.task_id)
    if (head && head.planned_hours <= 0) {
      unplannedMinutes += e.duration_minutes
      const key = valueId(head, outerGroup)
      unplannedBySection.set(key, (unplannedBySection.get(key) ?? 0) + e.duration_minutes)
    }
  }

  // без групп разрезов нет; «не указано» — честная строка, а не потерянные часы
  const sectionIds = outerGroup ? new Set([...secCur.keys(), ...secPrev.keys()]) : new Set<string>()
  const directions: DirectionRow[] = [...sectionIds]
    .map((id) => {
      const hours = toHours(secCur.get(id) ?? 0)
      const prevHours = toHours(secPrev.get(id) ?? 0)
      const childCount = innerGroup
        ? [...pairCur.entries()].filter(([k, v]) => k.startsWith(`${id}|`) && v > 0).length
        : 0
      return {
        id,
        name: id ? itemName(id) : 'Не указано',
        hours,
        prevHours,
        share: total > 0 ? hours / total : 0,
        prevShare: prevTotal > 0 ? prevHours / prevTotal : 0,
        childCount,
      }
    })
    .filter((d) => Math.abs(d.hours) > 0.004 || Math.abs(d.prevHours) > 0.004)
    .sort((a, b) => b.hours - a.hours || b.prevHours - a.prevHours)

  const groups: DirectionGroup[] = directions.map((d) => {
    const keys = innerGroup
      ? new Set([...pairCur.keys(), ...pairPrev.keys()].filter((k) => k.startsWith(`${d.id}|`)))
      : new Set<string>()
    const rows: ProjectRow[] = [...keys]
      .map((k) => {
        const projectId = k.split('|')[1]
        return {
          id: projectId,
          name: projectId ? itemName(projectId) : 'Не указано',
          hours: toHours(pairCur.get(k) ?? 0),
          prevHours: toHours(pairPrev.get(k) ?? 0),
        }
      })
      .filter((r) => Math.abs(r.hours) > 0.004 || Math.abs(r.prevHours) > 0.004)
      .sort((a, b) => b.hours - a.hours || b.prevHours - a.prevHours)
    return { ...d, rows, note: groupNote(d, rows, toHours(unplannedBySection.get(d.id) ?? 0), innerGroup) }
  })

  // ── спринты: головные задачи периода, факт — с подзадачами
  const children = new Map<string, Task[]>()
  for (const t of tasks) {
    if (!t.parent_id) continue
    children.set(t.parent_id, [...(children.get(t.parent_id) ?? []), t])
  }
  const headPeriodMinutes = new Map<string, number>()
  for (const e of current) {
    const head = headOf(e.task_id)
    if (head) headPeriodMinutes.set(head.id, (headPeriodMinutes.get(head.id) ?? 0) + e.duration_minutes)
  }
  const closedIds = new Set(input.closedTaskIds)
  const sprints: SprintRow[] = tasks
    .filter((t) => !t.parent_id)
    .filter((t) => {
      if (headPeriodMinutes.has(t.id)) return true
      // без часов в периоде спринт попадает в отчёт, только если он про этот период:
      // срок пересекается с ним и спринт ещё открыт или закрыт как раз сейчас
      if (!t.start_date && !t.end_date) return false
      const isFinal = !!(t.status_id && statusById.get(t.status_id)?.is_final)
      return overlapsPeriod(t, from, to) && (!isFinal || closedIds.has(t.id))
    })
    .map((t) => {
      const status = t.status_id ? statusById.get(t.status_id) : undefined
      const isFinal = !!status?.is_final
      const factTotal = (children.get(t.id) ?? []).reduce((s, c) => s + c.fact_hours, t.fact_hours)
      const plan = t.planned_hours
      const pctOfPlan = plan > 0 ? Math.round((factTotal / plan) * 100) : null
      const over = plan > 0 ? Math.max(0, factTotal - plan) : 0
      return {
        id: t.id,
        name: t.name.trim(),
        outer: valueName(t, outerGroup),
        inner: valueName(t, innerGroup),
        plan,
        factTotal,
        factPeriod: toHours(headPeriodMinutes.get(t.id) ?? 0),
        pct: pctOfPlan,
        over,
        status: status ? (isFinal ? 'закрыт' : status.label) : 'без статуса',
        isFinal,
        startDate: t.start_date,
        endDate: t.end_date,
        overdue: !isFinal && !!t.end_date && t.end_date < to,
        group: (plan <= 0 ? 'noplan' : over > 1 / 120 ? 'over' : 'inplan') as SprintGroup,
      }
    })
  const order: Record<SprintGroup, number> = { over: 0, inplan: 1, noplan: 2 }
  sprints.sort(
    (a, b) =>
      order[a.group] - order[b.group] ||
      (b.pct ?? 0) - (a.pct ?? 0) ||
      b.factPeriod - a.factPeriod,
  )

  const overRows = sprints.filter((s) => s.group === 'over')
  const headIds = new Set(tasks.filter((t) => !t.parent_id).map((t) => t.id))

  // ── как набраны часы
  const composition = { timer: 0, added: 0, removed: 0, sessions: 0, manualCount: 0 }
  for (const e of current) {
    if (e.entry_type === 'timer') {
      composition.timer += toHours(e.duration_minutes)
      composition.sessions += 1
    } else {
      composition.manualCount += 1
      if (e.duration_minutes > 0) composition.added += toHours(e.duration_minutes)
      else composition.removed += toHours(e.duration_minutes)
    }
  }

  // ── что проверить
  let checks: ReportChecks | null = null
  if (options.includeChecks) {
    const today = toDateString(input.generatedAt)
    const lastDay = to < today ? to : today
    const daysWithEntries = new Set(current.map((e) => e.effective_date))
    checks = {
      overnight: current
        .filter((e) => {
          if (e.entry_type !== 'timer' || !e.started_at || !e.ended_at || e.duration_minutes < 180) return false
          return toDateString(new Date(e.ended_at)) > toDateString(new Date(e.started_at))
        })
        .map((e) => ({
          date: e.effective_date,
          task: taskById.get(e.task_id)?.name.trim() ?? '',
          hours: toHours(e.duration_minutes),
          endedAt: localTime(e.ended_at),
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      negativeDays: dayPoints.filter((d) => d.hours < -0.004).map((d) => ({ date: d.date, hours: d.hours })),
      emptyWeekdays: days.filter((d) => d <= lastDay && !isWeekend(d) && !daysWithEntries.has(d)),
    }
  }

  // ── журнал: задача за день одной строкой, правки уже внутри
  const commentsByKey = new Map<string, string[]>()
  if (options.includeComments) {
    for (const c of input.comments) {
      const key = `${toDateString(new Date(c.created_at))}|${c.task_id}`
      commentsByKey.set(key, [...(commentsByKey.get(key) ?? []), c.body.trim()])
    }
    // комментарий к сессии учёта — в тот же день, что и сама сессия
    for (const e of current) {
      const note = entryNote(e)
      if (!note) continue
      const key = `${e.effective_date}|${e.task_id}`
      commentsByKey.set(key, [...(commentsByKey.get(key) ?? []), note])
    }
  }
  const dayTask = new Map<string, number>()
  for (const e of current) {
    const key = `${e.effective_date}|${e.task_id}`
    dayTask.set(key, (dayTask.get(key) ?? 0) + e.duration_minutes)
  }
  // комментарий без часов в тот день тоже попадает в журнал — иначе он бы потерялся
  for (const key of commentsByKey.keys()) {
    const date = key.split('|')[0]
    if (date >= from && date <= to && !dayTask.has(key)) dayTask.set(key, 0)
  }
  const journalDays = new Map<string, JournalRow[]>()
  for (const [key, minutes] of dayTask) {
    const [date, taskId] = key.split('|')
    const comments = commentsByKey.get(key) ?? []
    if (minutes === 0 && comments.length === 0) continue
    const task = taskById.get(taskId)
    const head = headOf(taskId)
    const title = task?.parent_id && head ? `${head.name.trim()} / ${task.name.trim()}` : (task?.name.trim() ?? 'Удалённая задача')
    const row: JournalRow = {
      title,
      outer: valueName(task, outerGroup),
      inner: valueName(task, innerGroup),
      hours: toHours(minutes),
      comments,
    }
    journalDays.set(date, [...(journalDays.get(date) ?? []), row])
  }
  const journal: JournalDay[] = [...journalDays.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => ({
      date,
      label: dayLabel(date),
      weekday: WEEKDAYS_SHORT[parseDate(date).getDay()],
      total: rows.reduce((s, r) => s + r.hours, 0),
      rows: rows.sort((a, b) => b.hours - a.hours),
    }))

  // ── все записи плоско — для сводных таблиц в Excel
  const records: EntryRecord[] = current
    .map((e) => {
      const task = taskById.get(e.task_id)
      const head = headOf(e.task_id)
      return {
        date: e.effective_date,
        week: isoWeek(e.effective_date),
        weekday: WEEKDAYS_SHORT[parseDate(e.effective_date).getDay()],
        dims: input.groups.map((g) => valueName(task, g)),
        sprint: head?.name.trim() ?? 'Удалённая задача',
        subtask: task?.parent_id ? task.name.trim() : '',
        hours: toHours(e.duration_minutes),
        source: (e.entry_type === 'timer' ? 'таймер' : 'правка') as EntryRecord['source'],
        start: e.entry_type === 'timer' ? localTime(e.started_at) : '',
        end: e.entry_type === 'timer' ? localTime(e.ended_at) : '',
        sortKey: `${e.effective_date} ${e.started_at ?? e.created_at}`,
      }
    })
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    .map(({ sortKey: _sortKey, ...rest }) => rest)

  const prevIncompleteSince =
    prevTotal > 0 && input.firstEntryDate && input.firstEntryDate > prev.from && input.firstEntryDate <= prev.to
      ? input.firstEntryDate
      : null

  // «больше всего часов ушло на…» — по второй группе: она обычно конкретнее первой
  const projectTotals = innerGroup
    ? [...projCur.entries()]
        .filter(([id]) => !!id)
        .map(([id, minutes]) => ({ name: itemName(id), hours: toHours(minutes) }))
        .sort((a, b) => b.hours - a.hours)
    : []

  const report: ReportData = {
    from,
    to,
    label: periodLabel(from, to),
    outer: outerGroup ? { name: outerGroup.name, item: outerGroup.item_name } : null,
    inner: innerGroup ? { name: innerGroup.name, item: innerGroup.item_name } : null,
    groupNames: input.groups.map((g) => g.name),
    prevName,
    prevDative,
    prevWith,
    curName,
    prevFrom: prev.from,
    prevTo: prev.to,
    prevIncompleteSince,
    generatedAt: input.generatedAt,
    options,
    total,
    prevTotal,
    target,
    dayNorm,
    weekdays,
    avgPerWeekday: weekdays > 0 ? total / weekdays : null,
    daysWithEntries: new Set(current.filter((e) => e.duration_minutes > 0).map((e) => e.effective_date)).size,
    closedCount: [...closedIds].filter((id) => headIds.has(id)).length,
    inWorkCount: sprints.length,
    overCount: overRows.length,
    overHours: overRows.reduce((s, r) => s + r.over, 0),
    overdueCount: sprints.filter((s) => s.overdue).length,
    unplannedHours: toHours(unplannedMinutes),
    insights: [],
    days: dayPoints,
    weeks,
    directions,
    groups,
    sprints,
    composition,
    checks,
    journal,
    records,
  }
  report.insights = buildInsights(report, projectTotals)
  return report
}

/**
 * Выводы для первой страницы. Каждый — по жёсткому правилу и шаблону: отчёт ничего
 * не додумывает, он только называет то, что видно в цифрах.
 */
function buildInsights(r: ReportData, projectTotals: { name: string; hours: number }[]): string[] {
  const out: string[] = []
  const top = r.directions.find((d) => d.id) ?? r.directions[0]
  const what = (name: string) => (r.outer ? `${r.outer.item} «${name}»` : `«${name}»`)

  if (top && r.prevTotal > 0) {
    const biggest = [...r.directions].sort(
      (a, b) => Math.abs(b.hours - b.prevHours) - Math.abs(a.hours - a.prevHours),
    )[0]
    const delta = biggest.hours - biggest.prevHours
    if (Math.abs(delta) >= Math.max(2, r.total * 0.05)) {
      const ratio = biggest.prevHours > 0 ? biggest.hours / biggest.prevHours : Infinity
      const prevTop = [...r.directions].sort((a, b) => b.prevHours - a.prevHours)[0]
      const from = `с ${f1(biggest.prevHours)} до ${f1(biggest.hours)} ч`
      let s: string
      if (delta > 0) {
        s = ratio >= 3
          ? `${what(biggest.name)}: часов втрое больше — ${from}`
          : ratio >= 2
            ? `${what(biggest.name)}: часов вдвое больше — ${from}`
            : `${what(biggest.name)}: на ${f1(delta)} ч больше — ${from}`
        s += biggest.id === top.id && prevTop.id !== top.id
          ? ` — теперь это главное: ${pct(top.hours, r.total)}% времени.`
          : '.'
      } else {
        s = ratio <= 0.5
          ? `${what(biggest.name)}: часов вдвое меньше — ${from}.`
          : `${what(biggest.name)}: на ${f1(-delta)} ч меньше — ${from}.`
      }
      out.push(s)
    }
  }
  if (out.length === 0 && top && r.total > 0) {
    out.push(`Больше всего времени — ${what(top.name).replace(/^./, (c) => c.toLowerCase())}: ${f1(top.hours)} ч, ${pct(top.hours, r.total)}%.`)
  }

  const topProject = projectTotals[0]
  if (topProject && topProject.hours > 0 && r.total > 0) {
    out.push(`Больше всего часов ушло на ${topProject.name} — ${f1(topProject.hours)} ч, ${pct(topProject.hours, r.total)}% времени.`)
  }

  const overs = r.sprints.filter((s) => s.group === 'over').sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
  const tag = (s: SprintRow) => [s.inner || s.outer, `${s.pct}%`].filter(Boolean).join(', ')
  if (overs.length >= 2) {
    const [a, b] = overs
    out.push(`Сильнее всего вышли за план «${a.name}» (${tag(a)}) и «${b.name}» (${tag(b)}).`)
  } else if (overs.length === 1) {
    const a = overs[0]
    out.push(`За план вышел только «${a.name}» (${tag(a)}), сверх плана ${f1(a.over)} ч.`)
  } else if (r.sprints.some((s) => s.plan > 0)) {
    out.push('Все спринты с планом уложились в него.')
  }

  if (r.total > 0 && r.unplannedHours / r.total >= 0.1) {
    out.push(`${pct(r.unplannedHours, r.total)}% времени — задачи без плана: ${f1(r.unplannedHours)} ч.`)
  }
  return out.slice(0, 4)
}

/** Одна-две фразы под строкой первой группы: из чего она состоит и на чём держится. */
function groupNote(d: DirectionRow, rows: ProjectRow[], unplanned: number, inner: Group | null): string {
  const active = rows.filter((r) => r.hours > 0.004)
  const dropped = rows.filter((r) => r.hours <= 0.004 && r.prevHours > 0.004)
  const parts: string[] = []

  if (active.length === 1) {
    parts.push(`Всё — ${active[0].name}.`)
  } else if (active.length >= 2) {
    const [a, b] = active
    const top2 = d.hours > 0 ? (a.hours + b.hours) / d.hours : 0
    if (active.length >= 3 && top2 >= 0.85) {
      parts.push(`${Math.round(top2 * 100)}% этих часов — ${a.name} и ${b.name}.`)
    } else {
      parts.push(`${inner?.name ?? 'Значений'}: ${active.length}, в среднем по ${f1(d.hours / active.length)} ч.`)
      if (d.hours > 0 && a.hours / d.hours >= 0.3) parts.push(`${a.name} — ${pct(a.hours, d.hours)}% этих часов.`)
    }
  }
  if (d.hours > 0 && unplanned / d.hours >= 0.3) {
    parts.push(`${f1(unplanned)} ч из ${f1(d.hours)} — задачи без плана.`)
  }
  if (dropped.length > 0) {
    parts.push(`${dropped.map((r) => r.name).join(', ')} — без часов в этом периоде.`)
  }
  return parts.join(' ')
}
