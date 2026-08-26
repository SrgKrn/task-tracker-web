import { Link } from 'react-router-dom'
import type { Status, Task } from '../lib/types'
import { formatHours } from '../lib/time'

interface TaskListItemProps {
  task: Task
  status: Status | undefined
  isTracking: boolean
}

export function TaskListItem({ task, status, isTracking }: TaskListItemProps) {
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-800/40 px-3 py-2.5 active:bg-slate-800"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-slate-100">{task.name}</p>
        {status && (
          <span className="mt-0.5 inline-block rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
            {status.label}
          </span>
        )}
      </div>
      <div className="shrink-0 text-right text-sm">
        <p className="text-slate-300">
          {formatHours(task.fact_hours)} / {formatHours(task.planned_hours)} ч
        </p>
        {isTracking && <p className="text-xs font-medium text-sky-600">● идёт трекинг</p>}
      </div>
    </Link>
  )
}
