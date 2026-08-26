import { Link } from 'react-router-dom'
import type { ActiveTimer, Project, Section, Status, Task } from '../lib/types'
import { formatElapsed, formatHours, useTicker } from '../lib/time'

interface TaskListItemProps {
  task: Task
  status: Status | undefined
  project: Project | undefined
  section: Section | undefined
  activeTimer: ActiveTimer | null | undefined
  onStartTimer: () => void
  onStopTimer: () => void
}

function isOverdue(task: Task, status: Status | undefined): boolean {
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
  const isTracking = activeTimer?.task_id === task.id
  useTicker(isTracking)
  const overdue = isOverdue(task, status)
  const progress = task.planned_hours > 0 ? Math.min(1, task.fact_hours / task.planned_hours) : 0

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2.5">
      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
        <p className="truncate text-slate-100">{task.name}</p>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {project && (
            <span className="inline-flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <path
                  d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
              </svg>
              {project.name}
            </span>
          )}
          {section && (
            <span className="inline-flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="shrink-0">
                <path
                  d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
              </svg>
              {section.name}
            </span>
          )}
          {task.end_date && (
            <span className={overdue ? 'font-medium text-red-400' : ''}>
              до {new Date(task.end_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
            </span>
          )}
        </div>

        {status && (
          <span
            className="mt-1 inline-block rounded-full px-2 py-0.5 text-xs"
            style={{
              backgroundColor: status.is_final ? 'var(--color-sky-600)' : 'rgba(232, 163, 61, 0.14)',
              color: status.is_final ? 'var(--color-slate-900)' : 'var(--color-sky-600)',
            }}
          >
            {status.label}
          </span>
        )}

        <div className="mt-1.5 h-1 w-full max-w-40 overflow-hidden rounded-full bg-slate-700">
          <div
            className="h-full rounded-full bg-sky-600"
            style={{ width: `${progress * 100}%`, opacity: progress >= 1 ? 1 : 0.6 }}
          />
        </div>
      </Link>

      <div className="flex shrink-0 flex-col items-end gap-1.5 text-sm">
        <p className="text-slate-300">
          {formatHours(task.fact_hours)} / {formatHours(task.planned_hours)} ч
        </p>
        {isTracking && activeTimer ? (
          <button
            onClick={onStopTimer}
            className="rounded-full bg-sky-600 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-900 active:bg-sky-700"
          >
            {formatElapsed(activeTimer.started_at)} ■
          </button>
        ) : (
          <button
            onClick={onStartTimer}
            className="rounded-full border border-sky-600 px-2.5 py-1 text-xs font-medium text-sky-600 active:bg-sky-600/10"
          >
            ▶ Старт
          </button>
        )}
      </div>
    </div>
  )
}
