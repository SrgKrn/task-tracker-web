import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlayGlyph, Ring, StopGlyph, type RingState } from './Ring'
import { Check, Plus } from './Icon'
import { tap } from '../lib/haptics'
import { describeError, useToast } from '../lib/Toast'
import { useStatuses } from '../lib/queries/statuses'
import { useCreateTask, useUpdateTask } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { elapsedHours, formatClock, formatHoursRu, useTicker } from '../lib/time'
import { isOverdue } from '../lib/tree'
import type { ActiveTimer, Status, Task } from '../lib/types'

interface SubtaskListProps {
  parent: Task
  subtasks: Task[]
  /** «скрыть готовые» из списка задач действует и внутри раскрытого спринта */
  hideDone?: boolean
  /** в списке задач состав висит под строкой спринта с отступом; в карточке — во всю ширину */
  nested?: boolean
  id?: string
  /** открыть сразу с полем ввода — когда пустой спринт раскрыли, чтобы добавить первую */
  startAdding?: boolean
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
  startAdding = false,
}: SubtaskListProps) {
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const updateTask = useUpdateTask()
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
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
      className={`flex flex-col gap-1.5 ${nested ? 'ml-4 pt-1.5 pl-3' : ''}`}
      style={nested ? { borderLeft: '1px solid var(--s-hairline)' } : undefined}
    >
      {visible.map((task) => {
        const status = task.status_id ? statusById.get(task.status_id) : undefined
        return (
          <SubtaskRow
            key={task.id}
            task={task}
            status={status}
            activeTimer={activeTimer}
            canClose={!!finalStatus}
            onStart={() => startTimer.mutate(task.id, { onError })}
            onStop={() => stopTimer.mutate(undefined, { onError })}
            onToggleDone={() => toggleDone(task, !!status?.is_final)}
          />
        )
      })}

      {hiddenCount > 0 && (
        <span className="px-1 font-mono text-2xs text-slate-600">скрыто готовых: {hiddenCount}</span>
      )}

      <AddSubtask parent={parent} startOpen={startAdding} />
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
  const bg = isRunning ? 'var(--s-surface-active)' : 'var(--s-surface-2)'

  const hours = hasPlan
    ? `${formatHoursRu(fact)} / ${formatHoursRu(task.planned_hours)} ч`
    : `${formatHoursRu(fact)} ч`
  const due = task.end_date ? ` · до ${task.end_date.slice(8, 10)}.${task.end_date.slice(5, 7)}` : ''

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl py-2 pr-2.5 pl-2"
      style={{
        background: bg,
        border: `1px solid ${isRunning ? 'rgba(232,163,61,.45)' : 'var(--s-hairline)'}`,
      }}
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
          <Check size={11} className="text-emerald-400" />
        ) : (
          <PlayGlyph size={6} />
        )}
      </Ring>

      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
        <span
          title={task.name}
          className={`block text-sm leading-[1.3] ${done ? 'text-slate-500 line-through' : 'text-slate-100'}`}
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {task.name}
        </span>
        <span
          className={`block truncate font-mono text-2xs leading-[1.4] ${
            overdue ? 'text-red-400' : done ? 'text-slate-600' : 'text-slate-500'
          }`}
        >
          {hours}
          {due}
        </span>
      </Link>

      {isRunning && activeTimer ? (
        <span className="tabular shrink-0 font-mono text-xs font-semibold text-sky-600">
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
          className="hit-44 flex shrink-0 items-center gap-1 rounded-md px-2 py-[3px] text-2xs font-medium"
          style={
            done
              ? { background: 'rgba(127,184,148,.14)', color: 'var(--s-success)' }
              : { border: '1px solid var(--s-border)', color: 'var(--color-slate-400)' }
          }
        >
          {done && <Check size={11} />}
          {done ? 'готово' : 'закрыть'}
        </button>
      ) : null}
    </div>
  )
}

/** Название — и всё: проект, раздел и спринт подзадача берёт у головной. */
function AddSubtask({ parent, startOpen }: { parent: Task; startOpen: boolean }) {
  const createTask = useCreateTask()
  const { showError } = useToast()
  const [editing, setEditing] = useState(startOpen)
  const [name, setName] = useState('')

  function submit() {
    const value = name.trim()
    if (!value || createTask.isPending) return
    createTask.mutate(
      {
        name: value,
        parent_id: parent.id,
        project_id: parent.project_id,
        section_id: parent.section_id,
        status_id: null,
        planned_hours: 0,
        start_date: null,
        end_date: null,
      },
      {
        onError: (error) => showError(describeError(error)),
        // поле остаётся открытым: состав спринта обычно набирают сразу несколькими строками
        onSuccess: () => setName(''),
      },
    )
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-left text-xs text-slate-500"
        style={{ border: '1px dashed var(--s-border-strong-2)' }}
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
      className="flex items-center gap-1.5 rounded-xl py-1 pr-1 pl-3"
      style={{ background: 'var(--s-surface)', border: '1px solid var(--s-accent)' }}
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (!name.trim()) setEditing(false)
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
            setEditing(false)
          }
        }}
        placeholder="Название подзадачи"
        aria-label={`Новая подзадача в «${parent.name}»`}
        className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-[#83838c]"
        // фокус уже показывает латунная рамка всей строки — вторая рамка вокруг поля лишняя
        style={{ outline: 'none' }}
      />
      <button
        type="submit"
        disabled={!name.trim() || createTask.isPending}
        className="h-8 shrink-0 rounded-lg px-3 text-xs font-semibold disabled:opacity-40"
        style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
      >
        Добавить
      </button>
    </form>
  )
}
