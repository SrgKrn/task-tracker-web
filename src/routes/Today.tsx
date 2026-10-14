import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DayPlanSheet } from '../components/DayPlanSheet'
import { MeetingsBlock } from '../components/MeetingsBlock'
import { Ring } from '../components/Ring'
import { ArrowRight } from '../components/Icon'
import { TaskListItem, isOverdue } from '../components/TaskListItem'
import { Logo, Overline, Sheet, TaskRowSkeleton } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { tap } from '../lib/haptics'
import { PlayGlyph } from '../components/Ring'
import {
  addDays,
  currentWeekRange,
  formatShortDate,
  formatTodayLabel,
  nextFriday,
  todayStr,
} from '../lib/period'
import { useTimeEntriesInRange } from '../lib/queries/dashboard'
import { useGroupModel } from '../lib/groups'
import { useStatuses } from '../lib/queries/statuses'
import { useDeleteTask, useDuplicateTask, useSetPlanDate, useTasks, useUpdateTask } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { useUserSettings } from '../lib/queries/userSettings'
import { TASKS, elapsedHours, entryMinutes, formatHoursMinutes, formatHoursRu, plural, useTicker } from '../lib/time'
import { isInDay, planSections } from '../lib/dayPlan'
import { childrenByParent, deleteDescription, rollupFact } from '../lib/tree'
import type { Task } from '../lib/types'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const DEFAULT_DAY_NORM = 8

export function Today() {
  const today = todayStr()
  const week = useMemo(() => currentWeekRange(), [])

  const { data: tasks = [], isLoading } = useTasks()
  const { data: statuses = [] } = useStatuses()
  const model = useGroupModel()
  const { data: activeTimer } = useActiveTimer()
  const { data: userSettings } = useUserSettings()
  const { data: weekEntries = [] } = useTimeEntriesInRange(week.from, week.to)

  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const updateTask = useUpdateTask()
  const setPlanDate = useSetPlanDate()
  const duplicateTask = useDuplicateTask()
  const deleteTask = useDeleteTask()
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  useTicker(!!activeTimer)

  const [deletingTask, setDeletingTask] = useState<Task | null>(null)
  const [postponing, setPostponing] = useState<Task | null>(null)
  const [planning, setPlanning] = useState(false)
  // «Недавние» — две недели учёта: задачи, к которым возвращаются, но не на сегодня
  const recentFrom = useMemo(() => addDays(today, -13), [today])
  const { data: recentEntries = [] } = useTimeEntriesInRange(recentFrom, today)

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const childrenOf = useMemo(() => childrenByParent(tasks), [tasks])

  /** факт по дням недели — из одного запроса за всю неделю */
  const factByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of weekEntries) {
      const day = e.effective_date
      map.set(day, (map.get(day) ?? 0) + entryMinutes(e) / 60)
    }
    return map
  }, [weekEntries])

  const trackedTodayTaskIds = useMemo(
    () => new Set(weekEntries.filter((e) => e.effective_date === today).map((e) => e.task_id)),
    [weekEntries, today],
  )

  const liveHours = activeTimer ? elapsedHours(activeTimer.started_at) : 0
  const dayFact = (factByDay.get(today) ?? 0) + liveHours
  const dayNorm = userSettings?.planned_hours_per_day ?? DEFAULT_DAY_NORM

  /*
   * День — это то, что выбрано на сегодня (plan_date), ежедневные задачи и всё, по чему идёт
   * или шёл учёт: начатая «не из плана» задача подтягивается сама. Раньше сюда падало всё,
   * чей срок захватывает сегодня, — спринты и длинные задачи висели в списке неделями, и он
   * не отвечал на вопрос «чем я занимаюсь сегодня». Срок теперь только подсказывает выбор.
   */
  const todayTasks = useMemo(
    () => tasks.filter((t: Task) => isInDay(t, today, activeTimer?.task_id, trackedTodayTaskIds)),
    [tasks, activeTimer, trackedTodayTaskIds, today],
  )

  const isDone = useCallback((t: Task) => !!(t.status_id && statusById.get(t.status_id)?.is_final), [statusById])
  /*
   * Счётчик под «Сегодня» раньше считал все строки, включая уже закрытые, — «5 задач на
   * день» при трёх, которые осталось сделать. Теперь открытые идут первыми и считаются
   * отдельно от готовых: число совпадает с тем, что видно.
   */
  const openToday = todayTasks.filter((t) => !isDone(t))
  const doneToday = todayTasks.length - openToday.length
  const todayRows = [...openToday, ...todayTasks.filter(isDone)]
  const todayCountLabel =
    openToday.length > 0
      ? `${plural(openToday.length, TASKS)} на день${doneToday ? ` · ${doneToday} готово` : ''}`
      : doneToday > 0
        ? `всё на день готово · ${doneToday}`
        : 'задач на день нет'

  /*
   * Подзадача, чей спринт тоже в списке дня, встаёт под него; остальные — на верхний
   * уровень со строкой «↳ спринт» над названием.
   */
  const inToday = new Set(todayRows.map((t) => t.id))
  const topRows = todayRows.filter((t) => !(t.parent_id && inToday.has(t.parent_id)))
  const nestedOf = (id: string) => todayRows.filter((t) => t.parent_id === id)

  function renderRow(task: Task, subtasksBelow: boolean) {
    return (
      <TaskListItem
        task={task}
        status={task.status_id ? statusById.get(task.status_id) : undefined}
        label={model.listLabel(task)}
        activeTimer={activeTimer}
        onStartTimer={() => startTimer.mutate(task.id, { onError })}
        onStopTimer={() => stopTimer.mutate(undefined, { onError })}
        onDuplicate={() => duplicateTask.mutate({ task }, { onError, onSuccess: () => showSuccess('Копия создана') })}
        onDelete={() => setDeletingTask(task)}
        // снять можно только то, что выбрано: учёт и ежедневные задачи держат её в дне сами
        onUnplan={
          task.plan_date === today && !lockedIds.has(task.id)
            ? () => setPlanDate.mutate({ ids: [task.id], date: null }, { onError })
            : undefined
        }
        subtasks={childrenOf.get(task.id)}
        expandable={false}
        subtasksBelow={subtasksBelow}
        // под своим спринтом строка «↳ спринт» лишняя — вложенность видна и так
        parentName={task.parent_id && !inToday.has(task.parent_id) ? taskById.get(task.parent_id)?.name : undefined}
      />
    )
  }

  /** задачи с учётом за две недели, свежие первыми — для «Недавних» и подсказок выбора */
  const recentTaskIds = useMemo(() => {
    const ids: string[] = []
    const sorted = [...recentEntries]
      .filter((e) => e.entry_type === 'timer')
      .sort((a, b) => (b.started_at ?? b.created_at).localeCompare(a.started_at ?? a.created_at))
    for (const e of sorted) if (!ids.includes(e.task_id)) ids.push(e.task_id)
    return ids
  }, [recentEntries])

  /** Недавние: последние задачи с учётом, открытые и не из списка на сегодня. */
  const recentTasks = useMemo(() => {
    const shown = new Set(todayTasks.map((t) => t.id))
    const ids: string[] = []
    for (const taskId of recentTaskIds) {
      const t = taskById.get(taskId)
      if (!t || shown.has(t.id) || isDone(t)) continue
      const parent = t.parent_id ? taskById.get(t.parent_id) : undefined
      if (parent && isDone(parent)) continue
      ids.push(t.id)
      if (ids.length >= 4) break
    }
    return ids.map((id) => taskById.get(id)!)
  }, [recentTaskIds, todayTasks, taskById, isDone])

  /* выбор на день: что предложить и что уже выбрано */
  // расчёт дешёвый, а ручная мемоизация с Set'ами мешала компилятору React оптимизировать экран
  const lockedIds = new Set(trackedTodayTaskIds)
  if (activeTimer) lockedIds.add(activeTimer.task_id)
  for (const t of tasks) if (t.is_daily) lockedIds.add(t.id)
  const sections = planSections({ tasks, childrenOf, isDone, today, recentTaskIds, lockedIds })
  const plannedIds = new Set(sections.find((s) => s.key === 'planned')?.tasks.map((t) => t.id) ?? [])
  const suggestedCount = sections
    .filter((s) => s.key === 'carry' || s.key === 'due')
    .reduce((n, s) => n + s.tasks.length, 0)
  const planMeta = useCallback(
    (t: Task) => {
      const parent = t.parent_id ? taskById.get(t.parent_id) : undefined
      return [parent?.name, model.listLabel(parent ?? t)].filter(Boolean).join(' · ')
    },
    [taskById, model],
  )

  /** срок переносится с отменой: «Вернуть» ставит прежний */
  function postpone(task: Task, date: string, label: string) {
    setPostponing(null)
    const previous = task.end_date
    updateTask.mutate(
      { id: task.id, fields: { end_date: date } },
      {
        onError,
        onSuccess: () =>
          showSuccess(`Срок — ${label}`, {
            label: 'Вернуть',
            onAction: () => updateTask.mutate({ id: task.id, fields: { end_date: previous } }, { onError }),
          }),
      },
    )
  }

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
          <span className="text-base font-semibold tracking-[.01em] text-slate-100">Semternity</span>
        </div>
        <Link
          to="/settings"
          className="hit-44 block h-[30px] w-[30px] rounded-full"
          style={{ background: 'var(--s-avatar)', border: '1px solid var(--s-avatar-border)' }}
          aria-label="Настройки"
        />
      </div>

      {/* кольцо суток */}
      <div className="flex items-center gap-[18px] px-5 pt-4 pb-[18px] lg:pt-6">
        <Ring size={104} pct={(dayFact / dayNorm) * 100} state="running" centerBg="var(--s-bg)" marker>
          <span className="flex flex-col items-center gap-0.5">
            <span className="tabular font-mono text-xl font-semibold text-slate-50">{formatHoursRu(dayFact)}</span>
            <span className="font-mono text-xs uppercase tracking-[.14em] text-slate-500">
              из {formatHoursRu(dayNorm)} ч
            </span>
          </span>
        </Ring>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Overline>{formatTodayLabel()}</Overline>
          <h1 className="text-xl font-semibold leading-[1.05] tracking-[-.02em] text-slate-100">Сегодня</h1>
          {/*
            Раньше здесь стояли «факт» (дублировал цифру в кольце) и «план» — сумма
            полных планов всех задач дня. Задача на 12 часов, растянутая на три недели,
            целиком падала в сегодняшний план, и в восьмичасовом дне выходило «план 27 ч».
            Показываем то, что действительно относится к сегодняшнему дню.
          */}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: 'var(--s-accent)' }} />
              <span className="font-mono text-sm text-[var(--s-text-soft)]">
                {dayFact >= dayNorm
                  ? 'норма дня выполнена'
                  : `осталось ${formatHoursMinutes(dayNorm - dayFact)}`}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: 'var(--s-accent-muted)' }}
              />
              <span className="font-mono text-sm text-[var(--s-faint-text)]">
                {todayCountLabel}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/*
        Недельный ритм. Раньше полоса была 34px высотой с минимумом 12%: при факте
        1,6 / 3,5 / 3 ч столбики отличались на несколько пикселей и читались как семь
        одинаковых чёрточек. Стало выше, с подписанными значениями — иначе узнать
        «сколько было во вторник» было нельзя вообще ничем.
      */}
      <div className="px-5">
        <div className="flex h-14 items-end gap-1.5">
          {week.days.map((day) => {
            const fact = (factByDay.get(day) ?? 0) + (day === today ? liveHours : 0)
            const isToday = day === today
            const isFuture = day > today
            const height = fact > 0 ? Math.max(10, Math.min(100, (fact / maxDayValue) * 100)) : 3
            return (
              <span
                key={day}
                className="flex-1 rounded-[3px]"
                title={`${formatHoursRu(fact)} ч`}
                style={{
                  height: `${height}%`,
                  background: isToday
                    ? 'var(--s-accent)'
                    : fact > 0
                      ? 'var(--s-bar-past)'
                      : isFuture
                        ? 'var(--s-bar-future)'
                        : 'var(--s-bar-empty)',
                }}
              />
            )
          })}
        </div>
        <div className="flex gap-1.5 pt-1.5">
          {week.days.map((day, i) => {
            const fact = (factByDay.get(day) ?? 0) + (day === today ? liveHours : 0)
            const isToday = day === today
            return (
              <span key={day} className="flex flex-1 flex-col items-center gap-px">
                <span className={`font-mono text-xs ${isToday ? 'text-brass-600' : 'text-slate-600'}`}>
                  {WEEKDAYS[i]}
                </span>
                <span
                  className={`tabular font-mono text-xs ${isToday ? 'text-brass-600' : 'text-slate-500'}`}
                >
                  {fact > 0 ? formatHoursRu(fact) : '—'}
                </span>
              </span>
            )
          })}
        </div>
      </div>

      {/* встречи из календаря: прошедшие — засчитать, идущая — начать учёт */}
      <MeetingsBlock
        date={today}
        entries={weekEntries.filter((e) => e.effective_date === today)}
        activeTimer={activeTimer}
      />

      {/* задачи дня */}
      <div className="flex flex-col gap-[9px] px-5 pt-5 pb-2">
        <div className="flex items-baseline justify-between">
          <Overline>На сегодня</Overline>
          <div className="flex items-center gap-4">
            {todayTasks.length > 0 && (
              <button
                type="button"
                onClick={() => setPlanning(true)}
                className="-my-3.5 py-3.5 text-sm font-medium text-brass-600"
              >
                Выбрать
              </button>
            )}
            <Link to="/tasks" className="-my-3.5 py-3.5 text-sm text-brass-600">
              <span className="flex items-center gap-1">Все задачи <ArrowRight size={13} /></span>
            </Link>
          </div>
        </div>

        {isLoading && (
          <div className="flex flex-col gap-[9px]">
            {[0, 1, 2].map((i) => (
              <TaskRowSkeleton key={i} />
            ))}
          </div>
        )}

        {!isLoading &&
          topRows.map((task) => {
            const below = nestedOf(task.id)
            return (
              <div key={task.id} className="flex flex-col gap-1.5">
                {renderRow(task, below.length > 0)}
                {/* подзадачи спринта — под ним, с линией вложенности: рядом с ним на равных
                    они читались как отдельные задачи с тем же учётом */}
                {below.length > 0 && (
                  <div className="ml-4 flex flex-col gap-1.5 pl-3" style={{ borderLeft: '2px solid var(--s-hairline-2)' }}>
                    {below.map((sub) => (
                      <div key={sub.id}>{renderRow(sub, false)}</div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

        {/* день ещё не спланирован: главное действие экрана — выбрать, не листая весь список */}
        {!isLoading && todayTasks.length === 0 && (
          <button
            type="button"
            onClick={() => setPlanning(true)}
            className="flex min-h-[72px] items-center gap-3.5 rounded-[18px] px-4 py-3 text-left"
            style={{ background: 'var(--s-accent-ghost)', border: '1px solid var(--s-accent)' }}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-md font-semibold text-slate-100">Что делаем сегодня?</span>
              <span className="block text-sm text-[var(--s-text-soft)]">
                {suggestedCount > 0
                  ? `Отметьте задачи на день — ${suggestedCount} уже предложено`
                  : 'Отметьте задачи на день — это займёт полминуты'}
              </span>
            </span>
            <ArrowRight size={18} className="text-brass-600" />
          </button>
        )}

        {overdueTasks.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-[9px]">
            <Overline>Требует внимания</Overline>
            {overdueTasks.map((task) => {
              const fact = rollupFact(task, childrenOf.get(task.id))
              const pct = task.planned_hours > 0 ? Math.round((fact / task.planned_hours) * 100) : 0
              // у подзадачи важнее спринт, чем группы: «Созвон» без спринта ни о чём не говорит
              const category = task.parent_id ? (taskById.get(task.parent_id)?.name ?? '') : model.listLabel(task)
              return (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
                  style={{ background: 'var(--s-danger-ghost)', border: '1px solid var(--s-danger-line)' }}
                >
                  <Ring
                    size={34}
                    pct={pct}
                    state="over"
                    track="var(--s-danger-track)"
                    centerBg="var(--s-danger-center)"
                    onClick={() => {
                      tap()
                      startTimer.mutate(task.id, { onError })
                    }}
                    ariaLabel="Начать учёт"
                  >
                    <span className="tabular font-mono text-xs font-medium text-terra-400">{pct}%</span>
                  </Ring>

                  {/* мета в одну строку с обрезкой: раньше она переносилась, наезжала на
                      «Перенести» и уводила кольцо от центра карточки */}
                  <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
                    <p
                      title={task.name}
                      className="truncate text-base font-medium leading-[1.3] text-slate-100"
                    >
                      {task.name}
                    </p>
                    {/* срок идёт первым: именно он объясняет, почему задача в этом блоке,
                        и при обрезке должен уцелеть, а не название проекта */}
                    <span className="block truncate font-mono text-sm text-terra-400">
                      срок {task.end_date?.slice(8, 10)}.{task.end_date?.slice(5, 7)}
                      {category ? ` · ${category}` : ''}
                    </span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => setPostponing(task)}
                    className="-my-3 shrink-0 py-3 pl-2 text-sm font-medium text-terra-400"
                  >
                    Перенести
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* недавние: продолжить то, чем занимались, одним касанием кольца */}
      {!isLoading && recentTasks.length > 0 && (
        <div className="flex flex-col gap-[9px] px-5 pt-3 pb-2">
          <Overline>Недавние</Overline>
          <div
            className="flex flex-col overflow-hidden rounded-2xl [&>*+*]:border-t [&>*+*]:border-[var(--s-hairline-2)]"
            style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
          >
            {recentTasks.map((task) => {
              const parent = task.parent_id ? taskById.get(task.parent_id) : undefined
              const meta = [parent?.name, model.listLabel(parent ?? task)].filter(Boolean).join(' · ')
              return (
                <div key={task.id} className="flex items-center gap-3 px-3 py-2">
                  <Ring
                    size={30}
                    pct={0}
                    state="idle"
                    centerBg="var(--s-surface)"
                    onClick={() => {
                      tap()
                      startTimer.mutate(task.id, { onError })
                    }}
                    ariaLabel={`Начать учёт: ${task.name}`}
                  >
                    <PlayGlyph />
                  </Ring>
                  <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1 py-1">
                    <span className="block truncate text-base text-slate-100">{task.name}</span>
                    {meta && <span className="block truncate font-mono text-xs text-slate-500">{meta}</span>}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {planning && (
        <DayPlanSheet
          open
          onClose={() => setPlanning(false)}
          sections={sections}
          planned={plannedIds}
          today={today}
          metaOf={planMeta}
          onSave={({ add, remove }) => {
            setPlanning(false)
            if (add.length) setPlanDate.mutate({ ids: add, date: today }, { onError })
            if (remove.length) setPlanDate.mutate({ ids: remove, date: null }, { onError })
          }}
        />
      )}

      <Sheet open={postponing !== null} onClose={() => setPostponing(null)} title="Перенести срок">
        {postponing && (
          <div className="flex flex-col gap-2 pb-2">
            <p className="truncate text-base text-slate-400">{postponing.name}</p>
            {[
              { date: today, label: 'сегодня', title: 'На сегодня' },
              { date: addDays(today, 1), label: 'завтра', title: 'На завтра' },
              { date: nextFriday(today), label: formatShortDate(nextFriday(today)), title: `На пятницу, ${formatShortDate(nextFriday(today)).replace(/^[^,]+, /, '')}` },
            ].map((o) => (
              <button
                key={o.date}
                type="button"
                onClick={() => postpone(postponing, o.date, o.label)}
                className="flex h-12 items-center justify-between rounded-[14px] px-4 text-base font-medium text-slate-100"
                style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-border)' }}
              >
                {o.title}
                <span className="font-mono text-sm text-slate-500">{formatShortDate(o.date)}</span>
              </button>
            ))}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={deletingTask !== null}
        title={`Удалить «${deletingTask?.name ?? ''}»?`}
        description={deleteDescription(deletingTask ? (childrenOf.get(deletingTask.id)?.length ?? 0) : 0)}
        onCancel={() => setDeletingTask(null)}
        onConfirm={() => {
          if (deletingTask) deleteTask.mutate(deletingTask.id, { onError })
          setDeletingTask(null)
        }}
      />
    </div>
  )
}
