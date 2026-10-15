import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Calendar, ChevronDown, ChevronUp, Comment as CommentIcon, Flag, Paperclip, Pencil, Play } from '../components/Icon'
import { Chip, ClientDot, EmptyState, ListGroup, Skeleton, Tag } from '../components/ui'
import {
  matchesFilter,
  signedDuration,
  type AdjustmentItem,
  type ChangeItem,
  type ChronoDay,
  type ChronoFilter,
  type ChronoRow,
  type FieldChange,
  type StageItem,
} from '../lib/chronology'
import { useGroupModel, type GroupModel } from '../lib/groups'
import { addDays, formatShortDate, todayStr } from '../lib/period'
import { useChronology } from '../lib/queries/chronology'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { formatDuration, plural } from '../lib/time'
import type { Status, Task } from '../lib/types'

const FILTERS: { value: ChronoFilter; label: string }[] = [
  { value: 'all', label: 'Всё' },
  { value: 'tracking', label: 'Учёт' },
  { value: 'adjustments', label: 'Правки' },
  { value: 'stages', label: 'Этапы' },
  { value: 'changes', label: 'Изменения' },
]

const SESSIONS: [string, string, string] = ['сессия', 'сессии', 'сессий']
const ADJUSTMENTS: [string, string, string] = ['правка', 'правки', 'правок']
const STAGES: [string, string, string] = ['этап', 'этапа', 'этапов']
const CHANGES: [string, string, string] = ['изменение', 'изменения', 'изменений']
const TASKS_GEN: [string, string, string] = ['задача', 'задачи', 'задач']
const STARTS: [string, string, string] = ['запуск', 'запуска', 'запусков']

const clock = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

/** «Сегодня · чт, 15 окт», «Вчера · ср, 14 окт», иначе «вт, 13 окт» */
function dayTitle(date: string): { main: string; sub?: string } {
  const today = todayStr()
  if (date === today) return { main: 'Сегодня', sub: formatShortDate(date) }
  if (date === addDays(today, -1)) return { main: 'Вчера', sub: formatShortDate(date) }
  return { main: formatShortDate(date) }
}

function dayStats(d: ChronoDay): string {
  const parts: string[] = []
  const { sessions, adjustments, stages, changes } = d.counts
  if (sessions) parts.push(`${plural(sessions, SESSIONS)}`)
  if (adjustments) parts.push(`${plural(adjustments, ADJUSTMENTS)}`)
  if (stages) parts.push(`${plural(stages, STAGES)}`)
  if (changes) parts.push(`${plural(changes, CHANGES)}`)
  return parts.join(' · ')
}

/* ── словарь: задачи, этапы, значения групп ─────────────────────── */

interface Lookup {
  task: (id: string) => Task | undefined
  /** название; у удалённой — из журнала изменений */
  name: (id: string, fallback?: string) => string
  /** «Спринт 8 · Куратор» — спринт подзадачи и значения групп в строке */
  meta: (id: string) => string
  color: (id: string) => ReturnType<GroupModel['colorOf']>
  status: (id: string | null) => Status | undefined
  model: GroupModel
}

function useLookup(): Lookup {
  const { data: tasks = [] } = useTasks()
  const { data: statuses = [] } = useStatuses()
  const model = useGroupModel()
  return useMemo(() => {
    const byId = new Map(tasks.map((t) => [t.id, t]))
    const statusById = new Map(statuses.map((s) => [s.id, s]))
    return {
      task: (id) => byId.get(id),
      name: (id, fallback) => byId.get(id)?.name.trim() || fallback || 'Удалённая задача',
      meta: (id) => {
        const t = byId.get(id)
        if (!t) return ''
        const parent = t.parent_id ? byId.get(t.parent_id)?.name.trim() : undefined
        return [parent, model.listLabel(t)].filter(Boolean).join(' · ')
      },
      color: (id) => {
        const t = byId.get(id)
        return t ? model.colorOf(t) : null
      },
      status: (id) => (id ? statusById.get(id) : undefined),
      model,
    }
  }, [tasks, statuses, model])
}

/* ── строки ─────────────────────────────────────────────────────── */

type Tone = 'neutral' | 'accent' | 'stage' | 'done'

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-text-secondary',
  accent: 'bg-accent-soft text-accent-text',
  stage: 'bg-status-progress-bg text-status-progress-text',
  done: 'bg-status-done-bg text-status-done-text',
}

function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base font-semibold ${TONE_CLASS[tone]}`} aria-hidden>
      {children}
    </span>
  )
}

/** Строка: время, значок, текст, справа — длительность. Вся строка — ссылка на задачу. */
function Row({
  time,
  badge,
  title,
  meta,
  aside,
  to,
  children,
}: {
  time: string
  badge: ReactNode
  title: ReactNode
  meta?: ReactNode
  aside?: ReactNode
  to?: string
  children?: ReactNode
}) {
  const body = (
    <>
      <span className="tabular w-10 shrink-0 pt-1 font-mono text-sm text-text-secondary">{time}</span>
      {badge}
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="min-w-0">
          <span className="block truncate text-md font-medium text-text">{title}</span>
          {meta && <span className="flex min-w-0 items-center gap-1.5 text-sm text-text-secondary">{meta}</span>}
        </span>
        {children}
      </span>
      {aside && <span className="shrink-0 pt-0.5 font-mono text-sm">{aside}</span>}
    </>
  )
  const cls = 'flex items-start gap-3 px-3.5 py-3'
  return to ? (
    <Link to={to} className={`${cls} active:bg-surface-sunken lg:hover:bg-surface-hover`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}

const fmtHours = (v: unknown) => (v == null ? '—' : `${String(v).replace('.', ',')} ч`)
const fmtDate = (v: unknown) =>
  v == null
    ? '—'
    : new Date(`${String(v)}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')

function describeField(f: FieldChange, look: Lookup): ReactNode {
  const arrow = (a: string, b: string) => (
    <>
      {a} → <span className="text-text">{b}</span>
    </>
  )
  switch (f.field) {
    case 'name':
      return <>Название: {arrow(`«${String(f.old ?? '')}»`, `«${String(f.new ?? '')}»`)}</>
    case 'planned_hours':
      return <>План: {arrow(fmtHours(f.old), fmtHours(f.new))}</>
    case 'start_date':
      return <>Начало: {arrow(fmtDate(f.old), fmtDate(f.new))}</>
    case 'end_date':
      return <>Срок: {arrow(fmtDate(f.old), fmtDate(f.new))}</>
    case 'is_daily':
      return f.new ? 'Стала ежедневной' : 'Больше не ежедневная'
    case 'parent_id':
      return f.new ? <>Перенесена в «{look.name(String(f.new))}»</> : 'Стала отдельной задачей'
    case 'item_ids': {
      const names = (v: unknown) =>
        (Array.isArray(v) ? v : [])
          .map((id) => look.model.itemById.get(String(id)))
          .filter((i) => i && look.model.groupById.get(i.group_id)?.show_in_list)
          .map((i) => i!.name)
          .join(', ') || '—'
      return <>Группы: {arrow(names(f.old), names(f.new))}</>
    }
    default:
      return 'Изменена'
  }
}

function stageLabel(look: Lookup, item: StageItem): ReactNode {
  const to = look.status(item.to)
  if (item.final) return <Tag tone="success">{to?.label ?? 'закрыт'}</Tag>
  const from = look.status(item.from)
  return (
    <span className="whitespace-nowrap text-text-secondary">
      {from ? `${from.label} → ` : '→ '}
      <span className="text-text">{to?.label ?? 'без этапа'}</span>
    </span>
  )
}

function Meta({ look, taskId, extra }: { look: Lookup; taskId: string; extra?: string }) {
  const text = [look.meta(taskId), extra].filter(Boolean).join(' · ')
  return (
    <>
      <ClientDot color={look.color(taskId)} size={7} />
      <span className="truncate">{text}</span>
    </>
  )
}

function ChronoRowView({ row, look, open, toggle }: { row: ChronoRow; look: Lookup; open: boolean; toggle: () => void }) {
  const taskLink = (id: string) => (look.task(id) ? `/tasks/${id}` : undefined)
  switch (row.kind) {
    case 'timer':
      return (
        <Row
          time={clock(row.start)}
          badge={<Badge tone="neutral">{row.meeting ? <Calendar size={14} /> : <Play size={12} />}</Badge>}
          title={look.name(row.taskId)}
          meta={<Meta look={look} taskId={row.taskId} extra={`${row.meeting ? 'встреча · ' : ''}${clock(row.start)}–${row.end ? clock(row.end) : '…'}`} />}
          aside={<span className="text-text">{formatDuration(row.seconds)}</span>}
          to={taskLink(row.taskId)}
        >
          {row.note && <span className="rounded-sm bg-surface-sunken px-2.5 py-1.5 text-sm text-text-secondary">«{row.note}»</span>}
        </Row>
      )
    case 'adjustment':
      return (
        <Row
          time={clock(row.at)}
          badge={<Badge tone="accent">±</Badge>}
          title={look.name(row.taskId)}
          meta={<Meta look={look} taskId={row.taskId} extra={row.enteredOn ? `правка, внесена ${formatShortDate(row.enteredOn)}` : 'ручная правка'} />}
          aside={<span className="text-accent-text">{signedDuration(row.seconds, formatDuration)}</span>}
          to={taskLink(row.taskId)}
        >
          {row.note && <span className="rounded-sm bg-surface-sunken px-2.5 py-1.5 text-sm text-text-secondary">«{row.note}»</span>}
        </Row>
      )
    case 'adjustmentGroup': {
      const total = row.items.reduce((s, i) => s + i.seconds, 0)
      const tasks = [...new Set(row.items.map((i) => i.taskId))]
      const sameTask = tasks.length === 1
      return (
        <GroupRow
          open={open}
          toggle={toggle}
          time={clock(row.at)}
          badge={<Badge tone="accent">±</Badge>}
          title={sameTask ? `${look.name(tasks[0])} · ${plural(row.items.length, ADJUSTMENTS)}` : `${plural(row.items.length, ADJUSTMENTS)}`}
          meta={sameTask ? look.meta(tasks[0]) : tasks.map((id) => look.name(id)).join(', ')}
          aside={<span className="text-accent-text">{signedDuration(total, formatDuration)}</span>}
        >
          {row.items.map((i: AdjustmentItem) => (
            <Link key={i.id} to={taskLink(i.taskId) ?? '#'} className="flex items-baseline justify-between gap-3 py-1 text-sm">
              <span className="min-w-0 truncate text-text-secondary">
                {i.note ? `«${i.note}»` : look.name(i.taskId)}
                {i.note && !sameTask ? ` · ${look.name(i.taskId)}` : ''}
              </span>
              <span className="shrink-0 font-mono text-accent-text">{signedDuration(i.seconds, formatDuration)}</span>
            </Link>
          ))}
        </GroupRow>
      )
    }
    case 'stage':
      return (
        <Row
          time={clock(row.at)}
          badge={<Badge tone={row.final ? 'done' : 'stage'}><Flag size={14} /></Badge>}
          title={look.name(row.taskId)}
          meta={<span className="truncate">Этап: {stageLabel(look, row)}</span>}
          to={taskLink(row.taskId)}
        />
      )
    case 'stageGroup':
      return (
        <GroupRow
          open={open}
          toggle={toggle}
          time={clock(row.at)}
          badge={<Badge tone="stage"><Flag size={14} /></Badge>}
          title={`Этапы · ${plural(row.items.length, TASKS_GEN)}`}
          meta={
            open
              ? 'за пару минут'
              : `${row.items.slice(0, 3).map((i) => look.name(i.taskId)).join(', ')}${row.items.length > 3 ? ` и ещё ${row.items.length - 3}` : ''}`
          }
        >
          {row.items.map((i: StageItem) => (
            <Link key={i.id} to={taskLink(i.taskId) ?? '#'} className="flex items-center justify-between gap-3 py-1 text-sm">
              <span className="min-w-0 truncate text-text">{look.name(i.taskId)}</span>
              {stageLabel(look, i)}
            </Link>
          ))}
        </GroupRow>
      )
    case 'change':
      return <ChangeRow row={row} look={look} to={row.action === 'deleted' ? undefined : taskLink(row.taskId)} />
    case 'comment':
      return (
        <Row
          time={clock(row.at)}
          badge={<Badge tone="neutral"><CommentIcon size={14} /></Badge>}
          title={look.name(row.taskId)}
          meta={<span className="line-clamp-2">Комментарий: «{row.body.trim()}»</span>}
          to={taskLink(row.taskId)}
        />
      )
    case 'file':
      return (
        <Row
          time={clock(row.at)}
          badge={<Badge tone="neutral"><Paperclip size={14} /></Badge>}
          title={look.name(row.taskId)}
          meta={<span className="truncate">Файл: {row.name}</span>}
          to={taskLink(row.taskId)}
        />
      )
  }
}

function ChangeRow({ row, look, to }: { row: ChangeItem; look: Lookup; to?: string }) {
  const title = look.name(row.taskId, row.taskName)
  if (row.action !== 'edited') {
    return (
      <Row
        time={clock(row.at)}
        badge={<Badge tone="neutral"><Pencil size={14} /></Badge>}
        title={row.action === 'deleted' ? row.taskName : title}
        meta={row.action === 'created' ? 'Задача создана' : 'Задача удалена'}
        to={to}
      />
    )
  }
  return (
    <Row time={clock(row.at)} badge={<Badge tone="neutral"><Pencil size={14} /></Badge>} title={title} to={to}>
      <span className="-mt-1 flex flex-col gap-0.5 text-sm text-text-secondary">
        {row.fields.map((f, i) => (
          <span key={i}>{describeField(f, look)}</span>
        ))}
      </span>
    </Row>
  )
}

function GroupRow({
  open,
  toggle,
  time,
  badge,
  title,
  meta,
  aside,
  children,
}: {
  open: boolean
  toggle: () => void
  time: string
  badge: ReactNode
  title: string
  meta: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-start gap-3 px-3.5 py-3 text-left">
        <span className="tabular w-10 shrink-0 pt-1 font-mono text-sm text-text-secondary">{time}</span>
        {badge}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-md font-medium text-text">{title}</span>
          <span className="block truncate text-sm text-text-secondary">{meta}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 pt-0.5 font-mono text-sm">
          {aside}
          {open ? <ChevronUp size={14} className="text-text-tertiary" /> : <ChevronDown size={14} className="text-text-tertiary" />}
        </span>
      </button>
      {open && <div className="flex flex-col pr-3.5 pb-3 pl-24">{children}</div>}
    </div>
  )
}

/* ── день ───────────────────────────────────────────────────────── */

function Ribbon({ day, look }: { day: ChronoDay; look: Lookup }) {
  if (!day.ribbon.length) return null
  const { from, to } = day.scale
  const ticks = [from, from + (to - from) / 4, from + (to - from) / 2, from + ((to - from) * 3) / 4, to].map(Math.round)
  return (
    <div className="flex flex-col gap-1" aria-hidden>
      <div className="relative h-3.5 overflow-hidden rounded-xs bg-surface-sunken">
        {day.ribbon.map((s, i) => {
          const color = look.color(s.taskId)
          return (
            <span
              key={i}
              className="absolute inset-y-0"
              style={{
                left: `${s.left * 100}%`,
                width: `${s.width * 100}%`,
                background: color ? `var(--${color})` : 'var(--text-tertiary)',
              }}
            />
          )
        })}
      </div>
      <div className="flex justify-between font-mono text-xs text-text-tertiary">
        {ticks.map((t, i) => (
          <span key={i}>{t}</span>
        ))}
      </div>
    </div>
  )
}

function DaySection({ day, filter, look }: { day: ChronoDay; filter: ChronoFilter; look: Lookup }) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [showShort, setShowShort] = useState(false)
  const rows = day.rows.filter((r) => matchesFilter(r, filter))
  const short = filter === 'all' || filter === 'tracking' ? day.shortStarts : []
  if (!rows.length && !short.length) return null
  const title = dayTitle(day.date)
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  return (
    <section className="flex flex-col gap-2.5" aria-label={`${title.main}${title.sub ? `, ${title.sub}` : ''}`}>
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-text first-letter:uppercase">
            {title.main}
            {title.sub && <span className="text-sm font-normal text-text-secondary"> · {title.sub}</span>}
          </h2>
          {day.totalSeconds !== 0 && (
            <span className="tabular font-mono text-md font-medium text-text">{formatDuration(day.totalSeconds)}</span>
          )}
        </div>
        <span className="text-sm text-text-secondary">{dayStats(day)}</span>
      </div>
      {(filter === 'all' || filter === 'tracking') && <Ribbon day={day} look={look} />}
      <ListGroup>
        {rows.map((r) => (
          <ChronoRowView key={r.id} row={r} look={look} open={open.has(r.id)} toggle={() => toggle(r.id)} />
        ))}
        {short.length > 0 && (
          <div className="flex flex-col bg-surface-hover">
            <button
              type="button"
              onClick={() => setShowShort((v) => !v)}
              aria-expanded={showShort}
              className="flex items-center gap-3 px-3.5 py-2.5 text-left text-sm"
            >
              <span className="w-10 shrink-0" />
              <span className="w-7 shrink-0 text-center text-text-tertiary">⋯</span>
              <span className="min-w-0 flex-1 text-text-secondary">
                {plural(short.length, STARTS)} короче минуты
                {short.length <= 3 ? ` · ${short.map(clock).join(', ')}` : ''}
              </span>
              <span className="font-medium text-accent-text">{showShort ? 'Скрыть' : 'Показать'}</span>
            </button>
            {showShort && (
              <span className="pr-3.5 pb-3 pl-24 font-mono text-sm text-text-secondary">{short.map(clock).join(', ')}</span>
            )}
          </div>
        )}
      </ListGroup>
    </section>
  )
}

/* ── экран ──────────────────────────────────────────────────────── */

export function Chronology() {
  const navigate = useNavigate()
  const today = todayStr()
  const [anchor, setAnchor] = useState(today)
  const [filter, setFilter] = useState<ChronoFilter>('all')
  const look = useLookup()
  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useChronology(anchor)
  const dateInput = useRef<HTMLInputElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  const days = useMemo(() => data?.pages.flatMap((p) => p.days) ?? [], [data])
  const visible = days.filter((d) => d.rows.some((r) => matchesFilter(r, filter)) || ((filter === 'all' || filter === 'tracking') && d.shortStarts.length))

  // следующая неделя — когда низ списка показался на экране
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasNextPage) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) fetchNextPage()
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, visible.length, data?.pages.length])

  // на компьютере клик по прозрачному полю календарь не открывает — просим явно
  function pickDate() {
    try {
      dateInput.current?.showPicker?.()
    } catch {
      // браузер открыл календарь сам или не умеет showPicker — ничего страшного
    }
  }

  return (
    <div className="safe-top-page page mx-auto flex max-w-lg flex-col gap-4 overflow-x-clip px-5 pt-3.5 pb-8">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="-ml-0.5 flex h-11 items-center gap-1.5 self-start text-md text-text-secondary"
        >
          <ArrowLeft size={16} />
          Назад
        </button>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">Хронология</h1>
          {/* поле даты лежит поверх значка и само ловит нажатие — так календарь открывается и на
              iPhone; обрезано кругом: у iOS своя ширина поля, и раньше страница уезжала вбок */}
          <label className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-strong bg-surface text-text">
            <Calendar size={18} />
            <span className="sr-only">Перейти к дате</span>
            <input
              ref={dateInput}
              type="date"
              max={today}
              value={anchor}
              onChange={(e) => e.target.value && setAnchor(e.target.value > today ? today : e.target.value)}
              onClick={pickDate}
              className="absolute inset-0 h-full w-full min-w-0 cursor-pointer appearance-none opacity-0"
            />
          </label>
        </div>
        {anchor !== today && (
          <button type="button" onClick={() => setAnchor(today)} className="self-start text-sm font-medium text-accent-text">
            С {formatShortDate(anchor)} назад · к сегодня
          </button>
        )}
      </div>

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: 'none' }} role="group" aria-label="Что показывать">
        {FILTERS.map((f) => (
          <Chip key={f.value} active={filter === f.value} onClick={() => setFilter(f.value)}>
            {f.label}
          </Chip>
        ))}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}
      {isError && (
        <EmptyState title="Не удалось загрузить" action={<button type="button" onClick={() => refetch()} className="text-sm font-medium text-accent-text">Повторить</button>}>
          Проверьте связь и попробуйте ещё раз.
        </EmptyState>
      )}
      {!isLoading && !isError && !visible.length && !hasNextPage && (
        <EmptyState title="Пока пусто">Здесь появятся учёт, ручные правки, смены этапов и изменения задач — по дням.</EmptyState>
      )}

      <div className="flex flex-col gap-7">
        {visible.map((d) => (
          <DaySection key={d.date} day={d} filter={filter} look={look} />
        ))}
      </div>

      {/* неделя подгружается сама при прокрутке; кнопка — на случай, если наблюдатель не сработал */}
      <div ref={sentinel} className="flex min-h-11 items-center justify-center text-sm text-text-tertiary">
        {isFetchingNextPage ? (
          'Загружаем…'
        ) : hasNextPage ? (
          <button type="button" onClick={() => fetchNextPage()} className="h-11 px-4 font-medium text-accent-text">
            Показать ещё
          </button>
        ) : visible.length ? (
          'Раньше записей нет'
        ) : null}
      </div>
    </div>
  )
}
