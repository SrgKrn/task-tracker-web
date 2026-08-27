import { Link } from 'react-router-dom'
import { PlayGlyph, Ring, StopGlyph, type RingState } from './Ring'
import { Tag } from './ui'
import type { ActiveTimer, Project, Section, Status, Task } from '../lib/types'
import { elapsedHours, formatClock, formatHoursRu, useTicker } from '../lib/time'

interface TaskListItemProps {
  task: Task
  status: Status | undefined
  project: Project | undefined
  section: Section | undefined
  activeTimer: ActiveTimer | null | undefined
  onStartTimer: () => void
  onStopTimer: () => void
}

export function isOverdue(task: Task, status: Status | undefined): boolean {
  if (!task.end_date || status?.is_final) return false
  return new Date(task.end_date) < new Date(new Date().toDateString())
}

export function TaskListItem({
  task,
  status,
  project,
  section,
  activeTimer,
  onStartTimer,
  onStopTimer,
}: TaskListItemProps) {
  const isRunning = activeTimer?.task_id === task.id
  useTicker(isRunning)

  const done = !!status?.is_final
  // факт активной задачи растёт на лету — считаем от started_at, а не накоплением тиков
  const fact = isRunning && activeTimer ? task.fact_hours + elapsedHours(activeTimer.started_at) : task.fact_hours
  const pct = task.planned_hours > 0 ? (fact / task.planned_hours) * 100 : 0
  const over = pct > 100 && !done
  const overdue = isOverdue(task, status)

  const ringState: RingState = done ? 'done' : over ? 'over' : isRunning ? 'running' : 'idle'
  const cardBg = isRunning ? 'var(--s-surface-active)' : 'var(--s-surface)'

  const meta = `${formatHoursRu(fact)} / ${formatHoursRu(task.planned_hours)} ч · ${
    done ? 'закрыто' : overdue ? 'просрочено' : (project?.name ?? section?.name ?? '')
  }`

  return (
    <div
      className="flex items-center gap-3 rounded-[15px] px-[13px] py-[11px]"
      style={{
        background: cardBg,
        border: `1px solid ${isRunning ? 'var(--s-accent)' : 'var(--s-border)'}`,
      }}
    >
      <Ring
        size={32}
        pct={done ? 100 : pct}
        state={ringState}
        centerBg={cardBg}
        onClick={isRunning ? onStopTimer : onStartTimer}
        ariaLabel={isRunning ? 'Остановить учёт' : 'Начать учёт'}
      >
        {isRunning ? (
          <StopGlyph />
        ) : done ? (
          <span className="font-mono text-xs font-medium text-emerald-400">✓</span>
        ) : (
          <PlayGlyph />
        )}
      </Ring>

      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
        <p
          className={`truncate text-[14.5px] leading-[1.3] ${
            done ? 'font-normal text-[#8a8a92] line-through' : 'font-medium text-slate-100'
          }`}
        >
          {task.name}
        </p>
        <span
          className={`font-mono text-[11px] leading-[1.4] ${
            overdue && !done ? 'text-red-400' : done ? 'text-slate-600' : 'text-slate-500'
          }`}
        >
          {meta}
        </span>
      </Link>

      {isRunning && activeTimer ? (
        <span className="tabular shrink-0 font-mono text-[13.5px] font-semibold text-sky-600">
          {formatClock(activeTimer.started_at)}
        </span>
      ) : done ? null : status ? (
        <Tag>{status.label}</Tag>
      ) : null}
    </div>
  )
}
