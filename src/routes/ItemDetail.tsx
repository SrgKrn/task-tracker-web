import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AttachmentsBlock } from '../components/AttachmentsBlock'
import { TaskListItem } from '../components/TaskListItem'
import { ArrowLeft, ChevronDown } from '../components/Icon'
import { EmptyState, FieldLabel, Overline, Segmented } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { toDateString } from '../lib/period'
import { useGroupModel, type GroupModel } from '../lib/groups'
import { entryNote } from '../lib/notes'
import { useAttachments } from '../lib/queries/attachments'
import { useUpdateGroupItem } from '../lib/queries/groups'
import { useItemActivity } from '../lib/queries/itemActivity'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { formatHoursMinutes, formatHoursRu } from '../lib/time'
import { childrenByParent } from '../lib/tree'
import type { GroupItem, Status, Task } from '../lib/types'

type Tab = 'tasks' | 'files' | 'history'

/** сколько дней истории показывать сразу и сколько добавлять по «Показать раньше» */
const HISTORY_STEP_DAYS = 60

function daysAgo(n: number): string {
  const d = new Date()
  return toDateString(new Date(d.getFullYear(), d.getMonth(), d.getDate() - n))
}

/**
 * Карточка значения группы — проекта, клиента, раздела: описание, во что входит и что входит
 * в него, задачи, файлы как база знаний и хронология того, что по нему делалось.
 */
export function ItemDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  // вкладка в адресе: вернулись из задачи — открыта та же вкладка, а не «Задачи»
  const tab = (params.get('tab') as Tab) || 'tasks'
  const setTab = (t: Tab) => setParams(t === 'tasks' ? {} : { tab: t }, { replace: true })

  const model = useGroupModel()
  const { data: tasks = [] } = useTasks()
  const { data: statuses = [] } = useStatuses()

  const item = id ? model.itemById.get(id) : undefined
  const group = item ? model.groupById.get(item.group_id) : undefined
  const itemTasks = useMemo(() => tasks.filter((t) => !!id && t.item_ids.includes(id)), [tasks, id])
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const childrenOf = useMemo(() => childrenByParent(itemTasks), [itemTasks])
  const heads = useMemo(() => itemTasks.filter((t) => !t.parent_id), [itemTasks])
  const isDone = (t: Task) => !!t.status_id && !!statusById.get(t.status_id)?.is_final

  const totalHours = itemTasks.reduce((s, t) => s + t.fact_hours, 0)
  const activeCount = heads.filter((t) => !isDone(t)).length
  const closedCount = heads.length - activeCount

  if (!item || !group) return null
  const parent = item.parent_item_id ? model.itemById.get(item.parent_item_id) : undefined
  const parentGroup = parent ? model.groupById.get(parent.group_id) : undefined
  // что входит в это значение: проекты клиента и т. п.
  const children = model
    .childGroupsOf(group.id)
    .map((g) => ({ group: g, items: model.itemsOf(g.id).filter((i) => i.parent_item_id === item.id) }))
    .filter((c) => c.items.length > 0)

  return (
    <div className="safe-top mx-auto flex max-w-lg flex-col gap-4 px-5 pt-3.5 pb-8 lg:mx-0 lg:max-w-2xl">
      <button
        type="button"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(`/groups/${group.id}`))}
        className="-my-2.5 flex items-center gap-2 self-start py-2.5 text-sm text-slate-400"
      >
        <ArrowLeft size={15} />
        Назад
      </button>

      <div className="flex flex-col gap-1">
        <Overline>
          {group.item_name}
          {item.archived ? ' · в архиве' : ''}
        </Overline>
        <h1 className="text-2xl font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">{item.name}</h1>
        {parent && parentGroup && (
          <span className="text-xs text-slate-500">
            {parentGroup.item_name}:{' '}
            <Link to={`/items/${parent.id}`} className="text-sky-600">
              {parent.name}
            </Link>
          </span>
        )}
      </div>

      {children.map((c) => (
        <div key={c.group.id} className="flex flex-col gap-1.5">
          <FieldLabel>
            {c.group.name} · {c.items.length}
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {c.items.map((child) => (
              <Link
                key={child.id}
                to={`/items/${child.id}`}
                className="rounded-[9px] px-[13px] py-[9px] text-xs text-[var(--s-muted-text)]"
                style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)', opacity: child.archived ? 0.55 : 1 }}
              >
                {child.name}
              </Link>
            ))}
          </div>
        </div>
      ))}

      <ItemDescription item={item} />

      <div
        className="grid grid-cols-3 rounded-2xl"
        style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
      >
        {[
          { label: 'Всего, ч', value: formatHoursRu(totalHours) },
          { label: 'В работе', value: String(activeCount) },
          { label: 'Закрыто', value: String(closedCount) },
        ].map((s, i) => (
          <div
            key={s.label}
            className="flex flex-col gap-0.5 px-3.5 py-3"
            style={i > 0 ? { borderLeft: '1px solid var(--s-border)' } : undefined}
          >
            <FieldLabel>{s.label}</FieldLabel>
            <span className="tabular font-mono text-lg font-semibold text-slate-50">{s.value}</span>
          </div>
        ))}
      </div>

      <Segmented
        value={tab}
        onChange={setTab}
        className="self-start"
        options={[
          { value: 'tasks', label: 'Задачи' },
          { value: 'files', label: 'Файлы' },
          { value: 'history', label: 'Хронология' },
        ]}
      />

      {tab === 'tasks' && (
        <ItemTasks heads={heads} childrenOf={childrenOf} statusById={statusById} model={model} />
      )}
      {tab === 'files' && (
        <AttachmentsBlock
          itemId={item.id}
          taskIds={itemTasks.map((t) => t.id)}
          taskNames={new Map(itemTasks.map((t) => [t.id, t.name]))}
          title="База знаний"
          emptyText="Положите сюда всё, что нужно: договоры, доступы, презентации. Файлы из задач появятся здесь сами"
        />
      )}
      {tab === 'history' && <ItemHistory item={item} tasks={itemTasks} statusById={statusById} />}
    </div>
  )
}

/** Описание сохраняется, когда уходишь с поля: кнопки «Сохранить» здесь не нужно. */
function ItemDescription({ item }: { item: GroupItem }) {
  const update = useUpdateGroupItem()
  const { showError, showSuccess } = useToast()
  const [draft, setDraft] = useState(item.description ?? '')

  useEffect(() => {
    setDraft(item.description ?? '')
  }, [item.id, item.description])

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        const value = e.currentTarget.value.trim()
        if (value === (item.description ?? '').trim()) return
        update.mutate(
          { id: item.id, fields: { description: value } },
          { onError: (err) => showError(describeError(err)), onSuccess: () => showSuccess('Описание сохранено') },
        )
      }}
      rows={Math.min(10, Math.max(3, draft.split('\n').length + 1))}
      placeholder="Описание: кто клиент, о чём договорились, контакты, ссылки. Сохраняется само"
      className="resize-none rounded-2xl px-3.5 py-3 text-sm leading-[1.5] text-slate-100 placeholder:text-[var(--s-placeholder)]"
      style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
    />
  )
}

function ItemTasks({
  heads,
  childrenOf,
  statusById,
  model,
}: {
  heads: Task[]
  childrenOf: Map<string, Task[]>
  statusById: Map<string, Status>
  model: GroupModel
}) {
  const { data: activeTimer } = useActiveTimer()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  const [showClosed, setShowClosed] = useState(false)

  const isDone = (t: Task) => !!t.status_id && !!statusById.get(t.status_id)?.is_final
  const active = heads.filter((t) => !isDone(t))
  const closed = heads.filter(isDone)

  const row = (task: Task) => (
    <TaskListItem
      key={task.id}
      task={task}
      status={task.status_id ? statusById.get(task.status_id) : undefined}
      label={model.listLabel(task)}
      activeTimer={activeTimer}
      onStartTimer={() => startTimer.mutate(task.id, { onError })}
      onStopTimer={() => stopTimer.mutate(undefined, { onError })}
      subtasks={childrenOf.get(task.id)}
    />
  )

  if (heads.length === 0) return <EmptyState>Задач с этим значением пока нет.</EmptyState>

  return (
    <div className="flex flex-col gap-[9px]">
      {active.map(row)}
      {active.length === 0 && <p className="text-sm text-slate-500">Открытых задач нет.</p>}
      {closed.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="mt-1 flex min-h-10 items-center gap-2 self-start text-xs text-slate-500"
          >
            <span className="flex transition-transform" style={{ transform: showClosed ? 'rotate(180deg)' : undefined }}>
              <ChevronDown size={14} />
            </span>
            Закрытые · {closed.length}
          </button>
          {showClosed && closed.map(row)}
        </>
      )}
    </div>
  )
}

interface HistoryItem {
  at: string
  day: string
  text: string
  sub?: string
  hours?: number
  href?: string
  external?: boolean
  tone?: 'done' | 'file' | 'time' | 'comment' | 'new'
}

function localDay(iso: string): string {
  return toDateString(new Date(iso))
}

function dayTitle(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  const s = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' })
  // «четверг, 9 октября» → «9 октября, четверг»
  const [weekday, rest] = s.split(', ')
  return rest ? `${rest}, ${weekday}` : s
}

/**
 * Хронология по дням. Время по задаче за день — одной строкой: сотни отдельных правок
 * по 15 минут иначе погребли бы под собой всё остальное. Комментарии (и к задаче, и к сессиям
 * учёта), закрытия, файлы и новые задачи — каждое отдельно.
 */
function ItemHistory({
  item,
  tasks,
  statusById,
}: {
  item: GroupItem
  tasks: Task[]
  statusById: Map<string, Status>
}) {
  const [windowDays, setWindowDays] = useState(HISTORY_STEP_DAYS)
  const since = daysAgo(windowDays)
  const taskIds = useMemo(() => tasks.map((t) => t.id), [tasks])
  const { data: activity, isLoading } = useItemActivity(item.id, taskIds, since)
  const { data: files = [] } = useAttachments({ itemId: item.id, taskIds })

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const titleOf = (taskId: string | null) => {
    if (!taskId) return ''
    const t = taskById.get(taskId)
    if (!t) return 'удалённая задача'
    const parent = t.parent_id ? taskById.get(t.parent_id) : undefined
    return parent ? `${parent.name} / ${t.name}` : t.name
  }

  const days = useMemo(() => {
    const items: HistoryItem[] = []
    // время: задача за день — одной строкой
    const byDayTask = new Map<string, { minutes: number; at: string; taskId: string; day: string }>()
    for (const e of activity?.entries ?? []) {
      const key = `${e.effective_date}|${e.task_id}`
      const at = e.ended_at ?? e.created_at
      const cur = byDayTask.get(key)
      if (cur) {
        cur.minutes += e.duration_minutes
        if (at > cur.at) cur.at = at
      } else byDayTask.set(key, { minutes: e.duration_minutes, at, taskId: e.task_id, day: e.effective_date })
    }
    for (const v of byDayTask.values()) {
      if (v.minutes === 0) continue
      items.push({ at: v.at, day: v.day, text: titleOf(v.taskId), hours: v.minutes / 60, href: `/tasks/${v.taskId}`, tone: 'time' })
    }
    // комментарии к сессиям учёта — рядом с обычными
    for (const e of activity?.entries ?? []) {
      const note = entryNote(e)
      if (!note) continue
      const at = e.ended_at ?? e.created_at
      items.push({ at, day: e.effective_date, text: note, sub: `${titleOf(e.task_id)} · к сессии`, href: `/tasks/${e.task_id}`, tone: 'comment' })
    }
    for (const c of activity?.comments ?? []) {
      items.push({ at: c.created_at, day: localDay(c.created_at), text: c.body, sub: titleOf(c.task_id), href: `/tasks/${c.task_id}`, tone: 'comment' })
    }
    for (const ev of activity?.statusEvents ?? []) {
      const label = ev.status_id ? statusById.get(ev.status_id)?.label : undefined
      items.push({
        at: ev.created_at,
        day: localDay(ev.created_at),
        text: ev.is_final ? `Закрыта: ${titleOf(ev.task_id)}` : `${titleOf(ev.task_id)} → ${label ?? 'без статуса'}`,
        href: `/tasks/${ev.task_id}`,
        tone: ev.is_final ? 'done' : undefined,
      })
    }
    for (const f of files) {
      if (localDay(f.created_at) < since) continue
      items.push({
        at: f.created_at,
        day: localDay(f.created_at),
        text: `Файл «${f.name}»`,
        sub: f.task_id ? titleOf(f.task_id) : 'в базу знаний',
        href: f.url ?? undefined,
        external: true,
        tone: 'file',
      })
    }
    for (const t of tasks) {
      if (localDay(t.created_at) < since) continue
      items.push({
        at: t.created_at,
        day: localDay(t.created_at),
        text: t.parent_id ? `Новая подзадача: ${titleOf(t.id)}` : `Новая задача: ${t.name}`,
        href: `/tasks/${t.id}`,
        tone: 'new',
      })
    }
    const map = new Map<string, HistoryItem[]>()
    for (const it of items) map.set(it.day, [...(map.get(it.day) ?? []), it])
    return [...map.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, list]) => ({
        day,
        hours: list.reduce((s, i) => s + (i.hours ?? 0), 0),
        items: list.sort((a, b) => b.at.localeCompare(a.at)),
      }))
    // titleOf читает taskById — он в зависимостях через tasks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, files, tasks, since, statusById])

  if (tasks.length === 0) return <EmptyState>Здесь пока ничего не происходило.</EmptyState>

  const dot: Record<string, string> = {
    time: 'var(--s-accent)',
    done: 'var(--s-success)',
    file: 'var(--color-slate-400)',
    comment: 'var(--s-border-strong-2)',
    new: 'var(--s-accent-muted)',
  }

  return (
    <div className="flex flex-col gap-4">
      {isLoading && <p className="text-sm text-slate-500">Собираем историю…</p>}
      {!isLoading && days.length === 0 && (
        <p className="text-sm text-slate-500">За последние {windowDays} дней ничего не происходило.</p>
      )}
      {days.map((d) => (
        <div key={d.day} className="flex flex-col">
          <div className="flex items-baseline justify-between pb-1.5" style={{ borderBottom: '1px solid var(--s-hairline-3)' }}>
            <span className="text-sm font-semibold text-slate-100">{dayTitle(d.day)}</span>
            {d.hours !== 0 && (
              <span className="tabular font-mono text-xs font-medium text-slate-300">{formatHoursMinutes(d.hours)}</span>
            )}
          </div>
          {d.items.map((it, i) => {
            const body = (
              <>
                <span
                  className="mt-[6px] h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: dot[it.tone ?? 'comment'] }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-[1.4] text-slate-300" style={{ overflowWrap: 'anywhere' }}>
                    {it.tone === 'comment' ? `«${it.text}»` : it.text}
                  </span>
                  {it.sub && <span className="block truncate font-mono text-2xs text-slate-500">{it.sub}</span>}
                </span>
                {it.hours !== undefined && (
                  <span className="tabular shrink-0 font-mono text-xs text-slate-400">
                    {it.hours < 0 ? '−' : ''}
                    {formatHoursMinutes(Math.abs(it.hours))}
                  </span>
                )}
              </>
            )
            const cls = 'flex items-start gap-2.5 py-2'
            const style = i > 0 ? { borderTop: '1px solid var(--s-hairline-3)' } : undefined
            if (it.href && it.external)
              return (
                <a key={i} href={it.href} target="_blank" rel="noopener noreferrer" className={cls} style={style}>
                  {body}
                </a>
              )
            if (it.href)
              return (
                <Link key={i} to={it.href} className={cls} style={style}>
                  {body}
                </Link>
              )
            return (
              <div key={i} className={cls} style={style}>
                {body}
              </div>
            )
          })}
        </div>
      ))}
      {!isLoading && (
        <button
          type="button"
          onClick={() => setWindowDays((n) => n + HISTORY_STEP_DAYS)}
          className="h-11 rounded-[14px] text-sm text-slate-400"
          style={{ border: '1px solid var(--s-border-strong-2)' }}
        >
          Показать раньше
        </button>
      )}
    </div>
  )
}

