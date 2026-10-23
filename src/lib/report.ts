import { buildGroupModel } from './groups'
import { entryNote } from './notes'
import { formatDayMonth, overlapsPeriod, toDateString } from './period'
import { dayNormFor, DEFAULT_WORK_DAYS, isWorkday, periodNorm } from './norm'
import { entryMinutes } from './time'
import { billSprint, billTotals, resolveRate, type BillTotal, type SprintBill } from './rate'
import { stageTone, type StageTone } from './stage'
import { EFFORT_LABEL, QUADRANT, effortOf, quadrantOf } from './priority'
import { buildSegments, makeTile, type DayTile, type TileClient } from '../../supabase/functions/telegram/tile.ts'
import type { Comment, Group, GroupItem, PriorityMethod, Status, Task, TimeEntry } from './types'

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
  /** переработку сверх плана — в итог к оплате; по умолчанию нет: план — договорённость с клиентом */
  includeOvertime?: boolean
  /** какие листы PDF печатать (0.42); «Сводка» — всегда. Нет поля — все */
  sections?: ReportSections
}

export interface ReportSections {
  clients: boolean
  work: boolean
  billing: boolean
  journal: boolean
}

export const ALL_SECTIONS: ReportSections = { clients: true, work: true, billing: true, journal: true }

/** отрезок фокуса из журнала focus_sessions */
export interface FocusSessionInput {
  task_id: string | null
  mode: string
  started_at: string
  ended_at: string
  completed: boolean
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
  /** рабочих дней в неделе (1–7, с понедельника); по умолчанию пять */
  workDays?: number
  /** момент сборки; его дата — «сегодня», по ней видно, что период ещё идёт */
  generatedAt: Date
  options: ReportOptions
  /** отрезки фокуса за период (0.42); нет — блока «Фокус» нет */
  focusSessions?: FocusSessionInput[]
  /** id записей, засчитанных из встреч календаря */
  meetingEntryIds?: string[]
  /** методика приоритетов пространства — для блока «По методике» */
  priorityMethod?: PriorityMethod
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
  /** сумма к оплате; null — ставка не задана ни у спринта, ни у клиента */
  bill: SprintBill | null
  /** клиент спринта — как точка в строке задачи (ключ ClientRow) */
  clientKey: string
  /** цвет этапа: как чип в приложении */
  stageTone: StageTone | null
  /** подзадачи: закрыто / всего */
  subDone: number
  subTotal: number
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
  /** записи дня по порядку — для листа «Журнал» (0.42) */
  entries: JournalEntry[]
}

/** одна запись учёта в журнале: время, задача, комментарий и откуда она взялась */
export interface JournalEntry {
  start: string
  end: string
  title: string
  clientKey: string
  hours: number
  note: string | null
  tag: 'meeting' | 'pomodoro' | 'deep' | 'manual' | null
}

/** клиент — как точка в строке задачи и пятно на плитке дня */
export interface ClientRow {
  key: string
  name: string
  /** 'label-1'…'label-8'; null — нейтральный */
  color: string | null
  hours: number
  prevHours: number
  /** часы по дням периода — в порядке ReportData.days */
  byDay: number[]
  /** к оплате по валютам (по спринтам этого клиента) */
  money: { currency: string; amount: number }[]
  /** ставка, если у всех спринтов клиента одна */
  rate: { value: number; currency: string } | null
}

/** из чего сложился учёт (0.42) */
export interface WorkSummary {
  /** таймер без фокуса и встреч */
  timer: number
  focus: number
  meetings: number
  manual: number
  pomodoro: number
  deep: number
  meetingCount: number
  /** самый длинный заход таймера, часы */
  longest: number
}

export interface MethodSplit {
  method: Exclude<PriorityMethod, 'none'>
  title: string
  rows: { key: string; label: string; hours: number; tone: 'danger' | 'accent' | 'info' | 'neutral' }[]
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
  /** свой логотип в шапке PDF — PNG data URL; нет — знак Semternity */
  logo?: string | null
  from: string
  to: string
  label: string
  /** первая группа — верхний уровень, вторая — то, что внутри; без групп разрезов нет */
  outer: ReportDim | null
  inner: ReportDim | null
  /** все группы — колонки листа «Записи» */
  groupNames: string[]
  /** «август», «1–15 сент» (период ещё идёт) или «прошлый период» — то, с чем сравниваем, в подписях колонок */
  prevName: string
  /** «к августу», «к 15 сент», «к прошлому периоду» */
  prevDative: string
  /** «с августом», «с 1–15 сентября», «с прошлым периодом» */
  prevWith: string
  /** «сентябрь» или «этот период» — подпись текущего в легендах */
  curName: string
  /** отрезок, с которым сравниваем: пока период идёт — урезанный до прошедшего числа дней */
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
  /** итоги к оплате по валютам; пусто — ставок нет, раздела в отчёте нет */
  billing: BillTotal[]

  composition: { timer: number; added: number; removed: number; sessions: number; manualCount: number }
  /** 0.42: клиенты с цветами, «когда идёт работа», плитки дней, фокус и встречи, методика */
  clients: ClientRow[]
  /** часы таймера: [день недели пн…вс][час 0…23] */
  heat: number[][]
  tiles: { date: string; tile: DayTile }[]
  work: WorkSummary
  method: MethodSplit | null
  /** прогноз на месяц по темпу будних дней; только пока месяц идёт */
  forecast: { hours: number; monthNorm: number | null; pace: number } | null
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
 * разное число: сентябрь с августом сравнивают именно так. Начало месяца (с 1-го по какое-то
 * число того же месяца — так экспорт ставит период по умолчанию) — с теми же числами прошлого
 * месяца: 1–15 октября с 1–15 сентября, а не с 16–30 сентября. Любой другой отрезок —
 * с отрезком той же длины прямо перед ним.
 */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  if (isWholeMonth(from, to)) {
    const d = parseDate(from)
    const prevFrom = toDateString(new Date(d.getFullYear(), d.getMonth() - 1, 1))
    return { from: prevFrom, to: lastDayOfMonth(prevFrom) }
  }
  if (from.endsWith('-01') && from.slice(0, 7) === to.slice(0, 7)) {
    const d = parseDate(from)
    const prevFrom = toDateString(new Date(d.getFullYear(), d.getMonth() - 1, 1))
    const prevLast = lastDayOfMonth(prevFrom)
    const sameDay = addDays(prevFrom, parseDate(to).getDate() - 1)
    return { from: prevFrom, to: sameDay < prevLast ? sameDay : prevLast }
  }
  const length = daysOf(from, to).length
  return { from: addDays(from, -length), to: addDays(from, -1) }
}

/**
 * Отрезок прошлого периода, с которым сравниваем на самом деле. Пока период идёт (сегодня
 * внутри него), от прошлого берём столько же дней, сколько прошло, но не дальше его конца:
 * 1–15 октября — с 1–15 сентября, а не с целым сентябрём, иначе в середине месяца всегда
 * выходит ненастоящий минус. Так же считает «Сводка».
 */
export function comparisonPeriod(
  from: string,
  to: string,
  today: string,
): { from: string; to: string; partial: boolean } {
  const prev = previousPeriod(from, to)
  // начало прошлого месяца (1–15 сент) называем числами, как и урезанный отрезок
  const monthStart = (p: { from: string; to: string }) =>
    p.from.endsWith('-01') && p.to < lastDayOfMonth(p.from)
  if (today < from || today >= to) return { ...prev, partial: monthStart(prev) }
  const elapsed = daysOf(from, today).length
  const cut = addDays(prev.from, elapsed - 1)
  return cut < prev.to ? { from: prev.from, to: cut, partial: true } : { ...prev, partial: monthStart(prev) }
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
  const today = toDateString(input.generatedAt)
  const prev = comparisonPeriod(from, to, today)
  const whole = isWholeMonth(from, to)
  const prevMonth = parseDate(prev.from).getMonth()
  const sameMonth = prev.from.slice(0, 7) === prev.to.slice(0, 7)
  // период ещё идёт — называем отрезок прошлого числами: «к 15 сент», а не «к сентябрю»
  const prevName = prev.partial
    ? prev.from === prev.to
      ? formatDayMonth(prev.to, today)
      : sameMonth
        ? `${parseDate(prev.from).getDate()}–${formatDayMonth(prev.to, today)}`
        : `${formatDayMonth(prev.from, today)} – ${formatDayMonth(prev.to, today)}`
    : whole
      ? MONTHS_NOM[prevMonth]
      : 'прошлый период'
  const prevDative = prev.partial ? formatDayMonth(prev.to, today) : whole ? MONTHS_DAT[prevMonth] : 'прошлому периоду'
  const prevWith = prev.partial
    ? prev.from === prev.to
      ? dayMonth(prev.to)
      : sameMonth
        ? `${parseDate(prev.from).getDate()}–${dayMonth(prev.to)}`
        : `${dayMonth(prev.from)} – ${dayMonth(prev.to)}`
    : whole
      ? MONTHS_INS[prevMonth]
      : 'прошлым периодом'
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
  // клиент — как точка в строке задачи и пятно плитки дня: первое значение «в строке» с
  // цветом; у подзадачи без своего — значение спринта (src/lib/dayTile.ts tileClientOf)
  const NO_CLIENT: TileClient = { key: 'none', name: 'Без клиента', color: null }
  const clientOf = (taskId: string): TileClient => {
    const task = taskById.get(taskId)
    if (!task) return NO_CLIENT
    for (const t of [task, task.parent_id ? taskById.get(task.parent_id) : undefined]) {
      if (!t) continue
      const values = model.valuesOf(t).filter((v) => v.group.show_in_list)
      const v = values.find((x) => x.item.color) ?? values[0]
      if (v) return { key: v.item.id, name: v.item.name, color: v.item.color ?? null }
    }
    return NO_CLIENT
  }

  const current = input.entries.filter((e) => e.effective_date >= from && e.effective_date <= to)
  const previous = input.entries.filter((e) => e.effective_date >= prev.from && e.effective_date <= prev.to)
  const sumHours = (list: TimeEntry[]) => toHours(list.reduce((s, e) => s + entryMinutes(e), 0))
  const total = sumHours(current)
  const prevTotal = sumHours(previous)

  // ── норма и цель
  const days = daysOf(from, to)
  // норма — по рабочим дням из настроек (src/lib/norm.ts), как в «Сводке»
  const norm = { perDay: input.perDay, perMonth: input.perMonth, workDays: input.workDays ?? DEFAULT_WORK_DAYS }
  const isWeekend = (iso: string) => !isWorkday(iso, norm.workDays)
  const weekdays = days.filter((d) => !isWeekend(d)).length
  const dayNorm = dayNormFor(from, norm)
  const targetHours = periodNorm(from, to, norm)
  const target =
    targetHours === null
      ? null
      : { hours: targetHours, label: whole && input.perMonth ? 'месячной цели' : input.perMonth ? 'цели' : 'нормы' }

  // ── по дням
  const byDay = new Map<string, { net: number; timer: number; added: number; removed: number }>()
  for (const e of current) {
    const b = byDay.get(e.effective_date) ?? { net: 0, timer: 0, added: 0, removed: 0 }
    b.net += entryMinutes(e)
    if (e.entry_type === 'timer') b.timer += entryMinutes(e)
    else if (entryMinutes(e) > 0) b.added += entryMinutes(e)
    else b.removed += entryMinutes(e)
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
    for (const e of list) m.set(key(e), (m.get(key(e)) ?? 0) + entryMinutes(e))
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
      unplannedMinutes += entryMinutes(e)
      const key = valueId(head, outerGroup)
      unplannedBySection.set(key, (unplannedBySection.get(key) ?? 0) + entryMinutes(e))
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
    if (head) headPeriodMinutes.set(head.id, (headPeriodMinutes.get(head.id) ?? 0) + entryMinutes(e))
  }
  const closedIds = new Set(input.closedTaskIds)
  const groupOrder = input.groups.map((g) => g.id)
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
      const factPeriod = toHours(headPeriodMinutes.get(t.id) ?? 0)
      const bill = billSprint(resolveRate(t, input.items, groupOrder), plan, factTotal, factPeriod)
      const subs = children.get(t.id) ?? []
      return {
        bill,
        clientKey: clientOf(t.id).key,
        stageTone: status ? stageTone(status, statuses) : null,
        subDone: subs.filter((c) => !!(c.status_id && statusById.get(c.status_id)?.is_final)).length,
        subTotal: subs.length,
        id: t.id,
        name: t.name.trim(),
        outer: valueName(t, outerGroup),
        inner: valueName(t, innerGroup),
        plan,
        factTotal,
        factPeriod,
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
      composition.timer += toHours(entryMinutes(e))
      composition.sessions += 1
    } else {
      composition.manualCount += 1
      if (entryMinutes(e) > 0) composition.added += toHours(entryMinutes(e))
      else composition.removed += toHours(entryMinutes(e))
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
          if (e.entry_type !== 'timer' || !e.started_at || !e.ended_at || entryMinutes(e) < 180) return false
          return toDateString(new Date(e.ended_at)) > toDateString(new Date(e.started_at))
        })
        .map((e) => ({
          date: e.effective_date,
          task: taskById.get(e.task_id)?.name.trim() ?? '',
          hours: toHours(entryMinutes(e)),
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
    dayTask.set(key, (dayTask.get(key) ?? 0) + entryMinutes(e))
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
      entries: [],
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
        hours: toHours(entryMinutes(e)),
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

  // ── 0.42: клиенты, часы суток, плитки, фокус и встречи, методика, прогноз
  const dayIndex = new Map(days.map((d, i) => [d, i]))
  const clientMap = new Map<string, ClientRow>()
  const clientRow = (c: TileClient) => {
    let row = clientMap.get(c.key)
    if (!row) {
      row = { key: c.key, name: c.name, color: c.color, hours: 0, prevHours: 0, byDay: days.map(() => 0), money: [], rate: null }
      clientMap.set(c.key, row)
    }
    return row
  }
  for (const e of current) {
    const row = clientRow(clientOf(e.task_id))
    const h = toHours(entryMinutes(e))
    row.hours += h
    const i = dayIndex.get(e.effective_date)
    if (i !== undefined) row.byDay[i] += h
  }
  for (const e of previous) clientRow(clientOf(e.task_id)).prevHours += toHours(entryMinutes(e))
  const withOverMoney = options.includeOvertime === true
  for (const sp of sprints) {
    if (!sp.bill) continue
    const row = clientMap.get(sp.clientKey)
    if (!row) continue
    const amount = sp.bill.amount + (withOverMoney ? sp.bill.overAmount : 0)
    const m = row.money.find((x) => x.currency === sp.bill!.currency)
    if (m) m.amount += amount
    else row.money.push({ currency: sp.bill.currency, amount })
  }
  for (const row of clientMap.values()) {
    const bills = sprints.filter((sp) => sp.clientKey === row.key && sp.bill).map((sp) => sp.bill!)
    if (bills.length && bills.every((b) => b.rate === bills[0].rate && b.currency === bills[0].currency)) {
      row.rate = { value: bills[0].rate, currency: bills[0].currency }
    }
  }
  const clients = [...clientMap.values()]
    .filter((c) => Math.abs(c.hours) > 0.004 || Math.abs(c.prevHours) > 0.004)
    .sort((a, b) => b.hours - a.hours || b.prevHours - a.prevHours)

  // когда идёт работа: часы таймера по дням недели и часам суток (у правок времени суток нет)
  const heat = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const e of current) {
    if (e.entry_type !== 'timer' || !e.started_at || !e.ended_at) continue
    let t = new Date(e.started_at).getTime()
    const end = new Date(e.ended_at).getTime()
    while (t < end) {
      const d = new Date(t)
      const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime()
      const stop = Math.min(next, end)
      heat[(d.getDay() + 6) % 7][d.getHours()] += (stop - t) / 3_600_000
      t = stop
    }
  }

  // плитки дней — та же раскладка, что у плитки на «Сегодня» и в мозаике
  const entriesByDay = new Map<string, TimeEntry[]>()
  for (const e of current) entriesByDay.set(e.effective_date, [...(entriesByDay.get(e.effective_date) ?? []), e])
  const tiles = dayPoints.map((pt) => ({
    date: pt.date,
    tile: makeTile(buildSegments(entriesByDay.get(pt.date) ?? [], clientOf), pt.norm * 60, pt.date === today),
  }))

  // фокус и встречи
  const meetingIds = new Set(input.meetingEntryIds ?? [])
  const startMs = parseDate(from).getTime()
  const endMs = parseDate(addDays(to, 1)).getTime()
  const sessions = (input.focusSessions ?? []).filter((f) => {
    const t = new Date(f.started_at).getTime()
    return t >= startMs && t < endMs && (!f.task_id || taskById.has(f.task_id))
  })
  const focusHours = sessions.reduce((a, f) => a + (new Date(f.ended_at).getTime() - new Date(f.started_at).getTime()) / 3_600_000, 0)
  const meetingEntries = current.filter((e) => meetingIds.has(e.id))
  const meetingHours = toHours(meetingEntries.reduce((a, e) => a + entryMinutes(e), 0))
  const timerEntries = current.filter((e) => e.entry_type === 'timer')
  const work: WorkSummary = {
    timer: Math.max(0, composition.timer - focusHours - meetingHours),
    focus: Math.min(focusHours, composition.timer),
    meetings: meetingHours,
    manual: composition.added + composition.removed,
    pomodoro: sessions.filter((f) => f.completed && f.mode === 'pomodoro').length,
    deep: sessions.filter((f) => f.completed && f.mode !== 'pomodoro').length,
    meetingCount: meetingEntries.length,
    longest: timerEntries.reduce((a, e) => Math.max(a, toHours(entryMinutes(e))), 0),
  }

  // часы по методике: отметки задачи, у подзадачи без своих — спринта
  let method: MethodSplit | null = null
  const pm = input.priorityMethod ?? 'none'
  if (pm !== 'none' && total > 0) {
    const byKey = new Map<string, number>()
    const keyOf = (e: TimeEntry): string => {
      const t = taskById.get(e.task_id)
      const h = headOf(e.task_id)
      if (!t) return 'none'
      if (pm === 'eisenhower') {
        const q = quadrantOf(t, today) ?? (h ? quadrantOf(h, today) : null)
        return q ? `q${q}` : 'none'
      }
      if (pm === 'abcde') return t.abc_letter ?? h?.abc_letter ?? 'none'
      if (pm === '135') return effortOf(t)
      return t.frog_date === e.effective_date || (h && h.frog_date === e.effective_date) ? 'frog' : 'none'
    }
    for (const e of current) byKey.set(keyOf(e), (byKey.get(keyOf(e)) ?? 0) + toHours(entryMinutes(e)))
    type Tone = MethodSplit['rows'][number]['tone']
    const defs: Record<Exclude<PriorityMethod, 'none'>, [string, string, Tone][]> = {
      eisenhower: [
        ['q1', QUADRANT[1].hint, 'danger'],
        ['q2', QUADRANT[2].hint, 'accent'],
        ['q3', QUADRANT[3].hint, 'info'],
        ['q4', QUADRANT[4].hint, 'neutral'],
        ['none', 'Без отметки', 'neutral'],
      ],
      abcde: [
        ['A', 'A — обязательно', 'danger'],
        ['B', 'B — желательно', 'accent'],
        ['C', 'C — приятно', 'info'],
        ['D', 'D — поручить', 'neutral'],
        ['E', 'E — убрать', 'neutral'],
        ['none', 'Без буквы', 'neutral'],
      ],
      '135': [
        ['big', EFFORT_LABEL.big.one, 'danger'],
        ['medium', EFFORT_LABEL.medium.one, 'accent'],
        ['small', EFFORT_LABEL.small.one, 'info'],
      ],
      frog: [
        ['frog', 'Лягушка дня', 'accent'],
        ['none', 'Остальное', 'neutral'],
      ],
    }
    const titles: Record<Exclude<PriorityMethod, 'none'>, string> = {
      eisenhower: 'Матрица Эйзенхауэра',
      abcde: 'Метод ABCDE',
      '135': 'Правило 1-3-5',
      frog: 'Съешь лягушку',
    }
    method = {
      method: pm,
      title: titles[pm],
      rows: defs[pm]
        .map(([key, label, tone]) => ({ key, label, tone, hours: byKey.get(key) ?? 0 }))
        // у матрицы все четыре клетки остаются; в остальных методиках пустые строки не нужны
        .filter((row) => (pm === 'eisenhower' && row.key !== 'none') || Math.abs(row.hours) > 0.004),
    }
  }

  // прогноз на месяц: только пока целый месяц ещё идёт — по темпу прошедших рабочих дней
  let forecast: ReportData['forecast'] = null
  if (whole && today >= from && today < to) {
    const passed = dayPoints.filter((pt) => pt.date <= today && !pt.weekend).length
    const ahead = dayPoints.filter((pt) => pt.date > today && !pt.weekend).length
    const pace = passed > 0 ? total / passed : 0
    forecast = { hours: total + pace * ahead, monthNorm: target?.hours ?? null, pace }
  }

  // журнал по записям: время, откуда запись (встреча, фокус, вручную) и комментарий
  const focusModeAt = (e: TimeEntry): 'pomodoro' | 'deep' | null => {
    if (!e.started_at) return null
    const t = new Date(e.started_at).getTime()
    const f = sessions.find((x) => x.task_id === e.task_id && Math.abs(new Date(x.started_at).getTime() - t) < 120_000)
    return f ? (f.mode === 'pomodoro' ? 'pomodoro' : 'deep') : null
  }
  const journalEntries = new Map<string, JournalEntry[]>()
  const ordered = [...current].sort((a, b) => (a.started_at ?? a.created_at).localeCompare(b.started_at ?? b.created_at))
  for (const e of ordered) {
    const task = taskById.get(e.task_id)
    const head = headOf(e.task_id)
    const title = task?.parent_id && head ? `${head.name.trim()} › ${task.name.trim()}` : (task?.name.trim() ?? 'Удалённая задача')
    const timer = e.entry_type === 'timer'
    const entry: JournalEntry = {
      start: timer ? localTime(e.started_at) : '',
      end: timer ? localTime(e.ended_at) : '',
      title,
      clientKey: clientOf(e.task_id).key,
      hours: toHours(entryMinutes(e)),
      // у встречи заметка — её название, его заменяет метка «встреча»
      note: meetingIds.has(e.id) || !options.includeComments ? null : entryNote(e),
      tag: meetingIds.has(e.id) ? 'meeting' : !timer ? 'manual' : focusModeAt(e),
    }
    journalEntries.set(e.effective_date, [...(journalEntries.get(e.effective_date) ?? []), entry])
  }

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
    // пока период идёт — среднее по прошедшим рабочим дням, иначе оно занижено будущими
    avgPerWeekday: (() => {
      const n = today >= from && today <= to ? days.filter((d) => d <= today && !isWeekend(d)).length : weekdays
      return n > 0 ? total / n : null
    })(),
    daysWithEntries: new Set(current.filter((e) => entryMinutes(e) > 0).map((e) => e.effective_date)).size,
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
    billing: billTotals(sprints.map((s) => s.bill), input.options.includeOvertime === true),
    composition,
    clients,
    heat,
    tiles,
    work,
    method,
    forecast,
    checks,
    journal,
    records,
  }
  for (const day of report.journal) day.entries = journalEntries.get(day.date) ?? []
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
