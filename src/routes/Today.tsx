import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DayPlanSheet } from '../components/DayPlanSheet'
import { MeetingsBlock } from '../components/MeetingsBlock'
import { Ring } from '../components/Ring'
import { ArrowRight } from '../components/Icon'
import { TaskListItem, isOverdue } from '../components/TaskListItem'
import { Button, ClientDot, ListGroup, Overline, Sheet, TaskRowSkeleton } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { tap } from '../lib/haptics'
import { PlayGlyph } from '../components/Ring'
import {
  addDays,
  currentWeekRange,
  formatDueDate,
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
import { dayNormFor, normSettingsOf } from '../lib/norm'
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
  const dayNorm = dayNormFor(today, normSettingsOf(userSettings)) ?? DEFAULT_DAY_NORM

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
        color={model.colorOf(task)}
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
  const normPct = (dayNorm / maxDayValue) * 100
  const weekTotal = week.days.reduce((sum, d) => sum + (factByDay.get(d) ?? 0), 0) + liveHours
  const dayOver = dayFact - dayNorm

  return (
    <div className="page page-wide mx-auto flex max-w-lg flex-col">
      {/* кольцо суток. Строки бренда с пустым аватаром больше нет: она занимала 48 px и ничего
          не делала — дата уже над заголовком, аккаунт в «Ещё» */}
      {/* отступ под «чёлку» — на обёртке: класс safe-top перебивает собственный отступ блока */}
      <div className="safe-top">
      <div className="flex items-center gap-[18px] px-5 pt-5 pb-[18px] lg:pt-6">
        <Ring size={104} pct={(dayFact / dayNorm) * 100} state="running" centerBg="var(--bg)" marker>
          <span className="flex flex-col items-center gap-0.5">
            <span className="tabular font-mono text-xl font-medium text-text">{formatHoursRu(dayFact)}</span>
            <span className="text-sm text-text-secondary">из {formatHoursRu(dayNorm)} ч</span>
          </span>
        </Ring>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <Overline>{formatTodayLabel()}</Overline>
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">Сегодня</h1>
          {/*
            Раньше здесь стояли «факт» (дублировал цифру в кольце) и «план» — сумма
            полных планов всех задач дня. Показываем то, что относится к сегодняшнему дню.
            Фразы — обычным шрифтом: моноширинный остаётся только у чисел.
          */}
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="flex items-center gap-2 text-text">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
              <span>
                {dayFact >= dayNorm ? 'Норма дня выполнена' : `Осталось ${formatHoursMinutes(dayNorm - dayFact)}`}
                {dayOver >= 0.05 && (
                  <span className="text-danger-text"> · +{formatHoursMinutes(dayOver)}</span>
                )}
              </span>
            </span>
            <span className="flex items-center gap-2 text-text-secondary">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--ring-idle)]" />
              <span className="first-letter:uppercase">{todayCountLabel}</span>
            </span>
          </div>
        </div>
      </div>
      </div>

      {/*
        Недельный ритм: тонкие столбики и пунктир нормы дня — сразу видно, какой день был
        выше нормы, а какой ниже. Значения подписаны: иначе «сколько было во вторник» не узнать.
      */}
      {/* десктоп: неделя — справа и остаётся на месте при прокрутке, списки дня — слева */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10">
      <div className="px-5 lg:sticky lg:top-6 lg:order-2 lg:mt-5 lg:rounded-md lg:border lg:border-border lg:bg-surface lg:p-4">
        <div className="mb-3 hidden items-baseline justify-between lg:flex">
          <Overline>Неделя</Overline>
          <span className="tabular font-mono text-sm text-text">{formatHoursRu(weekTotal)} ч</span>
        </div>
        <div className="relative flex h-14 items-end gap-1.5 lg:h-24">
          <span
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border-strong"
            style={{ bottom: `${normPct}%` }}
            aria-hidden
          />
          {week.days.map((day) => {
            const fact = (factByDay.get(day) ?? 0) + (day === today ? liveHours : 0)
            const isToday = day === today
            const isFuture = day > today
            const height = fact > 0 ? Math.max(8, Math.min(100, (fact / maxDayValue) * 100)) : 3
            return (
              <span key={day} className="flex h-full flex-1 items-end justify-center">
                <span
                  className="w-3/5 max-w-7 rounded-t-xs"
                  title={`${formatHoursRu(fact)} ч`}
                  style={{
                    height: `${height}%`,
                    background: isToday
                      ? 'var(--accent)'
                      : fact > 0
                        ? 'var(--bar-past)'
                        : isFuture
                          ? 'var(--bar-future)'
                          : 'var(--bar-empty)',
                  }}
                />
              </span>
            )
          })}
        </div>
        <div className="flex gap-1.5 pt-1.5">
          {week.days.map((day, i) => {
            const fact = (factByDay.get(day) ?? 0) + (day === today ? liveHours : 0)
            const isToday = day === today
            return (
              <span key={day} className="flex flex-1 flex-col items-center gap-px">
                <span className={`text-xs ${isToday ? 'font-medium text-accent-text' : 'text-text-secondary'}`}>
                  {WEEKDAYS[i]}
                </span>
                <span
                  className={`tabular font-mono text-xs ${
                    isToday ? 'text-accent-text' : fact > dayNorm ? 'text-text' : 'text-text-secondary'
                  }`}
                >
                  {fact > 0 ? formatHoursRu(fact) : '—'}
                </span>
              </span>
            )
          })}
        </div>
      </div>

      <div className="min-w-0 lg:order-1">
      {/* просроченное — сразу под днём: самое срочное должно быть видно без прокрутки,
          а не под девятью задачами в самом низу */}
      {overdueTasks.length > 0 && (
        <div className="flex flex-col gap-2 px-5 pt-5">
          <Overline className="text-danger-text">Просрочено · {overdueTasks.length}</Overline>
          <ListGroup className="border-[var(--danger-line)]">
            {overdueTasks.map((task) => {
              const fact = rollupFact(task, childrenOf.get(task.id))
              const pct = task.planned_hours > 0 ? Math.round((fact / task.planned_hours) * 100) : 0
              // у подзадачи важнее спринт, чем группы: «Созвон» без спринта ни о чём не говорит
              const category = task.parent_id ? (taskById.get(task.parent_id)?.name ?? '') : model.listLabel(task)
              return (
                <div key={task.id} className="flex min-h-[var(--row-task)] items-center gap-3 px-3 py-2.5">
                  <Ring
                    size={32}
                    pct={pct}
                    state="over"
                    track="var(--ring-track-danger)"
                    onClick={() => {
                      tap()
                      startTimer.mutate(task.id, { onError })
                    }}
                    ariaLabel={`Начать учёт: ${task.name}`}
                  >
                    <PlayGlyph />
                  </Ring>

                  <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
                    <p title={task.name} className="truncate text-base font-medium text-text">
                      {task.name}
                    </p>
                    {/* срок первым: именно он объясняет, почему задача здесь, и при обрезке
                        должен уцелеть, а не название клиента */}
                    <span className="flex min-w-0 items-center gap-1.5 text-sm whitespace-nowrap text-text-secondary">
                      <span className="shrink-0 font-medium text-danger-text">
                        срок {task.end_date ? formatDueDate(task.end_date, today).toLowerCase() : ''}
                      </span>
                      {category && (
                        <>
                          <span aria-hidden>·</span>
                          <ClientDot color={task.parent_id ? null : model.colorOf(task)} />
                          <span className="min-w-0 truncate">{category}</span>
                        </>
                      )}
                    </span>
                  </Link>

                  <Button variant="ghost" className="-mr-1 shrink-0 text-danger-text" onClick={() => setPostponing(task)}>
                    Перенести
                  </Button>
                </div>
              )
            })}
          </ListGroup>
        </div>
      )}

      {/* встречи из календаря: прошедшие — засчитать, идущая — начать учёт */}
      <MeetingsBlock
        date={today}
        entries={weekEntries.filter((e) => e.effective_date === today)}
        activeTimer={activeTimer}
      />

      {/* задачи дня */}
      <div className="flex flex-col gap-2 px-5 pt-5 pb-2">
        <div className="flex min-h-11 items-center justify-between">
          <Overline>На сегодня</Overline>
          {/* одна ссылка вместо двух: «Все задачи» и так во вкладке внизу */}
          {todayTasks.length > 0 && (
            <Button variant="ghost" className="-mr-2 text-accent-text" onClick={() => setPlanning(true)}>
              Изменить план
            </Button>
          )}
        </div>

        {isLoading && (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <TaskRowSkeleton key={i} />
            ))}
          </div>
        )}

        {!isLoading && topRows.length > 0 && (
          <ListGroup>
            {topRows.map((task) => {
              const below = nestedOf(task.id)
              return (
                <div key={task.id} className="flex flex-col">
                  {renderRow(task, below.length > 0)}
                  {/* подзадачи спринта — под ним, с линией вложенности: рядом с ним на равных
                      они читались как отдельные задачи с тем же учётом */}
                  {below.length > 0 && (
                    <div className="ml-7 flex flex-col divide-y divide-divider border-l border-divider">
                      {below.map((sub) => (
                        <div key={sub.id}>{renderRow(sub, false)}</div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </ListGroup>
        )}

        {/* день ещё не спланирован: главное действие экрана — выбрать, не листая весь список */}
        {!isLoading && todayTasks.length === 0 && (
          <button
            type="button"
            onClick={() => setPlanning(true)}
            className="flex min-h-[72px] items-center gap-3.5 rounded-md border border-[var(--selected-border)] bg-surface-selected px-4 py-3 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-md font-semibold text-text">Что делаем сегодня?</span>
              <span className="block text-sm text-text-secondary">
                {suggestedCount > 0
                  ? `Отметьте задачи на день — ${suggestedCount} уже предложено`
                  : 'Отметьте задачи на день — это займёт полминуты'}
              </span>
            </span>
            <ArrowRight size={18} className="text-accent-text" />
          </button>
        )}
      </div>

      {/* недавние: продолжить то, чем занимались, одним касанием кольца */}
      {!isLoading && recentTasks.length > 0 && (
        <div className="flex flex-col gap-2 px-5 pt-3 pb-2">
          <Overline>Недавние</Overline>
          <ListGroup>
            {recentTasks.map((task) => {
              const parent = task.parent_id ? taskById.get(task.parent_id) : undefined
              const client = model.listLabel(parent ?? task)
              return (
                <div key={task.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                  <Ring
                    size={30}
                    pct={0}
                    state="idle"
                    onClick={() => {
                      tap()
                      startTimer.mutate(task.id, { onError })
                    }}
                    ariaLabel={`Начать учёт: ${task.name}`}
                  >
                    <PlayGlyph />
                  </Ring>
                  <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1 py-1">
                    <span className="block truncate text-base text-text">{task.name}</span>
                    {(parent || client) && (
                      <span className="flex min-w-0 items-center gap-1.5 text-sm text-text-secondary">
                        {parent && <span className="min-w-0 truncate">{parent.name}</span>}
                        {parent && client && <span aria-hidden>·</span>}
                        {client && <ClientDot color={model.colorOf(parent ?? task)} />}
                        {client && <span className="min-w-0 truncate">{client}</span>}
                      </span>
                    )}
                  </Link>
                </div>
              )
            })}
          </ListGroup>
        </div>
      )}
      </div>
      </div>

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
            <p className="truncate text-base text-text-secondary">{postponing.name}</p>
            {[
              { date: today, title: 'На сегодня' },
              { date: addDays(today, 1), title: 'На завтра' },
              { date: nextFriday(today), title: 'На пятницу' },
            ].map((o) => (
              <Button
                key={o.date}
                size="lg"
                className="justify-between"
                onClick={() => postpone(postponing, o.date, formatDueDate(o.date, today).toLowerCase())}
              >
                {o.title}
                <span className="font-mono text-sm font-normal text-text-secondary">{formatShortDate(o.date)}</span>
              </Button>
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
