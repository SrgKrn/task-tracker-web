import { Link, useLocation } from 'react-router-dom'
import { Ring, StopGlyph } from './Ring'
import { ClientDot } from './ui'
import { describeError, useToast } from '../lib/Toast'
import { tap } from '../lib/haptics'
import { useGroupModel } from '../lib/groups'
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
  const { data: parent } = useTask(task?.parent_id ?? undefined)
  const model = useGroupModel()
  const location = useLocation()
  const stopTimer = useStopTimer()
  const { showError } = useToast()
  useTicker(!!activeTimer)

  if (!activeTimer || !task) return null
  if (location.pathname === `/tasks/${task.id}`) return null

  const label = model.listLabel(task)

  return (
    <div
      data-top-bar
      className="safe-top mx-4 mt-2 mb-2 flex items-center gap-3 rounded-md border border-[var(--timer-border)] bg-[var(--timer-bg)] px-3 py-2.5"
    >
      <Ring
        size={34}
        pct={sessionHourPct(activeTimer.started_at)}
        state="running"
        track="var(--timer-track)"
        centerBg="var(--timer-bg)"
        onClick={() => {
          tap()
          stopTimer.mutate(undefined, { onError: (e) => showError(describeError(e)) })
        }}
        ariaLabel="Остановить учёт"
      >
        <StopGlyph size={9} />
      </Ring>

      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1">
        {/* в одну строку: название спринта длиннее подписи и переносом раздувало док вдвое */}
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--timer-text)]">
          <span className="shrink-0">Идёт учёт</span>
          {(parent || label) && <span aria-hidden>·</span>}
          {!parent && <ClientDot color={model.colorOf(task)} size={7} />}
          {(parent || label) && <span className="min-w-0 truncate">{parent ? parent.name : label}</span>}
        </span>
        <span className="block truncate text-base font-medium text-text">{task.name}</span>
      </Link>

      <Link to={`/tasks/${task.id}`} className="tabular shrink-0 font-mono text-lg font-medium text-[var(--timer-text)]">
        {formatClock(activeTimer.started_at)}
      </Link>
    </div>
  )
}
