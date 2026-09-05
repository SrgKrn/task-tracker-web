import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Ring } from '../components/Ring'
import { TaskListItem, isOverdue } from '../components/TaskListItem'
import { EmptyState, Logo, Overline, TaskRowSkeleton } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { tap } from '../lib/haptics'
import { currentWeekRange, formatTodayLabel, todayStr } from '../lib/period'
import { useTimeEntriesInRange } from '../lib/queries/dashboard'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useDeleteTask, useDuplicateTask, useTasks, useUpdateTask } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { useUserSettings } from '../lib/queries/userSettings'
import { elapsedHours, formatHoursRu, useTicker } from '../lib/time'
import type { Task } from '../lib/types'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const DEFAULT_DAY_NORM = 8

export function Today() {
  const today = todayStr()
  const week = useMemo(() => currentWeekRange(), [])

  const { data: tasks = [], isLoading } = useTasks()
  const { data: statuses = [] } = useStatuses()
  const { data: projects = [] } = useProjects()
  const { data: sections = [] } = useSections()
  const { data: activeTimer } = useActiveTimer()
  const { data: userSettings } = useUserSettings()
  const { data: weekEntries = [] } = useTimeEntriesInRange(`${week.from}T00:00:00`, `${week.to}T23:59:59.999`)

  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const updateTask = useUpdateTask()
  const duplicateTask = useDuplicateTask()
  const deleteTask = useDeleteTask()
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  useTicker(!!activeTimer)

  const [deletingTask, setDeletingTask] = useState<Task | null>(null)

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])

  /** факт по дням недели — из одного запроса за всю неделю */
  const factByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of weekEntries) {
      const day = e.created_at.slice(0, 10)
      map.set(day, (map.get(day) ?? 0) + e.duration_minutes / 60)
    }
    return map
  }, [weekEntries])

  const trackedTodayTaskIds = useMemo(
    () => new Set(weekEntries.filter((e) => e.created_at.slice(0, 10) === today).map((e) => e.task_id)),
    [weekEntries, today],
  )

  const liveHours = activeTimer ? elapsedHours(activeTimer.started_at) : 0
  const dayFact = (factByDay.get(today) ?? 0) + liveHours
  const dayNorm = userSettings?.planned_hours_per_day ?? DEFAULT_DAY_NORM

  const todayTasks = useMemo(
    () =>
      tasks.filter((t: Task) => {
        if (t.is_daily) return true
        if (activeTimer?.task_id === t.id) return true
        if (trackedTodayTaskIds.has(t.id)) return true
        const startsBy = !t.start_date || t.start_date <= today
        const endsAfter = !t.end_date || t.end_date >= today
        return !!(t.start_date || t.end_date) && startsBy && endsAfter
      }),
    [tasks, activeTimer, trackedTodayTaskIds, today],
  )

  const dayPlan = useMemo(
    () => todayTasks.reduce((sum, t) => sum + t.planned_hours, 0),
    [todayTasks],
  )

  const overdueTasks = useMemo(
    () => tasks.filter((t) => isOverdue(t, t.status_id ? statusById.get(t.status_id) : undefined)),
    [tasks, statusById],
  )

  const maxDayValue = Math.max(dayNorm, ...week.days.map((d) => factByDay.get(d) ?? 0))

  return (
    <div className="mx-auto flex max-w-lg flex-col lg:mx-0 lg:max-w-none lg:w-full">
      {/* шапка бренда — только на мобайле, на десктопе бренд живёт в сайдбаре */}
      <div className="safe-top flex items-center justify-between px-5 pt-4 pb-1.5 lg:hidden">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-sm font-semibold tracking-[.01em] text-slate-100">Semternity</span>
        </div>
        <Link
          to="/settings"
          className="h-[30px] w-[30px] rounded-full"
          style={{ background: '#1c1c22', border: '1px solid #2a2a30' }}
          aria-label="Настройки"
        />
      </div>

      {/* кольцо суток */}
      <div className="flex items-center gap-[18px] px-5 pt-4 pb-[18px] lg:pt-6">
        <Ring size={104} pct={(dayFact / dayNorm) * 100} state="running" centerBg="var(--s-bg)" marker>
          <span className="flex flex-col items-center gap-0.5">
            <span className="tabular font-mono text-2xl font-semibold text-slate-50">{formatHoursRu(dayFact)}</span>
            <span className="font-mono text-[9.5px] uppercase tracking-[.14em] text-slate-500">
              из {formatHoursRu(dayNorm)} ч
            </span>
          </span>
        </Ring>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Overline>{formatTodayLabel()}</Overline>
          <h1 className="text-[25px] font-semibold leading-[1.05] tracking-[-.02em] text-slate-100">Сегодня</h1>
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: 'var(--s-accent)' }} />
              <span className="font-mono text-xs text-[#b6b6be]">факт {formatHoursRu(dayFact)} ч</span>
            </span>
            <span className="flex items-center gap-2">
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: 'rgba(232,163,61,.35)' }}
              />
              <span className="font-mono text-xs text-[#8a8a92]">план {formatHoursRu(dayPlan)} ч</span>
            </span>
          </div>
        </div>
      </div>

      {/* недельный ритм */}
      <div>
        <div className="flex h-[34px] items-end gap-[5px] px-5 pb-1">
          {week.days.map((day) => {
            const fact = (factByDay.get(day) ?? 0) + (day === today ? liveHours : 0)
            const isToday = day === today
            const isPast = day < today
            const height = Math.max(fact > 0 ? 12 : 6, Math.min(100, (fact / maxDayValue) * 100))
            return (
              <span
                key={day}
                className="flex-1 rounded-[3px]"
                style={{
                  height: `${height}%`,
                  background: isToday
                    ? 'var(--s-accent)'
                    : isPast
                      ? '#26262c'
                      : fact > 0
                        ? 'rgba(232,163,61,.18)'
                        : '#1c1c22',
                }}
              />
            )
          })}
        </div>
        <div className="flex justify-between px-5 pt-1.5 font-mono text-[10px] text-slate-600">
          {WEEKDAYS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
      </div>

      {/* задачи дня */}
      <div className="flex flex-col gap-[9px] px-5 pt-5 pb-2">
        <div className="flex items-baseline justify-between">
          <Overline>На сегодня</Overline>
          <Link to="/tasks" className="text-[11.5px] text-sky-600">
            Все задачи →
          </Link>
        </div>

        {isLoading && (
          <div className="flex flex-col gap-[9px]">
            {[0, 1, 2].map((i) => (
              <TaskRowSkeleton key={i} />
            ))}
          </div>
        )}

        {!isLoading &&
          todayTasks.map((task) => (
            <TaskListItem
              key={task.id}
              task={task}
              status={task.status_id ? statusById.get(task.status_id) : undefined}
              project={projectById.get(task.project_id)}
              section={sectionById.get(task.section_id)}
              activeTimer={activeTimer}
              onStartTimer={() => startTimer.mutate(task.id, { onError })}
              onStopTimer={() => stopTimer.mutate(undefined, { onError })}
              onDuplicate={() =>
                duplicateTask.mutate(task, { onError, onSuccess: () => showSuccess('Копия создана') })
              }
              onDelete={() => setDeletingTask(task)}
            />
          ))}

        {!isLoading && todayTasks.length === 0 && (
          <EmptyState>
            На сегодня ничего не запланировано.{' '}
            <Link to="/tasks" className="text-sky-600">
              Выбрать задачу
            </Link>
          </EmptyState>
        )}

        {overdueTasks.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-[9px]">
            <Overline>Требует внимания</Overline>
            {overdueTasks.map((task) => {
              const pct = task.planned_hours > 0 ? Math.round((task.fact_hours / task.planned_hours) * 100) : 0
              const category = projectById.get(task.project_id)?.name ?? sectionById.get(task.section_id)?.name ?? ''
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
                  style={{ background: 'rgba(217,114,86,.08)', border: '1px solid rgba(217,114,86,.35)' }}
                >
                  <Ring
                    size={34}
                    pct={pct}
                    state="over"
                    track="#33231e"
                    centerBg="#161112"
                    onClick={() => {
                      tap()
                      startTimer.mutate(task.id, { onError })
                    }}
                    ariaLabel="Начать учёт"
                  >
                    <span className="tabular font-mono text-[10px] font-medium text-red-400">{pct}%</span>
                  </Ring>

                  <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
                    <p
                      title={task.name}
                      className="truncate text-[14.5px] font-medium leading-[1.3] text-slate-100"
                    >
                      {task.name}
                    </p>
                    <span className="font-mono text-[11.5px] text-red-400">
                      {category ? `${category} · ` : ''}срок прошёл {task.end_date?.slice(8, 10)}.
                      {task.end_date?.slice(5, 7)}
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={() =>
                      updateTask.mutate({ id: task.id, fields: { end_date: today } }, { onError })
                    }
                    className="shrink-0 text-xs font-medium text-red-400"
                  >
                    Перенести
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={deletingTask !== null}
        title={`Удалить «${deletingTask?.name ?? ''}»?`}
        description="Вместе с задачей удалится вся история трекинга по ней."
        onCancel={() => setDeletingTask(null)}
        onConfirm={() => {
          if (deletingTask) deleteTask.mutate(deletingTask.id, { onError })
          setDeletingTask(null)
        }}
      />
    </div>
  )
}
