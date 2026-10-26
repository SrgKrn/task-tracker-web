import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AttachmentsBlock } from '../components/AttachmentsBlock'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DatePicker } from '../components/DatePicker'
import { AddTimeSheet, DurationSheet } from '../components/DurationSheet'
import { DuplicateTaskSheet } from '../components/DuplicateTaskSheet'
import { SubtractSheet, type SubtractSource } from '../components/SubtractSheet'
import { NextSprintSheet } from '../components/NextSprintSheet'
import { SprintComposition } from '../components/SprintComposition'
import { ArrowLeft, Check, ChevronDown, Comment as CommentIcon, MoreDots, Plus } from '../components/Icon'
import { Ring, StopGlyph, type RingState } from '../components/Ring'
import { QuickNoteSheet } from '../components/ActiveTimerBar'
import { isOverdue } from '../components/TaskListItem'
import { stageTone } from '../lib/stage'
import { useTimerNotePreview } from '../lib/timerNote'
import { TaskForm, type TaskFormValues } from '../components/TaskForm'
import { formatRate, type RateCurrency } from '../lib/rate'
import { PriorityField } from '../components/Priority'
import { usePriorityMethod } from '../lib/queries/userSettings'
import { CommentBar, TaskTimeline } from '../components/TaskTimeline'
import { useTip } from '../lib/tips'
import { Button, ClientDot, ListGroup, Sheet } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { formatDueDate, todayStr } from '../lib/period'
import { useGroupModel } from '../lib/groups'
import { useStatuses } from '../lib/queries/statuses'
import {
  useCreateNextSprint,
  useDeleteTask,
  useDuplicateTask,
  useTask,
  useTasks,
  useUpdateTask,
} from '../lib/queries/tasks'
import {
  useActiveTimer,
  useAdjustFactHours,
  useShiftActiveTimer,
  useStartTimer,
  useStopTimer,
  useTimeEntries,
  useSetEntryNote,
  useTrimSession,
} from '../lib/queries/timer'
import { useAddComment } from '../lib/queries/comments'
import { elapsedHours, entrySeconds, formatClock, formatHoursMinutes, useTicker } from '../lib/time'
import { useTaskSort } from '../lib/taskSort'
import { childrenByParent, deleteDescription, rollupFact, runningWithin } from '../lib/tree'

export function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  const { data: task, isFetched } = useTask(id)
  const { data: original } = useTask(task?.duplicated_from ?? undefined)
  const { data: allTasks = [] } = useTasks()
  const model = useGroupModel()
  const method = usePriorityMethod()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()

  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const duplicateTask = useDuplicateTask()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const adjustFactHours = useAdjustFactHours()
  const trimSession = useTrimSession()
  const setEntryNote = useSetEntryNote()
  const addComment = useAddComment()
  const shiftActiveTimer = useShiftActiveTimer()
  const { data: entries = [] } = useTimeEntries(id)
  const createNextSprint = useCreateNextSprint()

  const manualSort = useTaskSort() === 'manual'
  const childrenOf = useMemo(() => childrenByParent(allTasks, manualSort), [allTasks, manualSort])
  const subtasks = (id && childrenOf.get(id)) || []
  const parent = task?.parent_id ? allTasks.find((t) => t.id === task.parent_id) : undefined

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [nextSprint, setNextSprint] = useState(false)
  const [editingFact, setEditingFact] = useState(false)
  // сколько минут отнять — окно выбора «отдельной правкой или из сессии»
  const [subtracting, setSubtracting] = useState<number | null>(null)
  // окно «Добавить время»: сколько и комментарий к правке
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  // день, к которому относится ручная правка. По умолчанию сегодня — быстрый случай
  // остаётся в один тап; но исправление старых часов больше не бьёт по сегодняшнему дню
  const [adjustDate, setAdjustDate] = useState(todayStr)
  /*
   * Карточка была одной лентой: кольцо, состав, файлы, правка факта, форма и таймлайн —
   * до истории приходилось листать шесть экранов. Теперь разделы на вкладках, а шапка с
   * кольцом и кнопкой учёта всегда сверху.
   */
  // свойства теперь над вкладками — вкладки только для истории, состава и файлов
  const [menuOpen, setMenuOpen] = useState(false)
  const [stageOpen, setStageOpen] = useState(false)
  const [factOpen, setFactOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const isRunning = activeTimer?.task_id === id
  // учёт идёт по подзадаче: кольцо спринта растёт вместе с ней, хотя кнопка здесь «Начать»
  const runningInside = !!task && !isRunning && runningWithin(task, subtasks, activeTimer?.task_id)
  // подсказки 0.43: учёт — пока ничего не идёт; этап — когда по задаче уже есть факт;
  // состав — у большой задачи или когда задач стало много
  useTip('timer', !!task && !activeTimer)
  useTip('stage', !!task && task.fact_hours > 0)
  useTip('subtasks', !!task && !task.parent_id && (task.planned_hours >= 4 || allTasks.length >= 5))
  useTicker(isRunning || runningInside)
  const notePreview = useTimerNotePreview(isRunning ? activeTimer : null)

  // спринт → подзадача → спринт: карточка та же, меняется только id, и без этого новая
  // открывалась прокрученной туда, где остановились в предыдущей
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [id])

  // задачу удалили (или ссылка устарела) — возвращаемся к списку, а не показываем пустую карточку
  if (isFetched && !task) return <Navigate to="/tasks" replace />
  if (!task) return null

  const status = task.status_id ? statuses.find((s) => s.id === task.status_id) : undefined
  const values = model.valuesOf(task)

  const isSubtask = !!task.parent_id
  // куда возвращаться: у подзадачи — в её спринт, а не в общий список
  const backTo = parent ? `/tasks/${parent.id}` : '/tasks'

  const done = !!status?.is_final
  const live = (isRunning || runningInside) && activeTimer ? elapsedHours(activeTimer.started_at) : 0
  // факт спринта — вместе с подзадачами
  const fact = rollupFact(task, subtasks) + live
  const pct = task.planned_hours > 0 ? (fact / task.planned_hours) * 100 : 0
  const over = pct > 100 && !done
  const ringState: RingState = done ? 'done' : over ? 'over' : isRunning || runningInside ? 'running' : 'idle'

  const formValues: TaskFormValues = {
    name: task.name,
    item_ids: task.item_ids,
    status_id: task.status_id,
    planned_hours: task.planned_hours,
    start_date: task.start_date,
    end_date: task.end_date,
    is_daily: task.is_daily,
    parent_id: task.parent_id,
    hourly_rate: task.hourly_rate,
    rate_currency: task.rate_currency,
  }

  // подзадачу можно перенести в другой спринт; спринтом может быть только головная задача
  const sprintOptions = isSubtask
    ? allTasks.filter((t) => !t.parent_id && t.id !== task.id).map((t) => ({ id: t.id, name: t.name }))
    : undefined

  /**
   * Значение берём из самого поля, а не из состояния: если правку и уход с поля
   * разделяет меньше одного рендера (быстрый тап по кнопке, автозаполнение),
   * состояние ещё не обновилось, и сохранилось бы старое имя.
   */
  function commitRename(value: string) {
    setRenaming(false)
    if (!task) return
    const previous = task.name
    const next = value.trim()
    if (!next || next === previous) return
    updateTask.mutate(
      { id: task.id, fields: { name: next } },
      {
        onError,
        // переименование сохраняется по уходу с поля — без подтверждения непонятно,
        // записалось оно или нет
        onSuccess: () =>
          showSuccess('Название изменено', {
            label: 'Вернуть',
            onAction: () =>
              updateTask.mutate({ id: task.id, fields: { name: previous } }, { onError }),
          }),
      },
    )
  }

  /** что изменилось — для уведомления с «Вернуть» */
  function describeChange(patch: Partial<TaskFormValues>): string {
    if (patch.planned_hours !== undefined) {
      return `План: ${patch.planned_hours > 0 ? formatHoursMinutes(patch.planned_hours) : 'не задан'}`
    }
    if (patch.start_date !== undefined) return `Начало: ${patch.start_date ? formatDueDate(patch.start_date).toLowerCase() : 'не задано'}`
    if (patch.end_date !== undefined) return `Срок: ${patch.end_date ? formatDueDate(patch.end_date).toLowerCase() : 'не задан'}`
    if (patch.status_id !== undefined) {
      return `Этап: ${statuses.find((s) => s.id === patch.status_id)?.label ?? 'без этапа'}`
    }
    if (patch.is_daily !== undefined) return patch.is_daily ? 'Теперь ежедневная' : 'Больше не ежедневная'
    if (patch.hourly_rate !== undefined) {
      return patch.hourly_rate
        ? `Ставка: ${formatRate(patch.hourly_rate, (patch.rate_currency ?? 'BYN') as RateCurrency)}`
        : 'Ставка — как у клиента'
    }
    if (patch.parent_id !== undefined) {
      return `Перенесена в «${allTasks.find((t) => t.id === patch.parent_id)?.name ?? 'спринт'}»`
    }
    return 'Сохранено'
  }

  /**
   * Поле сохраняется само при изменении — кнопки «Сохранить» больше нет: её забывали
   * нажать и уходили назад, теряя правку. Уведомление говорит, что записалось, а
   * «Вернуть» ставит прежнее значение.
   */
  function saveField(patch: Partial<TaskFormValues>) {
    if (!task) return
    const keys = Object.keys(patch) as (keyof TaskFormValues)[]
    const previous = Object.fromEntries(keys.map((k) => [k, task[k as keyof typeof task]])) as Partial<TaskFormValues>
    const goingFinal = !!patch.status_id && !!statuses.find((s) => s.id === patch.status_id)?.is_final
    const label = describeChange(patch)
    updateTask.mutate(
      { id: task.id, fields: patch },
      {
        onError,
        onSuccess: () => {
          // финальный статус останавливает учёт
          if (goingFinal && isRunning) stopTimer.mutate(undefined, { onError })
          showSuccess(label, {
            label: 'Вернуть',
            onAction: () => updateTask.mutate({ id: task.id, fields: previous }, { onError }),
          })
        },
      },
    )
  }

  /** записывает новое значение факта; note — комментарий к правке, виден в истории */
  function setFact(next: number, note?: string) {
    if (!task) return
    const from = task.fact_hours
    const target = Math.max(0, next)
    if (Math.abs(target - from) < 1 / 120) return // меньше полуминуты — не пишем запись
    adjustFactHours.mutate(
      { taskId: task.id, currentFactHours: from, newFactHours: target, effectiveDate: adjustDate, note },
      {
        onError,
        onSuccess: () =>
          // правка факта пишется отдельной записью в историю — откат тоже должен быть виден
          showSuccess(`Факт: ${formatHoursMinutes(target)}`, {
            label: 'Отменить',
            onAction: () =>
              adjustFactHours.mutate(
                {
                  taskId: task.id,
                  currentFactHours: target,
                  newFactHours: from,
                  effectiveDate: adjustDate,
                },
                { onError },
              ),
          }),
      },
    )
  }

  /** отнять время выбранным способом — с отменой из уведомления */
  function subtract(minutes: number, source: SubtractSource, note: string) {
    setSubtracting(null)
    if (!task) return
    const label = formatHoursMinutes(minutes / 60)
    if (source.kind === 'separate') {
      setFact(task.fact_hours - minutes / 60, note)
      return
    }
    if (source.kind === 'session') {
      const entry = source.entry
      trimSession.mutate(
        { entry, minutes, note },
        {
          onError,
          onSuccess: () => {
            const trimmed = {
              ...entry,
              duration_seconds: entrySeconds(entry) - minutes * 60,
              duration_minutes: entry.duration_minutes - minutes,
              ended_at: entry.ended_at
                ? new Date(new Date(entry.ended_at).getTime() - minutes * 60_000).toISOString()
                : null,
            }
            showSuccess(entry.entry_type === 'timer' ? `Сессия короче на ${label}` : `Последняя правка меньше на ${label}`, {
              label: 'Вернуть',
              onAction: () =>
                trimSession.mutate(
                  { entry: trimmed, minutes: -minutes },
                  // вместе с длиной вернуть и прежний комментарий сессии
                  { onError, onSuccess: () => note && setEntryNote.mutate({ entry, note: entry.note ?? '' }, { onError }) },
                ),
            })
          },
        },
      )
      return
    }
    const timer = source.timer
    shiftActiveTimer.mutate(
      { timer, minutes },
      {
        onError,
        onSuccess: () => {
          // записи у идущей сессии ещё нет — комментарий ложится в историю задачи
          if (note) addComment.mutate({ taskId: task.id, body: `−${label} из идущей сессии: ${note}` }, { onError })
          const shifted = {
            ...timer,
            started_at: new Date(new Date(timer.started_at).getTime() + minutes * 60_000).toISOString(),
          }
          showSuccess(`Из идущей сессии −${label}`, {
            label: 'Вернуть',
            onAction: () => shiftActiveTimer.mutate({ timer: shifted, minutes: -minutes }, { onError }),
          })
        },
      },
    )
  }

  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order)
  const quickAdd = (minutes: number) => setFact(task.fact_hours + minutes / 60)
  const toFiles = () => document.getElementById('task-files')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const overdue = isOverdue(task, status)

  return (
    <div className="mx-auto flex max-w-lg flex-col lg:h-full lg:w-full lg:max-w-[var(--detail-max)]">
      {/* шапка: назад, этап пилюлей (меняется чаще всего) и меню */}
      <div className="safe-top sticky top-0 z-20 bg-bg">
        <div className="flex items-center justify-between gap-2 px-3 pt-2 pb-1">
          <Button variant="ghost" className="min-w-0" onClick={() => navigate(backTo)}>
            <ArrowLeft size={16} />
            <span className="truncate">{parent ? parent.name : 'Назад'}</span>
          </Button>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              data-tip="stage"
              onClick={() => setStageOpen(true)}
              aria-haspopup="dialog"
              className="flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-sm font-medium text-text"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: status ? `var(--status-${stageTone(status, statuses)})` : 'var(--border-strong)' }}
                aria-hidden
              />
              {status?.label ?? 'Без этапа'}
              <ChevronDown size={13} className="text-text-tertiary" />
            </button>
            <Button variant="ghost" className="w-[var(--tap)] px-0" aria-label="Действия с задачей" onClick={() => setMenuOpen(true)}>
              <MoreDots size={18} />
            </Button>
          </div>
        </div>
        {/* закреп учёта: в карточке идущей задачи нижней плашки нет — она здесь */}
        {isRunning && activeTimer && (
          <div className="mx-4 mb-2 flex items-center gap-2.5 rounded-md border border-[var(--timer-border)] bg-[var(--timer-bg)] py-1.5 pr-1.5 pl-3">
            <span className="live-dot shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--timer-text)]">{notePreview || 'Идёт учёт'}</span>
            <span className="tabular shrink-0 font-mono text-base font-medium text-[var(--timer-text)]">{formatClock(activeTimer.started_at)}</span>
            <button
              type="button"
              onClick={() => setNoteOpen(true)}
              aria-label="Комментарий"
              data-tip="timer-note"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-[var(--timer-text)]"
            >
              <CommentIcon size={16} />
            </button>
            <button
              type="button"
              onClick={() => stopTimer.mutate(undefined, { onError })}
              aria-label="Остановить учёт"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent"
            >
              <StopGlyph size={11} color="var(--on-accent)" />
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 px-5 pt-2 pb-4">
        {values.length > 0 && (
          <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-text-secondary">
            {/* каждое значение — ссылка на свою карточку: там вся история и файлы по нему */}
            {values.map((v, i) => (
              <span key={v.item.id} className="flex min-w-0 items-center gap-1.5">
                {i > 0 && <span aria-hidden>·</span>}
                {v.group.show_in_list && <ClientDot color={v.item.color} />}
                <Link to={`/items/${v.item.id}`} title={v.group.item_name} className="truncate underline-offset-4 hover:underline">
                  {v.item.name}
                </Link>
              </span>
            ))}
          </span>
        )}

        {/* название правится прямо в заголовке */}
        {renaming ? (
          <textarea
            autoFocus
            rows={2}
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={(e) => commitRename(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.currentTarget.blur()
              }
              if (e.key === 'Escape') {
                setRenaming(false)
                setDraftName(task.name)
              }
            }}
            aria-label="Название задачи"
            className="resize-none rounded-sm border border-accent bg-surface px-2.5 py-2 text-2xl font-semibold tracking-[-0.02em] text-text"
          />
        ) : (
          <h1
            title="Нажмите, чтобы переименовать"
            onClick={() => {
              setDraftName(task.name)
              setRenaming(true)
            }}
            className="cursor-text text-2xl font-semibold tracking-[-0.02em] text-text"
            style={{ textWrap: 'pretty' }}
          >
            {task.name}
          </h1>
        )}

        {original && original.name !== task.name && (
          <Link to={`/tasks/${original.id}`} className="-mt-1.5 truncate text-sm text-text-secondary">
            Продолжение: <span className="text-accent-text">{original.name}</span>
          </Link>
        )}

        {/* два главных поля: факт (нажать — правка времени) и срок */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => setFactOpen(true)}
            aria-label={`Факт ${formatHoursMinutes(fact)}, изменить`}
            className="flex min-h-18 items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5 text-left active:bg-surface-sunken"
          >
            <Ring size={40} pct={done ? 100 : pct} state={ringState} />
            <span className="flex min-w-0 flex-col">
              <span className="text-xs text-text-secondary">Факт</span>
              <span className="tabular truncate font-mono text-md font-medium text-text">{formatHoursMinutes(fact)}</span>
              <span className="truncate text-xs text-text-secondary">
                {task.planned_hours > 0 ? `из ${formatHoursMinutes(task.planned_hours)}` : 'без плана'}
              </span>
            </span>
          </button>
          <div className="flex min-h-18 flex-col justify-center gap-1 rounded-md border border-border bg-surface px-3 py-2">
            <span className={`text-xs ${overdue ? 'font-medium text-danger-text' : 'text-text-secondary'}`}>
              {overdue ? 'Срок прошёл' : 'Срок'}
            </span>
            <DatePicker small value={task.end_date} onChange={(v) => saveField({ end_date: v })} ariaLabel="Срок" />
          </div>
        </div>
        {subtasks.length > 0 && <span className="-mt-1 text-sm text-text-secondary">в самом спринте {formatHoursMinutes(task.fact_hours)}</span>}
      </div>

      {method !== 'none' && (
        <div className="px-5 pb-4">
          <PriorityField task={task} method={method} tasks={allTasks} />
        </div>
      )}

      {/* свойства — строками, как в Asana: группы, план, начало, ставка, «ежедневная» */}
      <div className="px-5">
        <TaskForm initial={formValues} statuses={statuses} compact hideStage hideDue sprints={sprintOptions} onFieldChange={saveField} />
      </div>

      {/* разделы друг под другом вместо вкладок: всё видно одной прокруткой */}
      <div className="sc flex flex-col gap-6 px-5 pt-6 pb-4 lg:min-h-0 lg:w-full lg:flex-1 lg:overflow-y-auto">
        {!isSubtask && (
          <section data-tip="subtasks" className="flex flex-col gap-2.5">
            <h2 className="flex items-baseline gap-2 text-md font-semibold text-text">
              Подзадачи
              {subtasks.length > 0 && <span className="tabular font-mono text-xs font-normal text-text-secondary">{subtasks.length}</span>}
            </h2>
            <SprintComposition
              task={task}
              subtasks={subtasks}
              statuses={statuses}
              onApplyStatus={(statusId) => saveField({ status_id: statusId })}
              onNextSprint={() => setNextSprint(true)}
            />
          </section>
        )}

        <section id="task-files" className="flex scroll-mt-24 flex-col gap-2.5">
          <h2 className="text-md font-semibold text-text">Файлы</h2>
          <AttachmentsBlock
            taskId={task.id}
            driveFolderId={values.find((v) => v.item.drive_folder_id)?.item.drive_folder_id ?? null}
            taskIds={[task.id, ...subtasks.map((c) => c.id)]}
            taskNames={subtasks.length ? new Map(subtasks.map((c) => [c.id, c.name])) : undefined}
            emptyText="Договор, ТЗ, скриншоты — откроются прямо отсюда"
          />
        </section>

        <section className="flex flex-col gap-2.5">
          <h2 className="text-md font-semibold text-text">История</h2>
          <TaskTimeline taskId={task.id} isRunning={isRunning} />
        </section>
      </div>

      {/* внизу — комментарий; пока поле пустое, кнопка справа — старт/стоп учёта */}
      <div data-tip="timer" className="compose-bar sticky z-30 lg:bottom-0">
        <CommentBar
          taskId={task.id}
          running={isRunning}
          onStart={() => startTimer.mutate(task.id, { onError })}
          onStop={() => stopTimer.mutate(undefined, { onError })}
          onAttach={toFiles}
        />
      </div>

      <Sheet open={stageOpen} onClose={() => setStageOpen(false)} title="Этап">
        <ListGroup>
          {[{ id: null as string | null, label: 'Без этапа' }, ...sortedStatuses.map((s) => ({ id: s.id as string | null, label: s.label }))].map((s) => {
            const st = s.id ? sortedStatuses.find((x) => x.id === s.id) : undefined
            return (
              <button
                key={s.id ?? 'none'}
                type="button"
                onClick={() => {
                  setStageOpen(false)
                  if (s.id !== task.status_id) saveField({ status_id: s.id })
                }}
                className="flex min-h-12 items-center gap-3 px-3.5 text-left text-base text-text"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: st ? `var(--status-${stageTone(st, statuses)})` : 'var(--border-strong)' }}
                  aria-hidden
                />
                <span className="flex-1">{s.label}</span>
                {task.status_id === s.id && <Check size={16} className="text-accent" />}
              </button>
            )
          })}
        </ListGroup>
        <Link to="/statuses" className="min-h-11 self-start py-2 text-sm font-medium text-accent-text">
          Настроить этапы
        </Link>
      </Sheet>

      <Sheet open={factOpen} onClose={() => setFactOpen(false)} title="Факт">
        <div className="flex items-center gap-4">
          <Ring size={72} pct={done ? 100 : pct} state={ringState} centerBg="var(--surface)">
            <span className="tabular font-mono text-sm font-medium text-text">{task.planned_hours > 0 ? `${Math.round(pct)}%` : '—'}</span>
          </Ring>
          <span className="flex flex-col">
            <span className="tabular font-mono text-xl font-medium text-text">{formatHoursMinutes(fact)}</span>
            <span className="text-sm text-text-secondary">
              {task.planned_hours > 0 ? `из ${formatHoursMinutes(task.planned_hours)} по плану` : 'план не задан'}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <Button
            onClick={() => {
              setFactOpen(false)
              setSubtracting(15)
            }}
            disabled={adjustFactHours.isPending || (task.fact_hours <= 0 && !isRunning)}
          >
            −15м
          </Button>
          <Button onClick={() => quickAdd(15)} disabled={adjustFactHours.isPending}>
            +15м
          </Button>
          <Button onClick={() => quickAdd(30)} disabled={adjustFactHours.isPending}>
            +30м
          </Button>
          <Button onClick={() => quickAdd(60)} disabled={adjustFactHours.isPending}>
            +1ч
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => {
              setFactOpen(false)
              setAdding(true)
            }}
          >
            <Plus size={15} /> С комментарием
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              setFactOpen(false)
              setEditingFact(true)
            }}
          >
            Ввести точно
          </Button>
        </div>
        {/* за какой день засчитать правку: исправление старых часов не бьёт по сегодняшнему дню */}
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="shrink-0">Правки — к дню</span>
          <DatePicker
            small
            className="w-[132px]"
            ariaLabel="День, к которому относится правка"
            value={adjustDate}
            onChange={(v) => setAdjustDate(v ?? todayStr())}
          />
          {adjustDate !== todayStr() && (
            <button type="button" onClick={() => setAdjustDate(todayStr())} className="min-h-11 shrink-0 px-1 font-medium text-accent-text">
              Сегодня
            </button>
          )}
        </div>
      </Sheet>

      {isRunning && activeTimer && (
        <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} timer={activeTimer} taskId={task.id} taskName={task.name} />
      )}

      <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="Задача">
        <div className="flex flex-col gap-2 pb-1">
          <Button
            size="lg"
            className="justify-start"
            onClick={() => {
              setMenuOpen(false)
              setDuplicating(true)
            }}
          >
            Дублировать
          </Button>
          {!isSubtask && (
            <Button
              size="lg"
              className="justify-start"
              onClick={() => {
                setMenuOpen(false)
                setNextSprint(true)
              }}
            >
              Новый период
            </Button>
          )}
          <Button
            size="lg"
            variant="ghost"
            className="justify-start text-danger-text"
            onClick={() => {
              setMenuOpen(false)
              setConfirmingDelete(true)
            }}
          >
            Удалить задачу
          </Button>
        </div>
      </Sheet>

      <DuplicateTaskSheet
        open={duplicating}
        task={task}
        note={
          subtasks.length > 0
            ? 'Подзадачи не копируются — чтобы перенести незакрытые, есть «Новый период».'
            : undefined
        }
        onCancel={() => setDuplicating(false)}
        onSubmit={(overrides) => {
          setDuplicating(false)
          duplicateTask.mutate(
            { task, overrides },
            { onError, onSuccess: (row) => navigate(`/tasks/${row.id}`) },
          )
        }}
      />

      {!isSubtask && (
        <NextSprintSheet
          open={nextSprint}
          task={task}
          subtasks={subtasks}
          statuses={statuses}
          onCancel={() => setNextSprint(false)}
          onSubmit={(values) => {
            setNextSprint(false)
            createNextSprint.mutate(
              { from: task, ...values },
              {
                onError,
                onSuccess: (row) => {
                  showSuccess(
                    values.carry.length > 0
                      ? `Новый период создан, перенесено подзадач: ${values.carry.length}`
                      : 'Новый период создан',
                  )
                  navigate(`/tasks/${row.id}`)
                },
              },
            )
          }}
        />
      )}

      <DurationSheet
        open={editingFact}
        title="Фактически затрачено"
        hours={task.fact_hours}
        onCancel={() => setEditingFact(false)}
        onSubmit={(value) => {
          setEditingFact(false)
          const less = Math.round((task.fact_hours - value) * 60)
          if (less > 0) setSubtracting(less)
          else setFact(value)
        }}
      />

      <AddTimeSheet
        open={adding}
        adjustDateLabel={new Date(`${adjustDate}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
        onCancel={() => setAdding(false)}
        onConfirm={(minutes, note) => {
          setAdding(false)
          setFact(task.fact_hours + minutes / 60, note)
        }}
      />

      <SubtractSheet
        open={subtracting !== null}
        minutes={subtracting ?? 15}
        factHours={task.fact_hours}
        entries={entries}
        activeTimer={isRunning ? activeTimer : null}
        adjustDateLabel={new Date(`${adjustDate}T00:00:00`)
          .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}
        onCancel={() => setSubtracting(null)}
        onConfirm={subtract}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title="Удалить задачу?"
        description={deleteDescription(subtasks.length)}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false)
          deleteTask.mutate(task.id, { onSuccess: () => navigate(backTo), onError })
        }}
      />
    </div>
  )
}
