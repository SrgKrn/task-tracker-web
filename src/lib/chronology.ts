/**
 * Хронология действий по дням: учёт, ручные правки, смены этапов, изменения задач,
 * комментарии и файлы. Чистая логика — данные приходят готовыми (queries/chronology.ts),
 * здесь они раскладываются по дням и сворачиваются, чтобы не было шума:
 *  • запуски короче минуты — одной строкой внизу дня;
 *  • пачка смен этапов или ручных правок за пару минут — одной раскрывающейся строкой;
 *  • несколько полей одной задачи, сохранённых разом, — одной строкой.
 */
import { toDateString } from './period'
import { entrySeconds } from './time'
import type { TimeEntry } from './types'

/** пачкой считаем действия, между которыми не больше трёх минут */
const BURST_GAP_MS = 3 * 60 * 1000
/** поля одного сохранения приходят в одну секунду — берём с запасом */
const SAVE_GAP_MS = 5 * 1000
/** короче — случайный запуск, а не работа */
const SHORT_START_S = 60

export interface StatusEventRow {
  id: string
  task_id: string
  status_id: string | null
  is_final: boolean
  created_at: string
}

export interface TaskChangeRow {
  id: number
  task_id: string
  task_name: string
  field: string
  old_value: unknown
  new_value: unknown
  created_at: string
}

export interface CommentRow {
  id: string
  task_id: string
  body: string
  created_at: string
}

export interface FileRow {
  id: string
  task_id: string
  name: string
  created_at: string
}

export type ChronoEntry = Pick<
  TimeEntry,
  'id' | 'task_id' | 'entry_type' | 'started_at' | 'ended_at' | 'duration_seconds' | 'duration_minutes' | 'note' | 'effective_date' | 'created_at'
>

export interface TimerItem {
  kind: 'timer'
  at: string
  id: string
  taskId: string
  start: string
  end: string | null
  seconds: number
  note: string | null
  /** встреча, засчитанная из календаря */
  meeting: boolean
}

export interface AdjustmentItem {
  kind: 'adjustment'
  at: string
  id: string
  taskId: string
  seconds: number
  note: string | null
  /** правка относится к другому дню, чем день, когда её внесли */
  enteredOn: string | null
}

export interface StageItem {
  kind: 'stage'
  at: string
  id: string
  taskId: string
  /** этап до смены; null — до неё этапа не было или он неизвестен */
  from: string | null
  to: string | null
  final: boolean
}

export interface FieldChange {
  field: string
  old: unknown
  new: unknown
}

export interface ChangeItem {
  kind: 'change'
  at: string
  id: string
  taskId: string
  taskName: string
  /** 'created' / 'deleted' — одно действие; иначе — правленые поля */
  action: 'created' | 'deleted' | 'edited'
  fields: FieldChange[]
}

export interface CommentItem {
  kind: 'comment'
  at: string
  id: string
  taskId: string
  body: string
}

export interface FileItem {
  kind: 'file'
  at: string
  id: string
  taskId: string
  name: string
}

export interface BurstGroup<T> {
  kind: 'adjustmentGroup' | 'stageGroup'
  at: string
  id: string
  items: T[]
}

export type ChronoRow =
  | TimerItem
  | AdjustmentItem
  | StageItem
  | ChangeItem
  | CommentItem
  | FileItem
  | (BurstGroup<AdjustmentItem> & { kind: 'adjustmentGroup' })
  | (BurstGroup<StageItem> & { kind: 'stageGroup' })

export type ChronoFilter = 'all' | 'tracking' | 'adjustments' | 'stages' | 'changes'

export interface RibbonSpan {
  taskId: string
  /** доли шкалы дня, 0…1 */
  left: number
  width: number
}

export interface ChronoDay {
  date: string
  /** учёт за день — как в кольце «Сегодня»: сессии и правки по дню, к которому они относятся */
  totalSeconds: number
  counts: { sessions: number; adjustments: number; stages: number; changes: number }
  /** шкала полосы дня в часах: от 8 до 20, шире — если работа выходила за край */
  scale: { from: number; to: number }
  ribbon: RibbonSpan[]
  rows: ChronoRow[]
  /** времена случайных запусков (короче минуты), по порядку */
  shortStarts: string[]
}

export interface ChronoInput {
  entries: ChronoEntry[]
  /** события этапов за период и предыдущие события тех же задач — чтобы знать «было» */
  statusEvents: StatusEventRow[]
  changes: TaskChangeRow[]
  comments: CommentRow[]
  files: FileRow[]
  /** id записей учёта, созданных из встреч календаря */
  meetingEntryIds: Set<string>
  /** границы периода, включительно, YYYY-MM-DD */
  from: string
  to: string
}

const dayOf = (iso: string) => toDateString(new Date(iso))
const ms = (iso: string) => new Date(iso).getTime()
const hourOf = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

/** соседние по времени элементы (по возрастанию) — в пачки с разрывом не больше gap */
function bursts<T extends { at: string }>(list: T[], gap: number): T[][] {
  const sorted = [...list].sort((a, b) => ms(a.at) - ms(b.at))
  const out: T[][] = []
  for (const item of sorted) {
    const last = out.at(-1)
    if (last && ms(item.at) - ms(last.at(-1)!.at) <= gap) last.push(item)
    else out.push([item])
  }
  return out
}

function groupBursts<T extends AdjustmentItem | StageItem>(
  list: T[],
  kind: 'adjustmentGroup' | 'stageGroup',
): ChronoRow[] {
  return bursts(list, BURST_GAP_MS).map((b) =>
    b.length === 1
      ? (b[0] as ChronoRow)
      : ({ kind, at: b.at(-1)!.at, id: `${kind}:${b[0].id}`, items: b.reverse() } as ChronoRow),
  )
}

export function buildChronology(input: ChronoInput): ChronoDay[] {
  const inRange = (d: string) => d >= input.from && d <= input.to
  const days = new Map<string, ChronoDay>()
  const day = (date: string): ChronoDay => {
    let d = days.get(date)
    if (!d) {
      d = {
        date,
        totalSeconds: 0,
        counts: { sessions: 0, adjustments: 0, stages: 0, changes: 0 },
        scale: { from: 8, to: 20 },
        ribbon: [],
        rows: [],
        shortStarts: [],
      }
      days.set(date, d)
    }
    return d
  }

  const timers = new Map<string, TimerItem[]>()
  const adjustments = new Map<string, AdjustmentItem[]>()
  const stages = new Map<string, StageItem[]>()
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v])

  /* ── учёт и правки: по дню, к которому относятся ── */
  for (const e of input.entries) {
    if (!inRange(e.effective_date)) continue
    const d = day(e.effective_date)
    const seconds = entrySeconds(e)
    d.totalSeconds += seconds
    if (e.entry_type === 'timer' && e.started_at) {
      if (seconds < SHORT_START_S && !input.meetingEntryIds.has(e.id)) {
        d.shortStarts.push(e.started_at)
        continue
      }
      push(timers, e.effective_date, {
        kind: 'timer',
        at: e.started_at,
        id: e.id,
        taskId: e.task_id,
        start: e.started_at,
        end: e.ended_at,
        seconds,
        note: e.note?.trim() || null,
        meeting: input.meetingEntryIds.has(e.id),
      })
    } else {
      // нулевая правка (сохранили, ничего не изменив) — не событие
      if (seconds === 0) continue
      const entered = dayOf(e.created_at)
      push(adjustments, e.effective_date, {
        kind: 'adjustment',
        at: e.created_at,
        id: e.id,
        taskId: e.task_id,
        seconds,
        note: e.note?.trim() || null,
        enteredOn: entered !== e.effective_date ? entered : null,
      })
    }
  }

  /* ── этапы: «было» — предыдущее событие той же задачи ── */
  const byTask = new Map<string, StatusEventRow[]>()
  for (const ev of [...input.statusEvents].sort((a, b) => ms(a.created_at) - ms(b.created_at))) {
    const list = byTask.get(ev.task_id) ?? []
    const prev = list.at(-1)
    list.push(ev)
    byTask.set(ev.task_id, list)
    const date = dayOf(ev.created_at)
    if (!inRange(date)) continue
    push(stages, date, {
      kind: 'stage',
      at: ev.created_at,
      id: ev.id,
      taskId: ev.task_id,
      from: prev ? prev.status_id : null,
      to: ev.status_id,
      final: ev.is_final,
    })
  }

  /* ── изменения задач: поля одного сохранения — одной строкой ── */
  const changesByDay = new Map<string, TaskChangeRow[]>()
  for (const c of input.changes) {
    const date = dayOf(c.created_at)
    if (inRange(date)) push(changesByDay, date, c)
  }
  for (const [date, list] of changesByDay) {
    const d = day(date)
    const sorted = [...list].sort((a, b) => ms(a.created_at) - ms(b.created_at) || a.id - b.id)
    let current: ChangeItem | null = null
    for (const c of sorted) {
      const action = c.field === 'created' || c.field === 'deleted' ? c.field : 'edited'
      const joinable =
        current &&
        action === 'edited' &&
        current.action === 'edited' &&
        current.taskId === c.task_id &&
        ms(c.created_at) - ms(current.at) <= SAVE_GAP_MS
      if (joinable) {
        current!.fields.push({ field: c.field, old: c.old_value, new: c.new_value })
        current!.taskName = c.task_name
        continue
      }
      current = {
        kind: 'change',
        at: c.created_at,
        id: `change:${c.id}`,
        taskId: c.task_id,
        taskName: c.task_name,
        action,
        fields: action === 'edited' ? [{ field: c.field, old: c.old_value, new: c.new_value }] : [],
      }
      d.rows.push(current)
      d.counts.changes++
    }
  }

  for (const c of input.comments) {
    const date = dayOf(c.created_at)
    if (!inRange(date)) continue
    day(date).rows.push({ kind: 'comment', at: c.created_at, id: `comment:${c.id}`, taskId: c.task_id, body: c.body })
  }
  for (const f of input.files) {
    const date = dayOf(f.created_at)
    if (!inRange(date)) continue
    day(date).rows.push({ kind: 'file', at: f.created_at, id: `file:${f.id}`, taskId: f.task_id, name: f.name })
  }

  for (const [date, list] of timers) {
    const d = day(date)
    d.rows.push(...list)
    d.counts.sessions += list.length
  }
  for (const [date, list] of adjustments) {
    const d = day(date)
    d.rows.push(...groupBursts(list, 'adjustmentGroup'))
    d.counts.adjustments += list.length
  }
  for (const [date, list] of stages) {
    const d = day(date)
    d.rows.push(...groupBursts(list, 'stageGroup'))
    d.counts.stages += list.length
  }

  /* ── полоса дня и порядок строк ── */
  for (const d of days.values()) {
    const sessions = timers.get(d.date) ?? []
    const spans = sessions.map((t) => {
      const start = dayOf(t.start) === d.date ? hourOf(t.start) : 0
      const endIso = t.end ?? new Date(ms(t.start) + t.seconds * 1000).toISOString()
      const end = dayOf(endIso) === d.date ? hourOf(endIso) : 24
      return { taskId: t.taskId, start, end: Math.max(end, start) }
    })
    const from = Math.min(8, ...spans.map((s) => Math.floor(s.start)))
    const to = Math.max(20, ...spans.map((s) => Math.ceil(s.end)))
    d.scale = { from, to }
    d.ribbon = spans.map((s) => ({
      taskId: s.taskId,
      left: (s.start - from) / (to - from),
      width: Math.max(0.004, (s.end - s.start) / (to - from)),
    }))
    d.rows.sort((a, b) => ms(b.at) - ms(a.at))
    d.shortStarts.sort((a, b) => ms(a) - ms(b))
  }

  return [...days.values()]
    .filter((d) => d.rows.length || d.shortStarts.length || d.totalSeconds)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
}

/** какие строки видны при фильтре; короткие запуски — часть «Учёта» */
export function matchesFilter(row: ChronoRow, filter: ChronoFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'tracking':
      return row.kind === 'timer'
    case 'adjustments':
      return row.kind === 'adjustment' || row.kind === 'adjustmentGroup'
    case 'stages':
      return row.kind === 'stage' || row.kind === 'stageGroup'
    case 'changes':
      return row.kind === 'change' || row.kind === 'comment' || row.kind === 'file'
  }
}

/** «+1 ч», «−15 мин» — знак всегда, у правок он главное */
export function signedDuration(seconds: number, format: (s: number) => string): string {
  return seconds >= 0 ? `+${format(seconds)}` : format(seconds)
}
