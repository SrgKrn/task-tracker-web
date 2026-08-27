import { useLocation, useNavigate } from 'react-router-dom'
import { Ring, StopGlyph } from './Ring'
import { useProjects } from '../lib/queries/projects'
import { useTask } from '../lib/queries/tasks'
import { useActiveTimer } from '../lib/queries/timer'
import { formatClock, sessionHourPct, useTicker } from '../lib/time'

/**
 * TimerDock — активная сессия всегда на виду. Живёт над таб-баром на всех вкладках,
 * кроме карточки той же задачи (там уже есть полноразмерный секундомер).
 */
export function ActiveTimerBar() {
  const { data: activeTimer } = useActiveTimer()
  const { data: task } = useTask(activeTimer?.task_id)
  const { data: projects = [] } = useProjects()
  const location = useLocation()
  const navigate = useNavigate()
  useTicker(!!activeTimer)

  if (!activeTimer || !task) return null
  if (location.pathname === `/tasks/${task.id}`) return null

  const project = projects.find((p) => p.id === task.project_id)

  return (
    <button
      type="button"
      onClick={() => navigate(`/tasks/${task.id}`)}
      className="mx-4 flex w-[calc(100%-2rem)] items-center gap-3 rounded-[20px] px-[14px] py-[11px] text-left"
      style={{ background: 'var(--s-timer-bg)', border: '1px solid rgba(232,163,61,.4)' }}
    >
      <Ring
        size={34}
        pct={sessionHourPct(activeTimer.started_at)}
        state="running"
        track="var(--s-timer-track)"
        centerBg="var(--s-timer-bg)"
      >
        <StopGlyph size={9} />
      </Ring>

      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] uppercase tracking-[.12em] text-sky-700">
          Идёт учёт{project ? ` · ${project.name}` : ''}
        </span>
        <span className="block truncate text-[13.5px] font-medium text-slate-100">{task.name}</span>
      </span>

      <span className="tabular shrink-0 font-mono text-[19px] font-semibold text-sky-600">
        {formatClock(activeTimer.started_at)}
      </span>
    </button>
  )
}
