import { Link, useLocation } from 'react-router-dom'
import { Ring, StopGlyph } from './Ring'
import { describeError, useToast } from '../lib/Toast'
import { tap } from '../lib/haptics'
import { useProjects } from '../lib/queries/projects'
import { useTask } from '../lib/queries/tasks'
import { useActiveTimer, useStopTimer } from '../lib/queries/timer'
import { formatClock, sessionHourPct, useTicker } from '../lib/time'

/**
 * TimerDock — активная сессия всегда на виду, прикноплена к верху страницы (не к низу,
 * рядом с таб-баром, где её неудобно и ловить, и не задевать случайно). Кольцо — отдельная
 * кнопка «Остановить»: жмётся напрямую, без перехода в карточку задачи.
 */
export function ActiveTimerBar() {
  const { data: activeTimer } = useActiveTimer()
  const { data: task } = useTask(activeTimer?.task_id)
  const { data: projects = [] } = useProjects()
  const location = useLocation()
  const stopTimer = useStopTimer()
  const { showError } = useToast()
  useTicker(!!activeTimer)

  if (!activeTimer || !task) return null
  if (location.pathname === `/tasks/${task.id}`) return null

  const project = projects.find((p) => p.id === task.project_id)

  return (
    <div
      className="safe-top mx-4 mt-2 mb-2 flex items-center gap-3 rounded-[20px] px-[14px] py-[11px]"
      style={{ background: 'var(--s-timer-bg)', border: '1px solid rgba(232,163,61,.4)' }}
    >
      <Ring
        size={34}
        pct={sessionHourPct(activeTimer.started_at)}
        state="running"
        track="var(--s-timer-track)"
        centerBg="var(--s-timer-bg)"
        onClick={() => {
          tap()
          stopTimer.mutate(undefined, { onError: (e) => showError(describeError(e)) })
        }}
        ariaLabel="Остановить учёт"
      >
        <StopGlyph size={9} />
      </Ring>

      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
        <span className="block font-mono text-2xs uppercase tracking-[.12em] text-sky-700">
          Идёт учёт{project ? ` · ${project.name}` : ''}
        </span>
        <span className="block truncate text-sm font-medium text-slate-100">{task.name}</span>
      </Link>

      <Link to={`/tasks/${task.id}`} className="tabular shrink-0 font-mono text-lg font-semibold text-sky-600">
        {formatClock(activeTimer.started_at)}
      </Link>
    </div>
  )
}
