import { Link, useLocation } from 'react-router-dom'
import { useTask } from '../lib/queries/tasks'
import { useActiveTimer, useStopTimer } from '../lib/queries/timer'
import { describeError, useToast } from '../lib/Toast'
import { formatElapsed, useTicker } from '../lib/time'

export function ActiveTimerBar() {
  const { data: activeTimer } = useActiveTimer()
  const { data: task } = useTask(activeTimer?.task_id)
  const stopTimer = useStopTimer()
  const { showError } = useToast()
  const location = useLocation()
  useTicker(!!activeTimer)

  if (!activeTimer || !task) return null
  // the task's own screen already has a full timer control — avoid showing it twice
  if (location.pathname === `/tasks/${task.id}`) return null

  const STALE_AFTER_MS = 2 * 60 * 60 * 1000
  const isStale = Date.now() - new Date(activeTimer.started_at).getTime() >= STALE_AFTER_MS

  return (
    <div
      className={`flex items-center gap-3 border-b border-sky-600/40 bg-sky-600/10 px-4 py-2 text-sm ${isStale ? '' : 'safe-top'}`}
    >
      <span className="text-sky-600">●</span>
      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1 truncate text-slate-100">
        {task.name}
      </Link>
      <span className="shrink-0 tabular-nums text-sky-600">{formatElapsed(activeTimer.started_at)}</span>
      <button
        onClick={() => stopTimer.mutate(undefined, { onError: (e) => showError(describeError(e)) })}
        className="shrink-0 rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-slate-900 active:bg-sky-700"
      >
        Стоп
      </button>
    </div>
  )
}
