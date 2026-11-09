import { useMemo, useRef, useState } from 'react'
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
import { useMediaQuery } from '../lib/device'
import { useTaskView } from '../lib/taskView'
import { clampListWidth, LIST_WIDTH_DEFAULT, loadListWidth, saveListWidth } from '../lib/paneWidth'

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

/**
 * Граница между списком и карточкой (0.60): тянется мышью или стрелками, двойной клик —
 * ширина по умолчанию. Ширина запоминается на устройстве.
 */
function PaneSplitter({ width, onChange }: { width: number; onChange: (w: number) => void }) {
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ x: number; w: number } | null>(null)

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Ширина списка задач"
      aria-valuenow={width}
      aria-valuemin={clampListWidth(0)}
      aria-valuemax={clampListWidth(10_000)}
      tabIndex={0}
      title="Потяните, чтобы изменить ширину. Двойной клик — как было"
      data-dragging={dragging || undefined}
      className="task-split hidden lg:block"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        start.current = { x: e.clientX, w: width }
        setDragging(true)
      }}
      onPointerMove={(e) => {
        if (!start.current) return
        onChange(clampListWidth(start.current.w + e.clientX - start.current.x))
      }}
      onPointerUp={() => {
        start.current = null
        setDragging(false)
        saveListWidth(width)
      }}
      onPointerCancel={() => {
        start.current = null
        setDragging(false)
      }}
      onDoubleClick={() => {
        onChange(LIST_WIDTH_DEFAULT)
        saveListWidth(LIST_WIDTH_DEFAULT)
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16
        const next = e.key === 'ArrowLeft' ? width - step : e.key === 'ArrowRight' ? width + step : null
        if (next === null) return
        e.preventDefault()
        const w = clampListWidth(next)
        onChange(w)
        saveListWidth(w)
      }}
    />
  )
}

export function TaskWorkspace() {
  const location = useLocation()
  const hasDetail = location.pathname !== '/tasks'
  const dir = useNavDirection(location.pathname)
  const desktop = useMediaQuery('(min-width: 1024px)')
  const [listWidth, setListWidth] = useState(loadListWidth)
  // доска и календарь (0.64) — во всю ширину, карточка открывается справа своей ширины
  const wide = useTaskView()[0] !== 'list'

  return (
    <div className="lg:flex lg:items-start" style={desktop ? ({ '--list-w': `${listWidth}px` } as React.CSSProperties) : undefined}>
      <div
        className={`${hasDetail ? 'hidden lg:block' : 'block'} task-list-pane sc lg:sc-fade`}
        data-wide={wide || undefined}
      >
        <TaskList />
      </div>
      <PaneSplitter width={listWidth} onChange={setListWidth} />
      <div
        className={`${hasDetail ? 'block' : wide ? 'hidden' : 'hidden lg:flex lg:items-center lg:justify-center'} task-detail-pane min-w-0 flex-1`}
        data-wide={wide || undefined}
      >
        {hasDetail ? (
          // карточка въезжает справа, как экран в iOS; соседняя — тоже, «назад» — слева
          <div key={location.pathname} className="route-enter lg:min-h-full" data-dir={dir}>
            <Outlet />
          </div>
        ) : (
          <TaskWorkspaceEmpty />
        )}
      </div>
    </div>
  )
}
