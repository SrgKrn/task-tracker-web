import { useMemo } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Ring } from '../components/Ring'
import { Overline } from '../components/ui'
import { currentWeekRange, todayStr } from '../lib/period'
import { useTimeEntriesInRange } from '../lib/queries/dashboard'
import { useTasks } from '../lib/queries/tasks'
import { useActiveWorkspace } from '../lib/workspace'
import { dayNormFor, normSettingsOf } from '../lib/norm'
import { entryMinutes, formatHoursRu } from '../lib/time'
import { TaskList } from './TaskList'
import { useNavDirection } from '../lib/navMotion'

const DEFAULT_DAY_NORM = 8

/**
 * Правая часть split-view, пока задача не выбрана. Раньше здесь была одна строка
 * «Выберите задачу слева» посреди тысячи пустых пикселей — место есть, смысла не было.
 * Показываем то, ради чего вообще открывают трекер: сколько сделано сегодня.
 */
function TaskWorkspaceEmpty() {
  const today = todayStr()
  const week = useMemo(() => currentWeekRange(), [])
  const { data: tasks = [] } = useTasks()
  const workspace = useActiveWorkspace()
  const { data: entries = [] } = useTimeEntriesInRange(week.from, week.to)

  const dayFact = useMemo(
    () =>
      entries
        .filter((e) => e.effective_date === today)
        .reduce((sum, e) => sum + entryMinutes(e), 0) / 60,
    [entries, today],
  )
  const weekFact = useMemo(
    () => entries.reduce((sum, e) => sum + entryMinutes(e), 0) / 60,
    [entries],
  )

  const dayNorm = dayNormFor(today, normSettingsOf(workspace)) ?? DEFAULT_DAY_NORM
  const openCount = tasks.filter((t) => !t.parent_id).length

  return (
    <div className="hidden flex-col items-center gap-5 lg:flex">
      <Ring size={104} pct={(dayFact / dayNorm) * 100} state="running" centerBg="var(--bg)" marker>
        <span className="flex flex-col items-center gap-0.5">
          <span className="tabular font-mono text-xl font-semibold text-text">
            {formatHoursRu(dayFact)}
          </span>
          <span className="text-sm font-medium text-text-secondary">
            из {formatHoursRu(dayNorm)} ч
          </span>
        </span>
      </Ring>

      <div className="flex gap-8">
        {[
          { label: 'За неделю', value: `${formatHoursRu(weekFact)} ч` },
          { label: 'Задач в работе', value: String(openCount) },
        ].map((s) => (
          <span key={s.label} className="flex flex-col items-center gap-1">
            <Overline>{s.label}</Overline>
            <span className="tabular font-mono text-lg font-semibold text-text">{s.value}</span>
          </span>
        ))}
      </div>

      <p className="text-base text-text-secondary">Выберите задачу слева, чтобы открыть карточку</p>
    </div>
  )
}

export function TaskWorkspace() {
  const location = useLocation()
  const hasDetail = location.pathname !== '/tasks'
  const dir = useNavDirection(location.pathname)

  return (
    <div className="lg:flex lg:items-start">
      <div
        className={`${hasDetail ? 'hidden lg:block' : 'block'} task-list-pane pane-return sc lg:sc-fade`}
        data-dir={dir}
      >
        <TaskList />
      </div>
      <div
        className={`${hasDetail ? 'block' : 'hidden lg:flex lg:items-center lg:justify-center'} task-detail-pane min-w-0 flex-1`}
        style={{ borderLeft: '1px solid var(--divider)' }}
      >
        {hasDetail ? (
          // карточка въезжает справа, как экран в iOS; соседняя — тоже, «назад» — слева
          <div key={location.pathname} className="route-enter lg:h-full" data-dir={dir}>
            <Outlet />
          </div>
        ) : (
          <TaskWorkspaceEmpty />
        )}
      </div>
    </div>
  )
}
