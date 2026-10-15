// Блок «Время» в сводке дня: один факт о работе пользователя и цитата под его контекст.
// Чистая логика без базы и сети — её используют функция telegram и тесты (Vitest).
//
// Как устроено: collectFacts считает все факты, которые сегодня можно сказать, у каждого вес
// (насколько он необычен). pickFact берёт самый весомый, но не того же контекста, что вчера.
// chooseQuote подбирает цитату: контекст факта → тема → general, без повторов до конца цикла.
// Чтобы добавить факт — новая функция в RULES и тег в TAGS (и в check-ограничение quotes.tags).

export type Theme = 'rhythm' | 'clients'

export type FactKind =
  | 'peak_hours'
  | 'best_weekday'
  | 'streak'
  | 'long_focus'
  | 'day_record'
  | 'hours_milestone'
  | 'client_share'
  | 'sprint_on_track'
  | 'sprint_burn'
  | 'sprint_closed'
  | 'client_hours'
  | 'client_return'

export const THEME_OF: Record<FactKind, Theme> = {
  peak_hours: 'rhythm',
  best_weekday: 'rhythm',
  streak: 'rhythm',
  long_focus: 'rhythm',
  day_record: 'rhythm',
  hours_milestone: 'rhythm',
  client_share: 'clients',
  sprint_on_track: 'clients',
  sprint_burn: 'clients',
  sprint_closed: 'clients',
  client_hours: 'clients',
  client_return: 'clients',
}

/** все допустимые теги цитат — то же, что в check-ограничении quotes.tags */
export const TAGS = [...Object.keys(THEME_OF), 'rhythm', 'clients', 'general'] as const

export interface Fact {
  kind: FactKind
  text: string
  /** чем необычнее факт, тем больше: рекорд и веха важнее доли времени */
  weight: number
}

export interface EntryRow {
  task_id: string
  /** может быть отрицательной — ручная правка «−15 мин» */
  duration_seconds: number
  /** местный день записи YYYY-MM-DD */
  effective_date: string
  entry_type: 'timer' | 'manual_adjustment'
  started_at: string | null
}

export interface TaskInfo {
  id: string
  name: string
  parent_id: string | null
  planned_hours: number
  start_date: string | null
  end_date: string | null
  /** момент закрытия (UTC); null — открыта или закрыта до появления журнала */
  completed_at: string | null
  /** клиент — значение главной группы («Проекты»); null — не указан */
  client: { id: string; name: string } | null
}

export interface InsightInput {
  /** отчётный день — о нём говорит факт */
  date: string
  /** «Сегодня» (вечерняя сводка) или «Вчера» (утром в приложении) */
  dayWord: 'Сегодня' | 'Вчера'
  timeZone: string
  /** рабочих дней с понедельника: 5 — пн–пт */
  workDaysPerWeek: number
  /** все записи пользователя до отчётного дня включительно */
  entries: EntryRow[]
  tasks: TaskInfo[]
}

/**
 * Какая группа — «клиенты». Порядок групп пользователь меняет сам («Разделы» бывают первыми),
 * поэтому сначала по имени, потом — группа с цветными значениями (точка клиента в строке задачи),
 * и только потом первая из видных в строке.
 */
export function pickClientGroup<G extends { id: string; name: string; show_in_list: boolean }>(
  groups: G[],
  coloredItems: (groupId: string) => number,
): G | null {
  const byName = groups.find((g) => /^(проекты|клиенты)$/i.test(g.name.trim()))
  if (byName) return byName
  const visible = groups.filter((g) => g.show_in_list)
  const colored = [...visible].sort((a, b) => coloredItems(b.id) - coloredItems(a.id))[0]
  if (colored && coloredItems(colored.id) > 0) return colored
  return visible[0] ?? groups[0] ?? null
}

/* ── даты и слова ──────────────────────────────────────────────────── */

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)
}

/** 1 — понедельник … 7 — воскресенье */
export function isoWeekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay() || 7
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone)
  if (!f) {
    try {
      f = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
      })
    } catch {
      f = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    }
    formatters.set(timeZone, f)
  }
  return f
}

/** местные дата и час момента в поясе пользователя */
export function localDateHour(ms: number, timeZone: string): { date: string; hour: number } {
  const parts = formatter(timeZone).formatToParts(new Date(ms))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 }
}

/** «1 задача», «3 задачи», «5 задач» */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return forms[2]
  if (b === 1) return forms[0]
  if (b >= 2 && b <= 4) return forms[1]
  return forms[2]
}

/** «1 ч 12 мин», «45 мин», «9 ч» */
export function hm(minutes: number): string {
  const m = Math.round(minutes)
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h === 0) return `${r} мин`
  return r ? `${h} ч ${r} мин` : `${h} ч`
}

/** «200 часов», «1 000 часов» */
function hoursWord(n: number): string {
  return `${n.toLocaleString('ru-RU').replace(/ /g, ' ')} ${plural(n, ['час', 'часа', 'часов'])}`
}

/** «3 недели», «16 дней» — длина паузы */
function pauseWord(days: number): string {
  if (days < 21) return `${days} ${plural(days, ['день', 'дня', 'дней'])}`
  const w = Math.round(days / 7)
  return `${w} ${plural(w, ['неделю', 'недели', 'недель'])}`
}

const WEEKDAY_NOM = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
const MONTH_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре']

const q = (s: string) => `«${s.trim()}»`

/* ── общие расчёты ───────────────────────────────────────────────── */

interface Ctx extends InsightInput {
  /** минуты по дням */
  byDay: Map<string, number>
  firstDay: string | null
  taskById: Map<string, TaskInfo>
  /** головная задача (спринт) записи */
  headOf: (taskId: string) => string
  clientOf: (taskId: string) => TaskInfo['client']
}

function context(input: InsightInput): Ctx {
  const entries = input.entries.filter((e) => e.effective_date <= input.date)
  const byDay = new Map<string, number>()
  let firstDay: string | null = null
  for (const e of entries) {
    byDay.set(e.effective_date, (byDay.get(e.effective_date) ?? 0) + e.duration_seconds / 60)
    if (e.duration_seconds > 0 && (!firstDay || e.effective_date < firstDay)) firstDay = e.effective_date
  }
  const taskById = new Map(input.tasks.map((t) => [t.id, t]))
  const headOf = (id: string) => taskById.get(id)?.parent_id ?? id
  const clientOf = (id: string) => taskById.get(id)?.client ?? taskById.get(headOf(id))?.client ?? null
  return { ...input, entries, byDay, firstDay, taskById, headOf, clientOf }
}

const minutesOn = (c: Ctx, date: string) => c.byDay.get(date) ?? 0
/** сколько полных дней истории до отчётного дня (первый день учёта = 0) */
const historyDays = (c: Ctx) => (c.firstDay ? daysBetween(c.firstDay, c.date) : -1)
const isWorkDay = (c: Ctx, date: string) => isoWeekday(date) <= c.workDaysPerWeek

/** самая длинная непрерывная запись таймера за день, мин */
function longestSession(c: Ctx, date: string): number {
  let best = 0
  for (const e of c.entries) {
    if (e.effective_date === date && e.entry_type === 'timer') best = Math.max(best, e.duration_seconds / 60)
  }
  return best
}

/** веха пройдена в отчётный день: до него меньше, с ним — не меньше */
function crossedMilestone(before: number, after: number, steps: number[]): number | null {
  let hit: number | null = null
  for (const m of steps) if (before < m && after >= m) hit = m
  return hit
}

const HOUR_STEPS = [100, 250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000]
const CLIENT_STEPS = [50, 100, 200, 300, 500, 750, 1000, 1500, 2000]

/* ── факты «Ритм и рекорды» ────────────────────────────────────────── */

/** лучшие два часа подряд за 4 недели — по записям таймера, в местном времени */
function peakHours(c: Ctx): Fact | null {
  if (historyDays(c) < 13) return null
  const from = shiftDate(c.date, -27)
  const byHour = new Array<number>(24).fill(0)
  let total = 0
  const SLICE = 15 * 60_000 // любые смещения поясов кратны 15 минутам
  for (const e of c.entries) {
    if (e.entry_type !== 'timer' || !e.started_at || e.duration_seconds <= 0) continue
    if (e.effective_date < from) continue
    const start = Date.parse(e.started_at)
    const end = start + e.duration_seconds * 1000
    let t = start
    while (t < end) {
      const next = Math.min(end, Math.floor(t / SLICE) * SLICE + SLICE)
      byHour[localDateHour(t, c.timeZone).hour] += (next - t) / 60_000
      total += (next - t) / 60_000
      t = next
    }
  }
  if (total < 20 * 60) return null
  let bestH = 0
  let bestSum = -1
  for (let h = 0; h < 23; h++) {
    const s = byHour[h] + byHour[h + 1]
    if (s > bestSum) {
      bestSum = s
      bestH = h
    }
  }
  const share = Math.round((bestSum / total) * 100)
  // при ровном дне два часа из восьми — это 25%: говорить есть о чём, только если заметно больше
  if (share < 25) return null
  return {
    kind: 'peak_hours',
    text: `Лучше всего у вас идёт с ${bestH}:00 до ${bestH + 2}:00 — на эти два часа пришлось ${share}% учёта за 4 недели`,
    weight: 30 + Math.min(20, share - 25),
  }
}

/** самый плотный день недели за 4 полные недели */
function bestWeekday(c: Ctx): Fact | null {
  if (historyDays(c) < 27) return null
  const sums = new Array<number>(8).fill(0)
  for (let i = 0; i < 28; i++) {
    const d = shiftDate(c.date, -i)
    sums[isoWeekday(d)] += minutesOn(c, d)
  }
  const avg = sums.map((s) => s / 4)
  const days = [1, 2, 3, 4, 5, 6, 7].filter((w) => w <= c.workDaysPerWeek)
  if (days.length < 2) return null
  const best = days.reduce((a, b) => (avg[b] > avg[a] ? b : a))
  const others = days.filter((w) => w !== best)
  const othersAvg = others.reduce((s, w) => s + avg[w], 0) / others.length
  if (avg[best] < 60 || avg[best] < othersAvg * 1.15) return null
  return {
    kind: 'best_weekday',
    text: `${WEEKDAY_NOM[best]} — ваш самый плотный день: в среднем ${hm(avg[best])} за последние 4 недели`,
    weight: 28,
  }
}

/** рабочие дни подряд с учётом, включая отчётный; выходные серию не рвут */
function streak(c: Ctx): Fact | null {
  if (minutesOn(c, c.date) <= 0 || !isWorkDay(c, c.date)) return null
  let n = 0
  for (let d = c.date; n < 1000; d = shiftDate(d, -1)) {
    if (!isWorkDay(c, d)) continue
    if (minutesOn(c, d) <= 0) break
    n++
  }
  if (n < 5) return null
  const round = n % 5 === 0
  return {
    kind: 'streak',
    text: `${n}-й рабочий день подряд с учётом`,
    weight: 32 + (round ? 25 : 0) + Math.min(15, n - 5),
  }
}

/** самый длинный отрезок без перерыва за 30 дней */
function longFocus(c: Ctx): Fact | null {
  if (historyDays(c) < 13) return null
  const today = longestSession(c, c.date)
  if (today < 60) return null
  for (let i = 1; i < 30; i++) if (longestSession(c, shiftDate(c.date, -i)) >= today) return null
  return {
    kind: 'long_focus',
    text: `${c.dayWord} был самый длинный отрезок работы без перерыва за месяц: ${hm(today)}`,
    weight: 60,
  }
}

/** самый насыщенный день за месяц или за 3 месяца */
function dayRecord(c: Ctx): Fact | null {
  const today = minutesOn(c, c.date)
  if (today < 120 || historyDays(c) < 13) return null
  const maxBefore = (days: number) => {
    let m = 0
    for (let i = 1; i <= days; i++) m = Math.max(m, minutesOn(c, shiftDate(c.date, -i)))
    return m
  }
  if (historyDays(c) >= 60 && today > maxBefore(89)) {
    return { kind: 'day_record', text: `${c.dayWord} — самый насыщенный день за 3 месяца: ${hm(today)}`, weight: 70 }
  }
  if (today > maxBefore(29)) {
    return { kind: 'day_record', text: `${c.dayWord} — самый насыщенный день за месяц: ${hm(today)}`, weight: 55 }
  }
  return null
}

/** рубеж часов в трекере: 100, 250, 500, 1000… */
function hoursMilestone(c: Ctx): Fact | null {
  let before = 0
  for (const [d, m] of c.byDay) if (d < c.date) before += m
  const hit = crossedMilestone(before / 60, (before + minutesOn(c, c.date)) / 60, HOUR_STEPS)
  if (!hit) return null
  return { kind: 'hours_milestone', text: `${c.dayWord} в трекере набралось ${hoursWord(hit)} учёта`, weight: 90 }
}

/* ── факты «Клиенты и спринты» ───────────────────────────────────── */

/** минуты по клиентам за дни [from, to] */
function byClient(c: Ctx, from: string, to: string) {
  const map = new Map<string, { name: string; minutes: number }>()
  for (const e of c.entries) {
    if (e.effective_date < from || e.effective_date > to) continue
    const cl = c.clientOf(e.task_id)
    if (!cl) continue
    const row = map.get(cl.id) ?? { name: cl.name, minutes: 0 }
    row.minutes += e.duration_seconds / 60
    map.set(cl.id, row)
  }
  return map
}

/** у какого клиента больше всего времени в этом месяце */
function clientShare(c: Ctx): Fact | null {
  const day = Number(c.date.slice(8, 10))
  if (day < 5) return null
  const month = byClient(c, `${c.date.slice(0, 8)}01`, c.date)
  const rows = [...month.values()].filter((r) => r.minutes > 0).sort((a, b) => b.minutes - a.minutes)
  if (rows.length < 2) return null
  const total = rows.reduce((s, r) => s + r.minutes, 0)
  const share = Math.round((rows[0].minutes / total) * 100)
  if (share < 30) return null
  const monthName = MONTH_PREP[Number(c.date.slice(5, 7)) - 1]
  return {
    kind: 'client_share',
    text: `Больше всего времени в ${monthName} — ${q(rows[0].name)}: ${share}% учёта месяца`,
    weight: 20 + Math.min(15, Math.round((share - 30) / 3)),
  }
}

/** открытые спринты с планом и сроком, идущие в отчётный день */
function runningSprints(c: Ctx) {
  const factBy = new Map<string, number>()
  for (const e of c.entries) {
    const head = c.headOf(e.task_id)
    factBy.set(head, (factBy.get(head) ?? 0) + e.duration_seconds / 3600)
  }
  return c.tasks
    .filter((t) => !t.parent_id && !t.completed_at && t.planned_hours > 0 && t.start_date && t.end_date)
    .filter((t) => t.start_date! <= c.date && c.date <= t.end_date!)
    .map((t) => {
      const span = daysBetween(t.start_date!, t.end_date!) + 1
      const passed = daysBetween(t.start_date!, c.date) + 1
      return {
        t,
        plan: (factBy.get(t.id) ?? 0) / t.planned_hours,
        time: passed / span,
        daysLeft: daysBetween(c.date, t.end_date!),
      }
    })
}

const sprintTitle = (t: TaskInfo) => (t.client ? `${q(t.name)} (${t.client.name.trim()})` : q(t.name))

/** спринт идёт по графику: доля плана ≈ доля срока */
function sprintOnTrack(c: Ctx): Fact | null {
  const s = runningSprints(c)
    .filter((x) => x.time >= 0.3 && x.time <= 0.9 && Math.abs(x.plan - x.time) <= 0.1)
    .sort((a, b) => b.t.planned_hours - a.t.planned_hours)[0]
  if (!s) return null
  return {
    kind: 'sprint_on_track',
    text: `${sprintTitle(s.t)}: ${Math.round(s.plan * 100)}% плана при ${Math.round(s.time * 100)}% срока — идёте ровно`,
    weight: 25,
  }
}

/** план спринта почти выработан, а до срока далеко */
function sprintBurn(c: Ctx): Fact | null {
  const s = runningSprints(c)
    .filter((x) => x.plan >= 0.85 && x.plan - x.time >= 0.15 && x.daysLeft >= 3)
    .sort((a, b) => b.plan - b.time - (a.plan - a.time))[0]
  if (!s) return null
  return {
    kind: 'sprint_burn',
    text: `${sprintTitle(s.t)}: выработано ${Math.round(s.plan * 100)}% плана, а до срока ещё ${s.daysLeft} ${plural(s.daysLeft, ['день', 'дня', 'дней'])}`,
    weight: 50 + Math.min(20, Math.round((s.plan - s.time) * 40)),
  }
}

/** спринт закрыт в отчётный день */
function sprintClosed(c: Ctx): Fact | null {
  const closed = c.tasks.filter(
    (t) => !t.parent_id && t.completed_at && localDateHour(Date.parse(t.completed_at), c.timeZone).date === c.date,
  )
  if (!closed.length) return null
  const fact = (t: TaskInfo) =>
    c.entries.filter((e) => c.headOf(e.task_id) === t.id).reduce((s, e) => s + e.duration_seconds / 60, 0)
  const best = closed.sort((a, b) => b.planned_hours - a.planned_hours)[0]
  const f = fact(best)
  const planPart = best.planned_hours > 0 ? ` при плане ${hm(best.planned_hours * 60)}` : ''
  const inPlan = best.planned_hours > 0 && f <= best.planned_hours * 60
  return {
    kind: 'sprint_closed',
    text: `${c.dayWord} закрыт ${sprintTitle(best)}: ${hm(f)}${planPart}`,
    weight: inPlan ? 85 : 70,
  }
}

/** рубеж часов по клиенту */
function clientHours(c: Ctx): Fact | null {
  const before = byClient(c, '0000-01-01', shiftDate(c.date, -1))
  const day = byClient(c, c.date, c.date)
  let best: { name: string; hit: number } | null = null
  for (const [id, d] of day) {
    const b = before.get(id)?.minutes ?? 0
    const hit = crossedMilestone(b / 60, (b + d.minutes) / 60, CLIENT_STEPS)
    if (hit && (!best || hit > best.hit)) best = { name: d.name, hit }
  }
  if (!best) return null
  return { kind: 'client_hours', text: `По клиенту ${q(best.name)} набралось ${hoursWord(best.hit)} учёта`, weight: 75 }
}

/** вернулись к клиенту после паузы от двух недель */
function clientReturn(c: Ctx): Fact | null {
  const lastBefore = new Map<string, string>()
  const today = new Map<string, { name: string; minutes: number }>()
  for (const e of c.entries) {
    const cl = c.clientOf(e.task_id)
    if (!cl || e.duration_seconds <= 0) continue
    if (e.effective_date === c.date) {
      const row = today.get(cl.id) ?? { name: cl.name, minutes: 0 }
      row.minutes += e.duration_seconds / 60
      today.set(cl.id, row)
    } else if (e.effective_date < c.date) {
      const prev = lastBefore.get(cl.id)
      if (!prev || e.effective_date > prev) lastBefore.set(cl.id, e.effective_date)
    }
  }
  let best: { name: string; pause: number } | null = null
  for (const [id, row] of today) {
    const last = lastBefore.get(id)
    if (!last || row.minutes < 30) continue
    const pause = daysBetween(last, c.date) - 1
    if (pause >= 14 && (!best || pause > best.pause)) best = { name: row.name, pause }
  }
  if (!best) return null
  return {
    kind: 'client_return',
    text: `${c.dayWord} снова работа по ${q(best.name)} — после паузы в ${pauseWord(best.pause)}`,
    weight: 45,
  }
}

/** правила по порядку; каждое либо даёт факт, либо молчит */
const RULES: ((c: Ctx) => Fact | null)[] = [
  hoursMilestone,
  sprintClosed,
  clientHours,
  dayRecord,
  longFocus,
  streak,
  sprintBurn,
  clientReturn,
  peakHours,
  bestWeekday,
  sprintOnTrack,
  clientShare,
]

export function collectFacts(input: InsightInput, themes: Theme[] = ['rhythm', 'clients']): Fact[] {
  const c = context(input)
  return RULES.map((rule) => rule(c)).filter((f): f is Fact => !!f && themes.includes(THEME_OF[f.kind]))
}

/** самый весомый факт, но не того же контекста, что вчера; нет — блок не показываем */
export function pickFact(facts: Fact[], previousKind: string | null): Fact | null {
  const pool = facts.filter((f) => f.kind !== previousKind)
  if (!pool.length) return null
  // при равном весе — в порядке RULES (sort стабильный)
  return [...pool].sort((a, b) => b.weight - a.weight)[0]
}

/* ── выбор цитаты ────────────────────────────────────────────────── */

export interface QuoteRow {
  id: number
  tags: string[]
}

/**
 * Цитата под контекст факта: сначала с его тегом, потом — с тегом темы, потом — general.
 * Только те, что пользователь ещё не видел; увидел все подходящие — цикл начинается заново
 * (reset: true — показы прошлых дней надо обнулить).
 */
export function chooseQuote(
  quotes: QuoteRow[],
  seen: Set<number>,
  kind: FactKind,
  random: () => number = Math.random,
): { id: number; reset: boolean } | null {
  const chain = [kind, THEME_OF[kind], 'general']
  const pick = (exclude: Set<number>) => {
    for (const tag of chain) {
      const pool = quotes.filter((x) => x.tags.includes(tag) && !exclude.has(x.id))
      if (pool.length) return pool[Math.floor(random() * pool.length) % pool.length].id
    }
    return null
  }
  const fresh = pick(seen)
  if (fresh !== null) return { id: fresh, reset: false }
  const again = pick(new Set())
  return again !== null ? { id: again, reset: true } : null
}

/** текст блока для Telegram и приложения */
export function renderBlock(fact: string, quote: { text: string; author: string; source: string | null } | null): string {
  const lines = [`💡 ${fact}`]
  if (quote) lines.push('', `«${quote.text.trim()}»`, `— ${quote.author.trim()}${quote.source ? `, ${quote.source.trim()}` : ''}`)
  return lines.join('\n')
}
