import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ArrowLeft } from '../components/Icon'
import { Ring, type RingState } from '../components/Ring'
import { TaskForm, type TaskFormValues } from '../components/TaskForm'
import { CommentBar, TaskTimeline } from '../components/TaskTimeline'
import { TimerButton } from '../components/TimerButton'
import { FieldLabel, Tag } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useDeleteTask, useDuplicateTask, useTask, useUpdateTask } from '../lib/queries/tasks'
import { useActiveTimer, useAdjustFactHours, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { elapsedHours, formatClock, formatHoursRu, useTicker } from '../lib/time'

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

  function adjustFact(delta: number) {
    if (!task) return
    const from = task.fact_hours
    const next = Math.max(0, Math.round((from + delta) * 2) / 2)
    if (next === from) return
    adjustFactHours.mutate(
      { taskId: task.id, currentFactHours: from, newFactHours: next },
      {
        onError,
        onSuccess: () =>
          // правка факта пишется отдельной записью в историю — откат тоже должен быть виден
          showSuccess(`Факт: ${formatHoursRu(next)} ч`, {
            label: 'Отменить',
            onAction: () =>
              adjustFactHours.mutate(
                { taskId: task.id, currentFactHours: next, newFactHours: from },
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
          <button
            type="button"
            onClick={() =>
              duplicateTask.mutate(task, { onError, onSuccess: (row) => navigate(`/tasks/${row.id}`) })
            }
            className="py-2.5 text-slate-400"
          >
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
        <h1
          title={task.name}
          className="text-2xl font-semibold leading-[1.2] tracking-[-.02em] text-slate-100"
          style={{ textWrap: 'pretty' }}
        >
          {task.name}
        </h1>

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
        {/* быстрая правка факта — шаг 0,5 ч */}
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Факт (правка)</FieldLabel>
          <div
            className="flex h-[52px] items-center justify-between rounded-xl py-1.5 pr-1.5 pl-3"
            style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
          >
            <span className="tabular font-mono text-sm font-medium text-slate-100">
              {formatHoursRu(task.fact_hours)} ч
            </span>
            {/* пока правка летит на сервер, кнопки заблокированы: серия быстрых тапов
                иначе накрутила бы несколько правок от одного и того же исходного значения */}
            <span className="flex gap-1.5">
              {[
                { delta: -0.5, glyph: '−', label: 'Убавить полчаса' },
                { delta: 0.5, glyph: '+', label: 'Прибавить полчаса' },
              ].map(({ delta, glyph, label }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => adjustFact(delta)}
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
