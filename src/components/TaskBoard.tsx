import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClientDot } from './ui'
import { Play } from './Icon'
import { StopGlyph } from './Ring'
import type { GroupModel } from '../lib/groups'
import { formatDueDate, todayStr } from '../lib/period'
import { stageTone } from '../lib/stage'
import { elapsedHours, formatClock, formatHoursRu, useTicker } from '../lib/time'
import { isOverdue, rollupFact, runningWithin } from '../lib/tree'
import type { ActiveTimer, Status, Task } from '../lib/types'

/** перетаскиваемая задача: в dataTransfer кладём её id под своим типом */
export const TASK_DRAG_TYPE = 'application/x-semternity-task'

/**
 * Доска по этапам (0.64, компьютер): колонка на этап, карточку тянут в другую колонку —
 * меняется этап, в уведомлении «Вернуть». Пустые этапы тоже колонками: в них можно бросить.
 * Порядок карточек — тот же, что выбран для списка.
 */
export function TaskBoard({
  tasks,
  statuses,
  model,
  childrenOf,
  activeTimer,
  openId,
  onMoveStage,
  onStartTimer,
  onStopTimer,
}: {
  tasks: Task[]
  statuses: Status[]
  model: GroupModel
  childrenOf: Map<string, Task[]>
  activeTimer: ActiveTimer | null | undefined
  openId: string | undefined
  onMoveStage: (task: Task, statusId: string | null) => void
  onStartTimer: (task: Task) => void
  onStopTimer: () => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const ordered = [...statuses].sort((a, b) => a.sort_order - b.sort_order)
  const known = new Set(ordered.map((s) => s.id))
  const loose = tasks.filter((t) => !t.status_id || !known.has(t.status_id))
  const columns = [
    ...(loose.length > 0 ? [{ id: 'none', status: null as Status | null, title: 'Без этапа', items: loose }] : []),
    ...ordered.map((s) => ({ id: s.id, status: s as Status | null, title: s.label, items: tasks.filter((t) => t.status_id === s.id) })),
  ]
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const finalIds = new Set(ordered.filter((s) => s.is_final).map((s) => s.id))

  return (
    <div className="sc -mx-5 flex items-start gap-3 overflow-x-auto px-5 pb-4" role="list" aria-label="Доска по этапам">
      {columns.map((col) => {
        const plan = col.items.reduce((a, t) => a + t.planned_hours, 0)
        const fact = col.items.reduce((a, t) => a + rollupFact(t, childrenOf.get(t.id)), 0)
        const dragging = dragId ? byId.get(dragId) : undefined
        const canDrop = !!dragging && (dragging.status_id ?? 'none') !== col.id
        return (
          <section
            key={col.id}
            role="listitem"
            aria-label={col.title}
            className="board-col flex w-66 shrink-0 flex-col gap-2 rounded-lg bg-surface-sunken p-2"
            data-drop-over={canDrop && over === col.id ? '' : undefined}
            onDragOver={(e) => {
              if (!canDrop) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              if (over !== col.id) setOver(col.id)
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === col.id ? null : o))
            }}
            onDrop={(e) => {
              e.preventDefault()
              const task = byId.get(e.dataTransfer.getData(TASK_DRAG_TYPE))
              setOver(null)
              setDragId(null)
              if (task && (task.status_id ?? 'none') !== col.id) onMoveStage(task, col.status?.id ?? null)
            }}
          >
            <header className="flex items-center gap-2 px-1.5 pt-0.5">
              {col.status && (
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: `var(--status-${stageTone(col.status, statuses)})` }}
                  aria-hidden
                />
              )}
              <span className="min-w-0 truncate text-sm font-semibold text-text">{col.title}</span>
              <span className="tabular font-mono text-xs text-text-secondary">{col.items.length}</span>
              <span className="tabular ml-auto font-mono text-xs text-text-tertiary">
                {formatHoursRu(fact)} / {formatHoursRu(plan)}
              </span>
            </header>
            {col.items.map((task) => (
              <BoardCard
                key={task.id}
                task={task}
                label={model.listLabel(task)}
                color={model.colorOf(task)}
                done={!!col.status?.is_final}
                subtasks={childrenOf.get(task.id)}
                subDone={(childrenOf.get(task.id) ?? []).filter((c) => !!c.status_id && finalIds.has(c.status_id)).length}
                activeTimer={activeTimer}
                open={openId === task.id}
                dragging={dragId === task.id}
                onDragStart={() => setDragId(task.id)}
                onDragEnd={() => {
                  setDragId(null)
                  setOver(null)
                }}
                onStartTimer={() => onStartTimer(task)}
                onStopTimer={onStopTimer}
              />
            ))}
            {col.items.length === 0 && (
              <p className="rounded-md border border-dashed border-border px-3 py-5 text-center text-xs text-text-tertiary">
                Перетащите сюда задачу
              </p>
            )}
          </section>
        )
      })}
    </div>
  )
}

function BoardCard({
  task,
  label,
  color,
  done,
  subtasks,
  subDone,
  activeTimer,
  open,
  dragging,
  onDragStart,
  onDragEnd,
  onStartTimer,
  onStopTimer,
}: {
  task: Task
  label: string
  color: ReturnType<GroupModel['colorOf']>
  done: boolean
  subtasks: Task[] | undefined
  subDone: number
  activeTimer: ActiveTimer | null | undefined
  open: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onStartTimer: () => void
  onStopTimer: () => void
}) {
  const navigate = useNavigate()
  const running = runningWithin(task, subtasks, activeTimer?.task_id)
  useTicker(running)
  const today = todayStr()
  const fact = rollupFact(task, subtasks) + (running && activeTimer ? elapsedHours(activeTimer.started_at) : 0)
  const overdue = !done && isOverdue(task, undefined)

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TASK_DRAG_TYPE, task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        navigate(`/tasks/${task.id}`)
      }}
      data-open={open || undefined}
      data-running={running || undefined}
      data-dragging={dragging || undefined}
      className="board-card group flex cursor-pointer flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5"
    >
      {label && (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">
          <ClientDot color={color} size={7} />
          <span className="truncate">{label}</span>
        </span>
      )}
      <span className={`line-clamp-2 text-sm ${done ? 'text-text-secondary line-through' : 'font-medium text-text'}`}>{task.name}</span>
      <span className="flex items-center gap-2 text-xs">
        {task.end_date && (
          <span className={overdue ? 'font-medium text-danger-text' : 'text-text-secondary'}>{formatDueDate(task.end_date, today)}</span>
        )}
        {subtasks && subtasks.length > 0 && (
          <span className="tabular font-mono text-text-tertiary" title="Подзадачи">
            {subDone}/{subtasks.length}
          </span>
        )}
        <span className={`tabular ml-auto font-mono ${running ? 'font-medium text-accent-text' : 'text-text-secondary'}`}>
          {running && activeTimer ? formatClock(activeTimer.started_at) : task.planned_hours > 0 ? `${formatHoursRu(fact)} / ${formatHoursRu(task.planned_hours)}` : fact > 0 ? formatHoursRu(fact) : ''}
        </span>
        {!done && (
          <button
            type="button"
            onClick={running ? onStopTimer : onStartTimer}
            title={running ? 'Остановить учёт' : 'Начать учёт'}
            aria-label={`${running ? 'Остановить учёт' : 'Начать учёт'}: ${task.name}`}
            className={`board-play flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              running ? 'bg-accent text-on-accent' : 'text-text-secondary hover:bg-surface-sunken hover:text-text'
            }`}
          >
            {running ? <StopGlyph size={9} color="currentColor" /> : <Play size={12} />}
          </button>
        )}
      </span>
    </article>
  )
}
