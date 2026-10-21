import { useMemo, useRef, useState } from 'react'
import { addInputId, setOpen, startAdding, stopAdding, useAddingFor } from '../lib/expanded'
import { Link } from 'react-router-dom'
import { PlayGlyph, Ring, StopGlyph, type RingState } from './Ring'
import { Check, Plus } from './Icon'
import { tap } from '../lib/haptics'
import { describeError, useToast } from '../lib/Toast'
import { useStatuses } from '../lib/queries/statuses'
import { useCreateTask, useReorderTasks, useUpdateTask } from '../lib/queries/tasks'
import { reorderPatch } from '../lib/dragSort'
import { useTaskSort } from '../lib/taskSort'
import { useDragSort } from './useDragSort'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { elapsedHours, formatClock, formatHoursRu, useTicker } from '../lib/time'
import { isOverdue } from '../lib/tree'
import { formatDueDate } from '../lib/period'
import type { ActiveTimer, Status, Task } from '../lib/types'

interface SubtaskListProps {
  parent: Task
  subtasks: Task[]
  /** «скрыть готовые» из списка задач действует и внутри раскрытого спринта */
  hideDone?: boolean
  /** в списке задач состав висит под строкой спринта с отступом; в карточке — во всю ширину */
  nested?: boolean
  id?: string
}

/**
 * Состав спринта: запуск учёта, закрытие и добавление подзадач прямо на месте —
 * без захода в карточку каждой. Правка часов, сроков и комментарии остаются в карточке.
 */
export function SubtaskList({
  parent,
  subtasks,
  hideDone = false,
  nested = false,
  id,
}: SubtaskListProps) {
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const updateTask = useUpdateTask()
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  // свой порядок — подзадачи переставляются долгим нажатием, как задачи в списке
  const manual = useTaskSort() === 'manual'
  const reorder = useReorderTasks()
  const boxRef = useRef<HTMLDivElement>(null)
  // «закрыть» ставит первый финальный статус. Если финальных нет вовсе,
  // закрывать нечем — кнопку не показываем, а не придумываем статус за пользователя
  const finalStatus = useMemo(
    () => [...statuses].sort((a, b) => a.sort_order - b.sort_order).find((s) => s.is_final),
    [statuses],
  )

  const visible = hideDone
    ? subtasks.filter((t) => !(t.status_id && statusById.get(t.status_id)?.is_final))
    : subtasks
  const hiddenCount = subtasks.length - visible.length
  useDragSort(boxRef, {
    enabled: manual && visible.length > 1,
    onDrop: (from, to) => {
      const patch = reorderPatch(visible, from, to)
      if (patch.length) reorder.mutate(patch, { onError })
    },
  })

  function toggleDone(task: Task, isDone: boolean) {
    if (!finalStatus) return
    const previous = task.status_id
    const next = isDone ? null : finalStatus.id
    updateTask.mutate(
      { id: task.id, fields: { status_id: next } },
      {
        onError,
        onSuccess: () => {
          if (!next) return
          // закрытая подзадача больше не копит часы — как и перевод в финальный статус в карточке
          if (activeTimer?.task_id === task.id) stopTimer.mutate(undefined, { onError })
          showSuccess('Подзадача закрыта', {
            label: 'Вернуть',
            onAction: () => updateTask.mutate({ id: task.id, fields: { status_id: previous } }, { onError }),
          })
        },
      },
    )
  }

  return (
    <div
      id={id}
      ref={boxRef}
      className={`flex flex-col gap-1.5 ${manual ? 'sortable' : ''} ${nested ? 'ml-4 border-l border-divider pt-0.5 pb-3 pl-3' : ''}`}
    >
      {visible.map((task) => {
        const status = task.status_id ? statusById.get(task.status_id) : undefined
        return (
          <div key={task.id} data-sort-row>
          <SubtaskRow
            task={task}
            status={status}
            activeTimer={activeTimer}
            canClose={!!finalStatus}
            onStart={() => startTimer.mutate(task.id, { onError })}
            onStop={() => stopTimer.mutate(undefined, { onError })}
            onToggleDone={() => toggleDone(task, !!status?.is_final)}
          />
          </div>
        )
      })}

      {hiddenCount > 0 && (
        <span className="px-1 text-sm text-text-secondary">Скрыто готовых: {hiddenCount}</span>
      )}

      <AddSubtask parent={parent} />
    </div>
  )
}

function SubtaskRow({
  task,
  status,
  activeTimer,
  canClose,
  onStart,
  onStop,
  onToggleDone,
}: {
  task: Task
  status: Status | undefined
  activeTimer: ActiveTimer | null | undefined
  canClose: boolean
  onStart: () => void
  onStop: () => void
  onToggleDone: () => void
}) {
  const isRunning = activeTimer?.task_id === task.id
  useTicker(isRunning)

  const done = !!status?.is_final
  const fact = isRunning && activeTimer ? task.fact_hours + elapsedHours(activeTimer.started_at) : task.fact_hours
  const hasPlan = task.planned_hours > 0
  const pct = hasPlan ? (fact / task.planned_hours) * 100 : 0
  const overdue = isOverdue(task, status)
  const ringState: RingState = done ? 'done' : pct > 100 ? 'over' : isRunning ? 'running' : 'idle'
  const bg = isRunning ? 'var(--timer-bg)' : 'var(--surface-sunken)'

  const hours = hasPlan
    ? `${formatHoursRu(fact)} / ${formatHoursRu(task.planned_hours)} ч`
    : `${formatHoursRu(fact)} ч`
  const due = task.end_date ? formatDueDate(task.end_date) : ''

  return (
    <div
      className="flex min-h-12 items-center gap-2.5 rounded-sm py-2 pr-2.5 pl-2"
      style={{ background: bg, boxShadow: isRunning ? 'inset 2px 0 0 var(--accent)' : undefined }}
    >
      <Ring
        size={26}
        pct={done ? 100 : pct}
        state={ringState}
        centerBg={bg}
        onClick={() => {
          tap()
          if (isRunning) onStop()
          else onStart()
        }}
        ariaLabel={`${isRunning ? 'Остановить учёт' : 'Начать учёт'}: ${task.name}`}
      >
        {isRunning ? (
          <StopGlyph size={7} />
        ) : done ? (
          <Check size={11} className="text-success" />
        ) : (
          <PlayGlyph size={6} />
        )}
      </Ring>

      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
        <span
          title={task.name}
          className={`block text-base leading-[1.3] ${done ? 'text-text-secondary line-through' : 'text-text'}`}
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {task.name}
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-sm leading-[1.4] whitespace-nowrap text-text-secondary">
          <span className="tabular shrink-0 font-mono text-xs">{hours}</span>
          {due && (
            <span className={`truncate ${overdue ? 'font-medium text-danger-text' : ''}`}>
              · {overdue ? `просрочено, ${due.toLowerCase()}` : `до ${due.toLowerCase()}`}
            </span>
          )}
        </span>
      </Link>

      {isRunning && activeTimer ? (
        <span className="tabular shrink-0 font-mono text-sm font-medium text-accent-text">
          {formatClock(activeTimer.started_at)}
        </span>
      ) : canClose ? (
        <button
          type="button"
          onClick={() => {
            tap()
            onToggleDone()
          }}
          aria-pressed={done}
          aria-label={done ? `Вернуть в работу: ${task.name}` : `Закрыть: ${task.name}`}
          className={`hit-44 flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium ${
            done ? 'bg-success-soft text-success-text' : 'border border-border bg-surface text-text-secondary'
          }`}
        >
          {done && <Check size={11} />}
          {done ? 'Готово' : 'Закрыть'}
        </button>
      ) : null}
    </div>
  )
}

/** Название — и всё: значения групп подзадача берёт у спринта. */
function AddSubtask({ parent }: { parent: Task }) {
  const createTask = useCreateTask()
  const { showError } = useToast()
  const editing = useAddingFor() === parent.id
  const [name, setName] = useState('')

  function submit() {
    const value = name.trim()
    if (!value || createTask.isPending) return
    createTask.mutate(
      {
        name: value,
        parent_id: parent.id,
        status_id: null,
        planned_hours: 0,
        start_date: null,
        end_date: null,
      },
      {
        onError: (error) => showError(describeError(error)),
        // поле остаётся открытым: состав спринта обычно набирают сразу несколькими строками.
        // Спринт с первой подзадачей запоминаем раскрытым — в нём теперь есть что показывать
        onSuccess: () => {
          setName('')
          setOpen(parent.id, true)
        },
      },
    )
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => startAdding(parent.id)}
        className="flex min-h-11 items-center gap-2 rounded-sm border border-dashed border-border-strong px-3 text-left text-sm text-text-secondary"
      >
        <Plus size={14} />
        Подзадача
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className="flex items-center gap-1.5 rounded-sm border border-accent bg-surface py-1 pr-1 pl-3"
    >
      <input
        id={addInputId(parent.id)}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={(e) => {
          if (!e.currentTarget.value.trim()) stopAdding(parent.id)
        }}
        onKeyDown={(e) => {
          // Enter обрабатываем сами, как во всех полях приложения: неявная отправка формы
          // срабатывала не везде, и следующее название дописывалось к предыдущему
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
          if (e.key === 'Escape') {
            setName('')
            stopAdding(parent.id)
          }
        }}
        placeholder="Название подзадачи"
        aria-label={`Новая подзадача в «${parent.name}»`}
        className="min-w-0 flex-1 bg-transparent text-[length:var(--input-size)] text-text placeholder:text-text-tertiary"
        // фокус уже показывает рамка всей строки — второе кольцо вокруг поля лишнее
        style={{ outline: 'none', boxShadow: 'none' }}
      />
      <button
        type="submit"
        disabled={!name.trim() || createTask.isPending}
        className="h-9 shrink-0 rounded-sm bg-accent px-3 text-sm font-medium text-on-accent disabled:opacity-50"
      >
        Добавить
      </button>
    </form>
  )
}
