import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, Close, Plus } from './Icon'
import { NewTaskSheet, type NewTaskPreset } from './NewTaskSheet'
import { PickerField } from './PickerField'
import { Overline, Switch } from './ui'
import { describeError, useToast } from '../lib/Toast'
import { useGroupModel } from '../lib/groups'
import { useCalendarEvents, useLinkMeetingTask, useLogMeeting, useSetMeetingStatus } from '../lib/queries/calendar'
import { toDateString } from '../lib/period'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useStartTimer } from '../lib/queries/timer'
import { formatHoursMinutes } from '../lib/time'
import type { ActiveTimer, CalendarEvent, Task, TimeEntry } from '../lib/types'

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

/** встреча уже в учёте, если таймер шёл хотя бы половину её времени */
function coveredBy(ev: CalendarEvent, sessions: { s: number; e: number }[]): boolean {
  const s = new Date(ev.starts_at).getTime()
  const e = new Date(ev.ends_at).getTime()
  let overlap = 0
  for (const x of sessions) overlap += Math.max(0, Math.min(e, x.e) - Math.max(s, x.s))
  return overlap >= (e - s) / 2
}

/**
 * Встречи дня из подключённого календаря. Прошедшую — засчитать в задачу одной кнопкой
 * (задача подобрана по прошлому выбору или имени проекта в названии), идущую — начать учёт.
 * Две и больше встречи свёрнуты до одной главной: пять встреч оттесняли задачи дня за экран.
 */
export function MeetingsBlock({
  date,
  entries,
  activeTimer,
}: {
  date: string
  entries: TimeEntry[]
  activeTimer: ActiveTimer | null | undefined
}) {
  const { data: events = [] } = useCalendarEvents(date)
  const { data: tasks = [] } = useTasks()
  const { data: statuses = [] } = useStatuses()
  const model = useGroupModel()
  const logMeeting = useLogMeeting()
  const setStatus = useSetMeetingStatus()
  const startTimer = useStartTimer()
  const linkTask = useLinkMeetingTask()
  const navigate = useNavigate()
  const { showError, showSuccess } = useToast()
  const onError = (e: unknown) => showError(describeError(e))

  // «прошла» и «идёт» меняются со временем — пересчитываем раз в минуту
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const finalIds = useMemo(() => new Set(statuses.filter((s) => s.is_final).map((s) => s.id)), [statuses])
  const titleOf = (id: string) => {
    const t = taskById.get(id)
    if (!t) return 'задача'
    const parent = t.parent_id ? taskById.get(t.parent_id) : undefined
    return parent ? `${parent.name} / ${t.name}` : t.name
  }
  // во что можно засчитать: открытые задачи и подзадачи
  const options = useMemo(
    () =>
      tasks
        .filter((t) => !(t.status_id && finalIds.has(t.status_id)))
        .filter((t) => {
          const parent = t.parent_id ? taskById.get(t.parent_id) : undefined
          return !(parent?.status_id && finalIds.has(parent.status_id))
        })
        .map((t) => {
          const label = model.listLabel(t.parent_id ? (taskById.get(t.parent_id) ?? t) : t)
          return { id: t.id, name: `${titleOf(t.id)}${label ? ` · ${label}` : ''}` }
        }),
    // titleOf читает taskById — он в зависимостях
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tasks, finalIds, taskById, model],
  )

  const sessions = useMemo(() => {
    const list = entries
      .filter((e) => e.entry_type === 'timer' && e.started_at && e.ended_at)
      .map((e) => ({ s: new Date(e.started_at!).getTime(), e: new Date(e.ended_at!).getTime() }))
    if (activeTimer) list.push({ s: new Date(activeTimer.started_at).getTime(), e: now })
    return list
  }, [entries, activeTimer, now])

  const [expanded, setExpanded] = useState(false)
  // задача из встречи (0.42): для какой встречи открыто окно и запоминать ли выбор
  const [creatingFor, setCreatingFor] = useState<CalendarEvent | null>(null)
  const [remember, setRemember] = useState(true)

  const visible = events.filter((e) => e.status !== 'dismissed')
  if (visible.length === 0) return null

  const startOf = (ev: CalendarEvent) => new Date(ev.starts_at).getTime()
  const endOf = (ev: CalendarEvent) => new Date(ev.ends_at).getTime()
  /** прошла, не засчитана и учёт в это время не шёл — ждёт решения */
  const waiting = (ev: CalendarEvent) => ev.status === 'new' && endOf(ev) <= now && !coveredBy(ev, sessions)
  /*
   * Главная встреча — та, с которой есть что делать прямо сейчас: идущая, потом последняя
   * прошедшая без учёта, потом ближайшая будущая. Если всё разобрано — последняя по времени.
   */
  const focus =
    visible.find((ev) => ev.status === 'new' && startOf(ev) <= now && now < endOf(ev)) ??
    [...visible].reverse().find(waiting) ??
    visible.find((ev) => startOf(ev) > now) ??
    visible[visible.length - 1]
  const collapsed = visible.length >= 2 && !expanded
  const shown = collapsed ? [focus] : visible
  const waitingElsewhere = visible.filter((ev) => ev !== focus && waiting(ev)).length

  /** name — для только что созданной задачи: её ещё нет в загруженном списке */
  function log(ev: CalendarEvent, taskId: string, name?: string) {
    logMeeting.mutate(
      { event: ev, taskId },
      { onError, onSuccess: (minutes) => showSuccess(`Записано ${formatHoursMinutes(minutes / 60)} в «${name ?? titleOf(taskId)}»`) },
    )
  }

  /**
   * Окно новой задачи с полями из встречи: название, срок — день встречи, план — её
   * длительность. Встрече уже подсказана задача — по умолчанию подзадача в её спринте.
   */
  function presetFor(ev: CalendarEvent): NewTaskPreset {
    const minutes = (endOf(ev) - startOf(ev)) / 60_000
    const suggested = ev.suggested_task_id ? taskById.get(ev.suggested_task_id) : undefined
    const head = suggested ? (suggested.parent_id ? taskById.get(suggested.parent_id) : suggested) : undefined
    const headOpen = head && !(head.status_id && finalIds.has(head.status_id))
    return {
      title: ev.title.trim(),
      kind: headOpen ? 'subtask' : 'task',
      parentId: headOpen ? head.id : null,
      endDate: toDateString(new Date(ev.starts_at)),
      plan: Math.max(0.25, Math.round(minutes / 15) / 4),
    }
  }

  /** что сделать главной кнопкой: прошедшую — засчитать, идущую — начать учёт, будущую — открыть */
  function meetingPhase(ev: CalendarEvent): 'past' | 'ongoing' | 'future' {
    return endOf(ev) <= now ? 'past' : startOf(ev) <= now ? 'ongoing' : 'future'
  }

  function onTaskCreated(ev: CalendarEvent, task: Task, primary: boolean) {
    linkTask.mutate({ event: ev, taskId: task.id, remember }, { onError })
    const phase = meetingPhase(ev)
    const minutes = (endOf(ev) - startOf(ev)) / 60_000
    const covered = coveredBy(ev, sessions)
    if (primary) {
      if (phase === 'past' && !covered) log(ev, task.id, task.name)
      else if (phase === 'ongoing' && !covered) startTimer.mutate(task.id, { onError })
      else navigate(`/tasks/${task.id}`)
      return
    }
    if (phase === 'past' && !covered) {
      showSuccess(`Задача «${task.name}» создана`, {
        label: `Засчитать ${formatHoursMinutes(minutes / 60)}`,
        onAction: () => log(ev, task.id, task.name),
      })
    } else if (phase === 'ongoing' && !covered) {
      showSuccess(`Задача «${task.name}» создана`, {
        label: 'Начать учёт',
        onAction: () => startTimer.mutate(task.id, { onError }),
      })
    } else {
      showSuccess(`Задача «${task.name}» создана`, { label: 'Открыть', onAction: () => navigate(`/tasks/${task.id}`) })
    }
  }

  function dismiss(ev: CalendarEvent) {
    setStatus.mutate(
      { id: ev.id, status: 'dismissed' },
      {
        onError,
        onSuccess: () =>
          showSuccess('Встреча не учитывается', {
            label: 'Вернуть',
            onAction: () => setStatus.mutate({ id: ev.id, status: 'new' }, { onError }),
          }),
      },
    )
  }

  return (
    <div className="flex flex-col gap-2 px-5 pt-5">
      <div className="flex items-baseline justify-between">
        <Overline>Встречи</Overline>
        <Link to="/settings/calendar" className="-my-3.5 py-3.5 pl-3 text-sm text-text-secondary">
          Календарь
        </Link>
      </div>
      <div
        className="flex flex-col divide-y divide-divider overflow-hidden rounded-md border border-border bg-surface"
      >
        {shown.map((ev) => {
          const start = new Date(ev.starts_at).getTime()
          const end = new Date(ev.ends_at).getTime()
          const past = end <= now
          const ongoing = start <= now && now < end
          const covered = coveredBy(ev, sessions)
          const suggestion = ev.suggested_task_id && taskById.has(ev.suggested_task_id) ? ev.suggested_task_id : null
          const minutes = Math.round((end - start) / 60_000)
          const muted = ev.status === 'logged' || (!past && !ongoing) || covered
          return (
            <div key={ev.id} className="flex flex-col gap-2 px-3.5 py-3">
              <div className="flex items-baseline gap-2.5">
                <span className={`tabular shrink-0 font-mono text-sm ${ongoing ? 'text-accent-text' : 'text-text-secondary'}`}>
                  {clock(ev.starts_at)}–{clock(ev.ends_at)}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-base ${muted ? 'text-text-secondary' : 'text-text'}`}
                  title={ev.title}
                >
                  {ev.title}
                </span>
                {ev.status === 'new' && (
                  <button
                    type="button"
                    onClick={() => {
                      setRemember(true)
                      setCreatingFor(ev)
                    }}
                    aria-label={`Создать задачу из встречи «${ev.title}»`}
                    className="hit-44 flex shrink-0 items-center gap-1 text-sm font-medium text-accent-text"
                  >
                    <Plus size={13} />
                    Задача
                  </button>
                )}
                {ev.status === 'new' && past && !covered && (
                  <button
                    type="button"
                    onClick={() => dismiss(ev)}
                    aria-label="Не учитывать встречу"
                    className="hit-44 flex h-5 w-5 shrink-0 items-center justify-center text-text-secondary"
                  >
                    <Close size={13} />
                  </button>
                )}
              </div>

              {ev.status === 'logged' && ev.task_id && (
                <span className="flex items-center gap-1.5 text-xs text-success-text">
                  <Check size={12} /> записано {formatHoursMinutes(minutes / 60)} в «{titleOf(ev.task_id)}»
                </span>
              )}
              {ev.status === 'new' && covered && (past || ongoing) && (
                <span className="text-xs text-text-secondary">в это время уже шёл учёт</span>
              )}

              {ev.status === 'new' && past && !covered && (
                <div className="flex flex-wrap items-center gap-2">
                  {suggestion && (
                    <button
                      type="button"
                      disabled={logMeeting.isPending}
                      onClick={() => log(ev, suggestion)}
                      className="min-h-10 max-w-full truncate rounded-sm bg-accent px-3 py-2 text-sm font-medium text-on-accent disabled:opacity-50"
                    >
                      Засчитать {formatHoursMinutes(minutes / 60)} в «{titleOf(suggestion)}»
                    </button>
                  )}
                  <PickerField
                    chip
                    chipLarge
                    label="Задача"
                    items={options}
                    value={null}
                    onChange={(taskId) => taskId && log(ev, taskId)}
                    placeholder="Задача"
                    emptyLabel={suggestion ? 'Другая задача' : `Засчитать ${formatHoursMinutes(minutes / 60)} в задачу`}
                    hint="Выбор запомнится: следующая такая встреча предложит ту же задачу"
                  />
                </div>
              )}

              {ev.status === 'new' && ongoing && !covered && (
                <div className="flex flex-wrap items-center gap-2">
                  {suggestion ? (
                    <button
                      type="button"
                      onClick={() => startTimer.mutate(suggestion, { onError })}
                      className="min-h-10 max-w-full truncate rounded-sm bg-accent px-3 py-2 text-sm font-medium text-on-accent"
                    >
                      ▶ Начать учёт в «{titleOf(suggestion)}»
                    </button>
                  ) : (
                    <PickerField
                      chip
                      chipLarge
                      label="Задача"
                      items={options}
                      value={null}
                      onChange={(taskId) => taskId && startTimer.mutate(taskId, { onError })}
                      placeholder="Задача"
                      emptyLabel="▶ Начать учёт в задаче"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
        {visible.length >= 2 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={!collapsed}
            className="flex min-h-11 items-center justify-between gap-2 px-3.5 text-left text-sm text-text-secondary"
          >
            <span>
              {collapsed ? `Все встречи дня · ${visible.length}` : 'Свернуть'}
              {collapsed && waitingElsewhere > 0 && (
                <span className="text-accent-text"> · ещё {waitingElsewhere} ждут учёта</span>
              )}
            </span>
            <span className="flex transition-transform duration-200" style={{ transform: collapsed ? undefined : 'rotate(180deg)' }}>
              <ChevronDown size={14} />
            </span>
          </button>
        )}
      </div>

      <NewTaskSheet
        open={!!creatingFor}
        onClose={() => setCreatingFor(null)}
        preset={creatingFor ? presetFor(creatingFor) : undefined}
        sheetTitle="Задача из встречи"
        primaryLabel={
          !creatingFor
            ? 'Создать'
            : meetingPhase(creatingFor) === 'past' && !coveredBy(creatingFor, sessions)
              ? `Создать и засчитать ${formatHoursMinutes((endOf(creatingFor) - startOf(creatingFor)) / 3_600_000)}`
              : meetingPhase(creatingFor) === 'ongoing' && !coveredBy(creatingFor, sessions)
                ? 'Создать и начать'
                : 'Создать и открыть'
        }
        onCreated={(task, primary) => creatingFor && onTaskCreated(creatingFor, task, primary)}
        extra={
          creatingFor && (
            <Switch on={remember} onChange={setRemember} label={`Запомнить для встреч «${creatingFor.title.trim()}»`} />
          )
        }
      />
    </div>
  )
}
