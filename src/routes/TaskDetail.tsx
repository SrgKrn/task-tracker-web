import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DatePicker } from '../components/DatePicker'
import { DurationSheet } from '../components/DurationSheet'
import { DuplicateTaskSheet } from '../components/DuplicateTaskSheet'
import { ArrowLeft } from '../components/Icon'
import { Ring, type RingState } from '../components/Ring'
import { TaskForm, type TaskFormValues } from '../components/TaskForm'
import { CommentBar, TaskTimeline } from '../components/TaskTimeline'
import { TimerButton } from '../components/TimerButton'
import { FieldLabel, Tag } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { todayStr } from '../lib/period'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useDeleteTask, useDuplicateTask, useTask, useUpdateTask } from '../lib/queries/tasks'
import { useActiveTimer, useAdjustFactHours, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { elapsedHours, formatClock, formatHoursMinutes, formatHoursRu, useTicker } from '../lib/time'

export function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  const { data: task, isFetched } = useTask(id)
  const { data: original } = useTask(task?.duplicated_from ?? undefined)
  const { data: projects = [] } = useProjects()
  const { data: sections = [] } = useSections()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()

  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const duplicateTask = useDuplicateTask()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const adjustFactHours = useAdjustFactHours()

  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [editingFact, setEditingFact] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftName, setDraftName] = useState('')
  // день, к которому относится ручная правка. По умолчанию сегодня — быстрый случай
  // остаётся в один тап; но исправление старых часов больше не бьёт по сегодняшнему дню
  const [adjustDate, setAdjustDate] = useState(todayStr)
  const isRunning = activeTimer?.task_id === id
  useTicker(isRunning)

  // задачу удалили (или ссылка устарела) — возвращаемся к списку, а не показываем пустую карточку
  if (isFetched && !task) return <Navigate to="/tasks" replace />
  if (!task) return null

  const status = task.status_id ? statuses.find((s) => s.id === task.status_id) : undefined
  const project = projects.find((p) => p.id === task.project_id)
  const section = sections.find((s) => s.id === task.section_id)

  const done = !!status?.is_final
  const fact = isRunning && activeTimer ? task.fact_hours + elapsedHours(activeTimer.started_at) : task.fact_hours
  const pct = task.planned_hours > 0 ? (fact / task.planned_hours) * 100 : 0
  const over = pct > 100 && !done
  const ringState: RingState = done ? 'done' : over ? 'over' : isRunning ? 'running' : 'idle'

  const values: TaskFormValues = {
    name: task.name,
    project_id: task.project_id,
    section_id: task.section_id,
    status_id: task.status_id,
    planned_hours: task.planned_hours,
    start_date: task.start_date,
    end_date: task.end_date,
    is_daily: task.is_daily,
  }

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

  return (
    <div className="mx-auto flex max-w-lg flex-col lg:mx-0 lg:h-screen lg:max-w-none lg:w-full">
      <div className="safe-top flex items-center justify-between px-5 pt-3.5">
        {/* -my-2.5 гасит вертикальный паддинг в вёрстке: он нужен только пальцу */}
        <button
          type="button"
          onClick={() => navigate('/tasks')}
          className="-my-2.5 flex items-center gap-2 py-2.5 text-sm text-slate-400"
        >
          <ArrowLeft size={15} />Назад
        </button>
        <div className="-my-2.5 flex gap-3.5 text-sm">
          <button type="button" onClick={() => setDuplicating(true)} className="py-2.5 text-slate-400">
            Дублировать
          </button>
          <button type="button" onClick={() => setConfirmingDelete(true)} className="py-2.5 text-red-400">
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
            {[project?.name, section?.name].filter(Boolean).join(' · ')}
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
            Копия задачи «<span className="text-sky-600">{original.name}</span>»
          </Link>
        )}

        <div className="flex items-center gap-[18px] pt-0.5">
          <Ring size={112} pct={done ? 100 : pct} state={ringState} centerBg="var(--s-bg)" marker={isRunning}>
            <span className="flex flex-col items-center gap-px">
              <span
                className={`tabular font-mono font-semibold ${
                  isRunning ? 'text-xl text-sky-600' : 'text-2xl text-slate-50'
                }`}
              >
                {isRunning && activeTimer ? formatClock(activeTimer.started_at) : `${formatHoursRu(fact)} ч`}
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
                <span className="text-sm text-[#83838c]">/ {formatHoursRu(task.planned_hours)} ч</span>
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

      {/* на десктопе форма упирается в предел ширины: поле на шесть символов,
          растянутое на пол-экрана, выглядит как ошибка вёрстки */}
      <div className="sc flex flex-col gap-3 px-5 pt-4 pb-2 lg:min-h-0 lg:w-full lg:max-w-[560px] lg:flex-1 lg:overflow-y-auto">
        {/*
          Правка факта сохраняется мгновенно, а поля ниже — только по кнопке.
          Раньше это был один сплошной список, и понять, где какое правило, было
          невозможно. Обводим мгновенную часть в карточку и подписываем.
        */}
        <div
          className="flex flex-col gap-2.5 rounded-2xl p-3"
          style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-border)' }}
        >
          <span className="flex items-baseline justify-between gap-2">
            <FieldLabel>Факт (правка)</FieldLabel>
            <span className="font-mono text-2xs text-slate-600">сохраняется сразу</span>
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
              {[
                { delta: -0.25, glyph: '−', label: 'Убавить 15 минут' },
                { delta: 0.25, glyph: '+', label: 'Прибавить 15 минут' },
              ].map(({ delta, glyph, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setFact(Math.round((task.fact_hours + delta) * 4) / 4)}
                  disabled={adjustFactHours.isPending}
                  aria-label={label}
                  className="flex h-10 w-10 items-center justify-center rounded-[10px] text-lg text-slate-300 disabled:opacity-40"
                  style={{ border: '1px solid var(--s-border-strong-2)' }}
                >
                  {glyph}
                </button>
              ))}
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
                className="shrink-0 text-2xs text-sky-600"
              >
                Сегодня
              </button>
            )}
          </div>
        </div>

        <TaskForm
          initial={values}
          projects={projects}
          sections={sections}
          statuses={statuses}
          submitLabel="Сохранить"
          compact
          onSubmit={(fields) => {
            const goingFinal = !!fields.status_id && statuses.find((s) => s.id === fields.status_id)?.is_final
            updateTask.mutate(
              { id: task.id, fields },
              {
                onError,
                onSuccess: () => {
                  // финальный статус останавливает учёт
                  if (goingFinal && isRunning) stopTimer.mutate(undefined, { onError })
                  showSuccess('Сохранено')
                  navigate('/tasks')
                },
              },
            )
          }}
        />

        <TaskTimeline taskId={task.id} isRunning={isRunning} />
      </div>

      <CommentBar taskId={task.id} />

      <DuplicateTaskSheet
        open={duplicating}
        task={task}
        onCancel={() => setDuplicating(false)}
        onSubmit={(overrides) => {
          setDuplicating(false)
          duplicateTask.mutate(
            { task, overrides },
            { onError, onSuccess: (row) => navigate(`/tasks/${row.id}`) },
          )
        }}
      />

      <DurationSheet
        open={editingFact}
        title="Фактически затрачено"
        hours={task.fact_hours}
        onCancel={() => setEditingFact(false)}
        onSubmit={(value) => {
          setEditingFact(false)
          setFact(value)
        }}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title="Удалить задачу?"
        description="Вместе с ней удалится вся история трекинга по ней."
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false)
          deleteTask.mutate(task.id, { onSuccess: () => navigate('/tasks'), onError })
        }}
      />
    </div>
  )
}
