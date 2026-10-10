import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Close } from './Icon'
import { PickerField } from './PickerField'
import { Overline } from './ui'
import { describeError, useToast } from '../lib/Toast'
import { useGroupModel } from '../lib/groups'
import { useCalendarEvents, useLogMeeting, useSetMeetingStatus } from '../lib/queries/calendar'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useStartTimer } from '../lib/queries/timer'
import { formatHoursMinutes } from '../lib/time'
import type { ActiveTimer, CalendarEvent, TimeEntry } from '../lib/types'

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

  const visible = events.filter((e) => e.status !== 'dismissed')
  if (visible.length === 0) return null

  function log(ev: CalendarEvent, taskId: string) {
    logMeeting.mutate(
      { event: ev, taskId },
      { onError, onSuccess: (minutes) => showSuccess(`Записано ${formatHoursMinutes(minutes / 60)} в «${titleOf(taskId)}»`) },
    )
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
    <div className="flex flex-col gap-[9px] px-5 pt-5">
      <div className="flex items-baseline justify-between">
        <Overline>Встречи</Overline>
        <Link to="/settings/calendar" className="-my-3.5 py-3.5 pl-3 text-xs text-slate-500">
          Календарь
        </Link>
      </div>
      <div
        className="flex flex-col overflow-hidden rounded-2xl [&>*+*]:border-t [&>*+*]:border-[var(--s-hairline-2)]"
        style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
      >
        {visible.map((ev) => {
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
                <span className={`tabular shrink-0 font-mono text-xs ${ongoing ? 'text-sky-600' : 'text-slate-500'}`}>
                  {clock(ev.starts_at)}–{clock(ev.ends_at)}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-sm ${muted ? 'text-slate-500' : 'text-slate-100'}`}
                  title={ev.title}
                >
                  {ev.title}
                </span>
                {ev.status === 'new' && past && !covered && (
                  <button
                    type="button"
                    onClick={() => dismiss(ev)}
                    aria-label="Не учитывать встречу"
                    className="hit-44 flex h-5 w-5 shrink-0 items-center justify-center text-slate-500"
                  >
                    <Close size={13} />
                  </button>
                )}
              </div>

              {ev.status === 'logged' && ev.task_id && (
                <span className="flex items-center gap-1.5 text-2xs text-[var(--s-success-text)]">
                  <Check size={12} /> записано {formatHoursMinutes(minutes / 60)} в «{titleOf(ev.task_id)}»
                </span>
              )}
              {ev.status === 'new' && covered && (past || ongoing) && (
                <span className="text-2xs text-slate-500">в это время уже шёл учёт</span>
              )}

              {ev.status === 'new' && past && !covered && (
                <div className="flex flex-wrap items-center gap-2">
                  {suggestion && (
                    <button
                      type="button"
                      disabled={logMeeting.isPending}
                      onClick={() => log(ev, suggestion)}
                      className="max-w-full truncate rounded-[9px] px-3 py-[7px] text-xs font-medium disabled:opacity-50"
                      style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
                    >
                      Засчитать {formatHoursMinutes(minutes / 60)} в «{titleOf(suggestion)}»
                    </button>
                  )}
                  <PickerField
                    chip
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
                      className="max-w-full truncate rounded-[9px] px-3 py-[7px] text-xs font-medium"
                      style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
                    >
                      ▶ Начать учёт в «{titleOf(suggestion)}»
                    </button>
                  ) : (
                    <PickerField
                      chip
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
      </div>
    </div>
  )
}
