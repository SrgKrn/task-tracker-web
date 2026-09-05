import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlayGlyph, Ring, StopGlyph, type RingState } from './Ring'
import { Tag } from './ui'
import { tap } from '../lib/haptics'
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
  /** свайп влево открывает эти действия; без них строка не свайпается */
  onDuplicate?: () => void
  onDelete?: () => void
}

export function isOverdue(task: Task, status: Status | undefined): boolean {
  if (!task.end_date || status?.is_final) return false
  return new Date(task.end_date) < new Date(new Date().toDateString())
}

/** ширина «ящика» с действиями, открываемого свайпом */
const ACTIONS_WIDTH = 148
const OPEN_THRESHOLD = 56

export function TaskListItem({
  task,
  status,
  project,
  section,
  activeTimer,
  onStartTimer,
  onStopTimer,
  onDuplicate,
  onDelete,
}: TaskListItemProps) {
  const isRunning = activeTimer?.task_id === task.id
  useTicker(isRunning)

  const swipeable = !!onDuplicate || !!onDelete
  const [offset, setOffset] = useState(0)
  // флаг жеста живёт в ref, а не в state: touchmove может прийти в том же кадре, что и
  // touchstart, когда состояние ещё не перерисовалось — и жест бы просто не начался
  const draggingRef = useRef(false)
  const [animating, setAnimating] = useState(true)
  const startX = useRef(0)
  const startOffset = useRef(0)
  const axisLocked = useRef<'x' | 'y' | null>(null)

  const done = !!status?.is_final
  // факт активной задачи растёт на лету — считаем от started_at, а не накоплением тиков
  const fact = isRunning && activeTimer ? task.fact_hours + elapsedHours(activeTimer.started_at) : task.fact_hours
  const pct = task.planned_hours > 0 ? (fact / task.planned_hours) * 100 : 0
  const over = pct > 100 && !done
  const overdue = isOverdue(task, status)

  const ringState: RingState = done ? 'done' : over ? 'over' : isRunning ? 'running' : 'idle'
  const cardBg = isRunning ? 'var(--s-surface-active)' : 'var(--s-surface)'

  // просрочка не должна вытеснять проект/раздел — это тоже важная информация в краткой
  // строке; сигнал «просрочено» подаём цветом текста и добавкой, а не заменой категории
  const category = project?.name ?? section?.name ?? ''
  const meta = `${formatHoursRu(fact)} / ${formatHoursRu(task.planned_hours)} ч${category ? ` · ${category}` : ''}${
    done ? ' · закрыто' : overdue ? ' · просрочено' : ''
  }`

  function onTouchStart(e: React.TouchEvent) {
    if (!swipeable) return
    startX.current = e.touches[0].clientX
    startOffset.current = offset
    axisLocked.current = null
    draggingRef.current = true
    setAnimating(false)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!swipeable || !draggingRef.current) return
    const dx = e.touches[0].clientX - startX.current
    // до первого заметного сдвига не решаем, свайп это или прокрутка списка
    if (axisLocked.current === null) {
      if (Math.abs(dx) < 8) return
      axisLocked.current = 'x'
    }
    const next = Math.min(0, Math.max(-ACTIONS_WIDTH, startOffset.current + dx))
    setOffset(next)
  }

  function onTouchEnd() {
    if (!swipeable || !draggingRef.current) return
    draggingRef.current = false
    setAnimating(true)
    setOffset((current) => (current < -OPEN_THRESHOLD ? -ACTIONS_WIDTH : 0))
  }

  const close = () => setOffset(0)

  return (
    <div className="relative overflow-hidden rounded-[15px]">
      {swipeable && (
        <div className="absolute inset-y-0 right-0 flex" style={{ width: ACTIONS_WIDTH }}>
          {onDuplicate && (
            <button
              type="button"
              onClick={() => {
                close()
                onDuplicate()
              }}
              className="flex-1 text-xs font-medium text-slate-300"
              style={{ background: '#1e1e24' }}
            >
              Дублировать
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={() => {
                close()
                onDelete()
              }}
              className="flex-1 text-xs font-medium"
              style={{ background: 'rgba(217,114,86,.18)', color: 'var(--s-danger)' }}
            >
              Удалить
            </button>
          )}
        </div>
      )}

      <div
        className="relative flex items-center gap-3 rounded-[15px] px-[13px] py-[11px]"
        style={{
          background: cardBg,
          border: `1px solid ${isRunning ? 'var(--s-accent)' : 'var(--s-border)'}`,
          transform: `translateX(${offset}px)`,
          transition: animating ? 'transform 180ms ease-out' : 'none',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <Ring
          size={32}
          pct={done ? 100 : pct}
          state={ringState}
          centerBg={cardBg}
          onClick={() => {
            tap()
            if (isRunning) onStopTimer()
            else onStartTimer()
          }}
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

        <Link
          to={`/tasks/${task.id}`}
          className="min-w-0 flex-1"
          // открытый «ящик» действий: первый тап должен закрывать его, а не уводить в карточку
          onClick={(e) => {
            if (offset !== 0) {
              e.preventDefault()
              close()
            }
          }}
        >
          <p
            title={task.name}
            className={`truncate text-sm leading-[1.3] ${
              done ? 'font-normal text-[#8a8a92] line-through' : 'font-medium text-slate-100'
            }`}
          >
            {task.name}
          </p>
          <span
            title={meta}
            className={`font-mono text-2xs leading-[1.4] ${
              overdue && !done ? 'text-red-400' : done ? 'text-slate-600' : 'text-slate-500'
            }`}
          >
            {meta}
          </span>
        </Link>

        {isRunning && activeTimer ? (
          <span className="tabular shrink-0 font-mono text-sm font-semibold text-sky-600">
            {formatClock(activeTimer.started_at)}
          </span>
        ) : done ? null : status ? (
          <Tag>{status.label}</Tag>
        ) : null}
      </div>
    </div>
  )
}
