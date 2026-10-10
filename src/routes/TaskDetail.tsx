import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AttachmentsBlock } from '../components/AttachmentsBlock'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DatePicker } from '../components/DatePicker'
import { DurationSheet } from '../components/DurationSheet'
import { DuplicateTaskSheet } from '../components/DuplicateTaskSheet'
import { SubtractSheet, type SubtractSource } from '../components/SubtractSheet'
import { NextSprintSheet } from '../components/NextSprintSheet'
import { SprintComposition } from '../components/SprintComposition'
import { ArrowLeft } from '../components/Icon'
import { Ring, type RingState } from '../components/Ring'
import { TaskForm, type TaskFormValues } from '../components/TaskForm'
import { CommentBar, TaskTimeline } from '../components/TaskTimeline'
import { TimerButton } from '../components/TimerButton'
import { FieldLabel, Segmented, Tag } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { formatShortDate, todayStr } from '../lib/period'
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
  useTrimSession,
} from '../lib/queries/timer'
import { elapsedHours, entrySeconds, formatClock, formatHoursMinutes, formatHoursRu, useTicker } from '../lib/time'
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
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()

  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const duplicateTask = useDuplicateTask()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const adjustFactHours = useAdjustFactHours()
  const trimSession = useTrimSession()
  const shiftActiveTimer = useShiftActiveTimer()
  const { data: entries = [] } = useTimeEntries(id)
  const createNextSprint = useCreateNextSprint()

  const childrenOf = useMemo(() => childrenByParent(allTasks), [allTasks])
  const subtasks = (id && childrenOf.get(id)) || []
  const parent = task?.parent_id ? allTasks.find((t) => t.id === task.parent_id) : undefined

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [nextSprint, setNextSprint] = useState(false)
  const [editingFact, setEditingFact] = useState(false)
  // сколько минут отнять — окно выбора «отдельной правкой или из сессии»
  const [subtracting, setSubtracting] = useState<number | null>(null)
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
  const [tab, setTab] = useState<'time' | 'composition' | 'files' | 'history'>('time')
  const isRunning = activeTimer?.task_id === id
  // учёт идёт по подзадаче: кольцо спринта растёт вместе с ней, хотя кнопка здесь «Начать»
  const runningInside = !!task && !isRunning && runningWithin(task, subtasks, activeTimer?.task_id)
  useTicker(isRunning || runningInside)

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
    if (patch.start_date !== undefined) return `Срок с: ${patch.start_date ? formatShortDate(patch.start_date) : 'не задан'}`
    if (patch.end_date !== undefined) return `Срок до: ${patch.end_date ? formatShortDate(patch.end_date) : 'не задан'}`
    if (patch.status_id !== undefined) {
      return `Статус: ${statuses.find((s) => s.id === patch.status_id)?.label ?? 'без статуса'}`
    }
    if (patch.is_daily !== undefined) return patch.is_daily ? 'Теперь ежедневная' : 'Больше не ежедневная'
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

  /** записывает новое значение факта; шаг кнопок ±15 мин, окно задаёт точное число */
  function setFact(next: number) {
    if (!task) return
    const from = task.fact_hours
    const target = Math.max(0, next)
    if (Math.abs(target - from) < 1 / 120) return // меньше полуминуты — не пишем запись
    adjustFactHours.mutate(
      { taskId: task.id, currentFactHours: from, newFactHours: target, effectiveDate: adjustDate },
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
  function subtract(minutes: number, source: SubtractSource) {
    setSubtracting(null)
    if (!task) return
    const label = formatHoursMinutes(minutes / 60)
    if (source.kind === 'separate') {
      setFact(task.fact_hours - minutes / 60)
      return
    }
    if (source.kind === 'session') {
      const entry = source.entry
      trimSession.mutate(
        { entry, minutes },
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
            showSuccess(`Сессия короче на ${label}`, {
              label: 'Вернуть',
              onAction: () => trimSession.mutate({ entry: trimmed, minutes: -minutes }, { onError }),
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

  return (
    <div className="mx-auto flex max-w-lg flex-col lg:mx-0 lg:h-screen lg:max-w-none lg:w-full">
      <div className="safe-top flex items-center justify-between px-5 pt-3.5">
        {/* -my-2.5 гасит вертикальный паддинг в вёрстке: он нужен только пальцу */}
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="-my-2.5 flex min-w-0 items-center gap-2 py-2.5 text-sm text-slate-400"
        >
          <ArrowLeft size={15} />
          <span className="truncate">{parent ? parent.name : 'Назад'}</span>
        </button>
        <div className="-my-2.5 flex shrink-0 gap-3.5 pl-3 text-sm">
          <button type="button" onClick={() => setDuplicating(true)} className="py-2.5 text-slate-400">
            Дублировать
          </button>
          <button type="button" onClick={() => setConfirmingDelete(true)} className="py-2.5 text-terra-400">
            Удалить
          </button>
        </div>
      </div>

      {/* шапка задачи */}
      <div
        className="flex flex-col gap-3.5 px-5 pt-4 pb-4"
        style={{ borderBottom: '1px solid var(--s-hairline-2)' }}
      >
        <div className="flex items-center gap-2">
          {status && <Tag tone={status.is_final ? 'success' : 'accent'}>{status.label}</Tag>}
          <span className="truncate font-mono text-xs text-slate-500">
            {/* каждое значение — ссылка на свою карточку: там вся история и файлы по нему */}
            {values.map((v, i) => (
              <span key={v.item.id}>
                {i > 0 && ' · '}
                <Link
                  to={`/items/${v.item.id}`}
                  title={v.group.item_name}
                  className={`underline-offset-4 hover:underline ${v.group.show_in_list ? 'text-brass-600' : ''}`}
                >
                  {v.item.name}
                </Link>
              </span>
            ))}
          </span>
        </div>
        {/* название правится прямо в заголовке: форма ниже идёт в режиме compact,
            и поля имени в ней нет — переименовать задачу было нечем */}
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
            className="resize-none rounded-xl px-3 py-2 text-2xl font-semibold leading-[1.2] tracking-[-.02em] text-slate-100"
            style={{ background: 'var(--s-surface)', border: '1px solid var(--s-accent)' }}
          />
        ) : (
          <h1
            title="Нажмите, чтобы переименовать"
            onClick={() => {
              setDraftName(task.name)
              setRenaming(true)
            }}
            className="cursor-text text-2xl font-semibold leading-[1.2] tracking-[-.02em] text-slate-100"
            style={{ textWrap: 'pretty' }}
          >
            {task.name}
          </h1>
        )}

        {original && (
          <Link to={`/tasks/${original.id}`} className="-mt-1.5 truncate text-xs text-slate-500">
            На основе «<span className="text-brass-600">{original.name}</span>»
          </Link>
        )}

        <div className="flex items-center gap-[18px] pt-0.5">
          <Ring size={112} pct={done ? 100 : pct} state={ringState} centerBg="var(--s-bg)" marker={isRunning}>
            <span className="flex flex-col items-center gap-px">
              {/* число и «ч» — одним неразрывным куском: «14,4 ч» в кольце переносилось на две
                  строки; длинное число уменьшается, а не ломает кольцо */}
              <span
                className={`tabular whitespace-nowrap font-mono font-semibold ${
                  isRunning
                    ? 'text-xl text-brass-600'
                    : formatHoursRu(fact).length > 4
                      ? 'text-xl text-slate-50'
                      : 'text-2xl text-slate-50'
                }`}
              >
                {isRunning && activeTimer ? (
                  formatClock(activeTimer.started_at)
                ) : (
                  <>
                    {formatHoursRu(fact)}
                    <span className="ml-0.5 text-sm font-medium text-slate-400">ч</span>
                  </>
                )}
              </span>
              <span className="font-mono text-2xs uppercase tracking-[.14em] text-slate-500">
                {isRunning ? 'идёт учёт' : 'факт'}
              </span>
            </span>
          </Ring>

          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex flex-col gap-px">
              <FieldLabel>Факт / план</FieldLabel>
              <span className="tabular font-mono text-lg font-semibold leading-[1.1] text-slate-50">
                {formatHoursRu(fact)}{' '}
                <span className="text-sm text-[var(--s-placeholder)]">/ {formatHoursRu(task.planned_hours)} ч</span>
              </span>
            </div>
            <TimerButton
              taskId={task.id}
              activeTimer={activeTimer}
              onStart={() => startTimer.mutate(task.id, { onError })}
              onStop={() => stopTimer.mutate(undefined, { onError })}
            />
          </div>
        </div>
      </div>

      {/* вкладки: состава у подзадачи нет — база держит ровно два уровня */}
      <div className="px-5 pt-3.5">
        <Segmented
          stretch
          value={tab}
          onChange={setTab}
          options={[
            { value: 'time', label: 'Время' },
            ...(isSubtask ? [] : [{ value: 'composition' as const, label: subtasks.length ? `Состав · ${subtasks.length}` : 'Состав' }]),
            { value: 'files', label: 'Файлы' },
            { value: 'history', label: 'История' },
          ]}
        />
      </div>

      {/* на десктопе форма упирается в предел ширины: поле на шесть символов,
          растянутое на пол-экрана, выглядит как ошибка вёрстки */}
      <div className="sc flex flex-col gap-3 px-5 pt-4 pb-2 lg:min-h-0 lg:w-full lg:max-w-[560px] lg:flex-1 lg:overflow-y-auto">
        {tab === 'composition' && !isSubtask && (
          <SprintComposition
            task={task}
            subtasks={subtasks}
            statuses={statuses}
            onApplyStatus={(statusId) => saveField({ status_id: statusId })}
            onNextSprint={() => setNextSprint(true)}
          />
        )}

        {tab === 'files' && (
          <AttachmentsBlock
            taskId={task.id}
            // окно выбора Диска открывается в папке проекта задачи, если она привязана
            driveFolderId={values.find((v) => v.item.drive_folder_id)?.item.drive_folder_id ?? null}
            taskIds={[task.id, ...subtasks.map((c) => c.id)]}
            taskNames={subtasks.length ? new Map(subtasks.map((c) => [c.id, c.name])) : undefined}
            emptyText="Прикрепить файл: договор, ТЗ, скриншоты — откроются прямо отсюда"
          />
        )}

        {tab === 'time' && (
          <>
            {/* правка факта — отдельной карточкой: она пишет запись в историю, а не меняет поле */}
            <div
              className="flex flex-col gap-2.5 rounded-2xl p-3"
              style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-border)' }}
            >
              <span className="flex items-baseline justify-between gap-2">
                {/* правка пишется в сам спринт: часы подзадач правятся в их карточках */}
                <FieldLabel>{subtasks.length > 0 ? 'Часы в сам спринт' : 'Факт (правка)'}</FieldLabel>
              </span>
              <div
                className="flex h-[52px] items-center justify-between rounded-xl py-1.5 pr-1.5 pl-3"
                style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
              >
                {/* по цифре можно ударить и ввести точное значение: набирать «3 ч 40 мин»
                    шагами по 15 минут — дюжина нажатий */}
                <button
                  type="button"
                  onClick={() => setEditingFact(true)}
                  className="tabular -my-2 rounded-lg py-2 font-mono text-sm font-medium text-slate-100 underline decoration-dotted decoration-slate-600 underline-offset-4"
                >
                  {formatHoursMinutes(task.fact_hours)}
                </button>
                {/* пока правка летит на сервер, кнопки заблокированы: серия быстрых тапов
                    иначе накрутила бы несколько правок от одного и того же исходного значения */}
                <span className="flex gap-1.5">
                  {/* минус открывает выбор: отдельной правкой или из сессии таймера */}
                  <button
                    type="button"
                    onClick={() => setSubtracting(15)}
                    disabled={adjustFactHours.isPending || (task.fact_hours <= 0 && !isRunning)}
                    aria-label="Отнять время"
                    className="flex h-10 w-10 items-center justify-center rounded-[10px] text-lg text-slate-300 disabled:opacity-40"
                    style={{ border: '1px solid var(--s-border-strong-2)' }}
                  >
                    −
                  </button>
                  {/* ровно +15 минут к тому, что есть. Раньше итог округлялся до четверти часа:
                      с 2 ч 20 мин плюс давал 2 ч 30 мин, то есть добавлял 10 минут */}
                  <button
                    type="button"
                    onClick={() => setFact(task.fact_hours + 0.25)}
                    disabled={adjustFactHours.isPending}
                    aria-label="Прибавить 15 минут"
                    className="flex h-10 w-10 items-center justify-center rounded-[10px] text-lg text-slate-300 disabled:opacity-40"
                    style={{ border: '1px solid var(--s-border-strong-2)' }}
                  >
                    +
                  </button>
                </span>
              </div>

              {/* за какой день засчитать правку: без этого исправление старых часов
                  вычиталось из сегодняшнего дня и роняло кольцо «Сегодня» */}
              <div className="flex items-center gap-2 pb-0.5">
                <span className="shrink-0 text-2xs text-slate-500">Засчитать в день</span>
                <DatePicker
                  small
                  className="w-[128px]"
                  ariaLabel="День, к которому относится правка"
                  value={adjustDate}
                  onChange={(v) => setAdjustDate(v ?? todayStr())}
                />
                {adjustDate !== todayStr() && (
                  <button
                    type="button"
                    onClick={() => setAdjustDate(todayStr())}
                    className="shrink-0 text-2xs text-brass-600"
                  >
                    Сегодня
                  </button>
                )}
              </div>
            </div>

            <TaskForm
              initial={formValues}
              statuses={statuses}
              compact
              sprints={sprintOptions}
              onFieldChange={saveField}
            />
          </>
        )}

        {tab === 'history' && <TaskTimeline taskId={task.id} isRunning={isRunning} />}
      </div>

      {/* комментарий пишется в историю — поле ввода там, где её видно */}
      {tab === 'history' && <CommentBar taskId={task.id} />}

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
