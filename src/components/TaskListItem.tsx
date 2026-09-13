import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PlayGlyph, Ring, StopGlyph, type RingState } from './Ring'
import { SubtaskList } from './SubtaskList'
import { Tag } from './ui'
import { Check, ChevronDown, Plus } from './Icon'
import { tap } from '../lib/haptics'
import { autoExpandFor, useExpanded } from '../lib/expanded'
import { useStatuses } from '../lib/queries/statuses'
import type { ActiveTimer, Project, Section, Status, Task } from '../lib/types'
import { elapsedHours, formatClock, formatHoursRu, useTicker } from '../lib/time'
import { isOverdue, rollupFact, runningWithin } from '../lib/tree'

export { isOverdue }

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
  /** подзадачи спринта: их часы входят в факт строки, а сам состав раскрывается под ней */
  subtasks?: Task[]
  /** false — факт считается с подзадачами, но раскрыть состав здесь нельзя («Сегодня») */
  expandable?: boolean
  /** поиск нашёл совпадение внутри состава — показываем его, не дожидаясь нажатия */
  forceExpanded?: boolean
  hideDoneSubtasks?: boolean
  /** у подзадачи вне своего спринта: чья она, иначе «Созвон» непонятно к чему относится */
  parentName?: string
}

/** ширина «ящика» с действиями, открываемого свайпом */
const ACTIONS_WIDTH = 148
const OPEN_THRESHOLD = 56
/** дальше квадратики сливаются в полосу и перестают считываться поштучно */
const MAX_PIPS = 12

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
  subtasks,
  expandable = true,
  forceExpanded = false,
  hideDoneSubtasks = false,
  parentName,
}: TaskListItemProps) {
  const runningTaskId = activeTimer?.task_id
  const isRunningSelf = runningTaskId === task.id
  // спринт «идёт», если учёт идёт по нему самому или по любой его подзадаче
  const isRunning = runningWithin(task, subtasks, runningTaskId)
  useTicker(isRunning)

  const hasSubtasks = !!subtasks && subtasks.length > 0
  const [storedOpen, setOpen] = useExpanded(task.id)
  // пустой спринт раскрыли нажатием — сразу даём поле ввода: раскрывать там больше нечего
  const [startAdding, setStartAdding] = useState(false)

  // запустили учёт по подзадаче — спринт раскрывается сам, чтобы было видно, что тикает.
  // Один раз на подзадачу: свёрнутый после этого спринт так и остаётся свёрнутым
  const runningChildId = hasSubtasks && subtasks?.some((c) => c.id === runningTaskId) ? runningTaskId : null
  useEffect(() => {
    if (expandable) autoExpandFor(task.id, runningChildId)
  }, [task.id, runningChildId, expandable])

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
  /*
   * Полоса состава у спринта в списке. Раньше она появлялась только при уже существующих
   * подзадачах — и первую подзадачу из списка добавить было нечем: у всех спринтов их ноль,
   * и найти вход можно было только внутри карточки. Теперь полоса есть у каждого
   * незакрытого спринта; у закрытого без подзадач раскладывать уже нечего.
   */
  const showComposition = expandable && !task.parent_id && (hasSubtasks || !done)
  const open = showComposition && (storedOpen || forceExpanded)
  // факт активной задачи растёт на лету — считаем от started_at, а не накоплением тиков
  const live = isRunning && activeTimer ? elapsedHours(activeTimer.started_at) : 0
  const fact = rollupFact(task, subtasks) + live
  const hasPlan = task.planned_hours > 0
  const pct = hasPlan ? (fact / task.planned_hours) * 100 : 0
  const over = pct > 100 && !done
  const overdue = isOverdue(task, status)

  const ringState: RingState = done ? 'done' : over ? 'over' : isRunning ? 'running' : 'idle'
  const cardBg = isRunning ? 'var(--s-surface-active)' : 'var(--s-surface)'

  // мета держится в одну строку: раньше приписка «просрочено» переносила её на вторую
  // и строка становилась на треть выше соседних. Состояние показываем тегом справа —
  // там для него есть отдельное место, и оно не спорит с проектом за ширину.
  const category = parentName
    ? [project?.name, parentName].filter(Boolean).join(' · ')
    : (project?.name ?? section?.name ?? '')
  // «1,8 / 0 ч» выглядело как ошибка: у задачи без плана нет знаменателя
  const hours = hasPlan
    ? `${formatHoursRu(fact)} / ${formatHoursRu(task.planned_hours)} ч`
    : `${formatHoursRu(fact)} ч · без плана`
  const meta = `${hours}${category ? ` · ${category}` : ''}`

  // часы справа: у раскрытого спринта они уже тикают в строке подзадачи — второй раз не нужны
  const showClock = isRunning && !!activeTimer && (isRunningSelf || !open)

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
    <div className="flex flex-col gap-1.5">
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
          className="relative flex flex-col rounded-[15px] px-[13px] py-[11px]"
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
          <div className="flex items-center gap-3">
            <Ring
              size={32}
              pct={done ? 100 : pct}
              state={ringState}
              centerBg={cardBg}
              onClick={() => {
                tap()
                // идёт подзадача — кольцо спринта её останавливает; иначе учёт идёт в сам спринт
                if (isRunning) onStopTimer()
                else onStartTimer()
              }}
              ariaLabel={isRunning ? 'Остановить учёт' : 'Начать учёт'}
            >
              {isRunning ? (
                <StopGlyph />
              ) : done ? (
                <Check size={14} className="text-emerald-400" />
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
              {/* две строки вместо одной: тег статуса справа оставлял имени ~190px,
                  и половина названий обрывалась на середине прямо на главном экране */}
              <p
                title={task.name}
                className={`text-sm leading-[1.3] ${
                  done ? 'font-normal text-[#8a8a92] line-through' : 'font-medium text-slate-100'
                }`}
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {task.name}
              </p>
              <span
                title={meta}
                className={`block truncate font-mono text-2xs leading-[1.4] ${
                  overdue && !done ? 'text-red-400' : done ? 'text-slate-600' : 'text-slate-500'
                }`}
              >
                {meta}
              </span>
            </Link>

            {showClock && activeTimer ? (
              <span className="tabular shrink-0 font-mono text-sm font-semibold text-sky-600">
                {formatClock(activeTimer.started_at)}
              </span>
            ) : done ? null : overdue ? (
              <Tag tone="danger">просрочено</Tag>
            ) : status ? (
              <Tag>{status.label}</Tag>
            ) : null}
          </div>

          {showComposition && (
            <CompositionToggle
              taskId={task.id}
              subtasks={subtasks ?? []}
              runningTaskId={runningTaskId}
              open={open}
              onToggle={() => {
                if (offset !== 0) {
                  close()
                  return
                }
                tap()
                setStartAdding(!open && !hasSubtasks)
                setOpen(!open)
              }}
            />
          )}
        </div>
      </div>

      {open && (
        <SubtaskList
          id={`subtasks-${task.id}`}
          parent={task}
          subtasks={subtasks ?? []}
          startAdding={startAdding}
          hideDone={hideDoneSubtasks}
          nested
        />
      )}
    </div>
  )
}

/**
 * Полоса под строкой спринта: сколько в нём подзадач и сколько закрыто. Вся полоса —
 * кнопка раскрытия. Счётчик не стоит справа от названия: рядом с тегом статуса он
 * оставлял имени спринта меньше 120px, а названия у спринтов длинные.
 */
function CompositionToggle({
  taskId,
  subtasks,
  runningTaskId,
  open,
  onToggle,
}: {
  taskId: string
  subtasks: Task[]
  runningTaskId: string | undefined
  open: boolean
  onToggle: () => void
}) {
  const { data: statuses = [] } = useStatuses()
  const finalIds = new Set(statuses.filter((s) => s.is_final).map((s) => s.id))
  const isDone = (t: Task) => !!t.status_id && finalIds.has(t.status_id)
  const doneCount = subtasks.filter(isDone).length

  if (subtasks.length === 0) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`subtasks-${taskId}`}
        className={`-mb-[11px] mt-2 ml-11 flex h-10 items-center gap-2 text-left ${
          open ? 'text-sky-600' : 'text-slate-500'
        }`}
        style={{ borderTop: '1px solid var(--s-hairline)' }}
      >
        <Plus size={14} />
        <span className="font-mono text-2xs uppercase tracking-[.12em]">Подзадача</span>
        {open && (
          <span className="ml-auto flex" style={{ transform: 'rotate(180deg)' }}>
            <ChevronDown size={14} />
          </span>
        )}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`subtasks-${taskId}`}
      className={`-mb-[11px] mt-2 ml-11 flex h-10 items-center gap-2.5 text-left ${
        open ? 'text-sky-600' : 'text-slate-500'
      }`}
      style={{ borderTop: '1px solid var(--s-hairline)' }}
    >
      {subtasks.length <= MAX_PIPS && (
        <span className="flex gap-[3px]" aria-hidden="true">
          {subtasks.map((c) => (
            <span
              key={c.id}
              className="h-[5px] w-[5px] rounded-[1.5px]"
              style={{
                background: isDone(c)
                  ? 'var(--s-success)'
                  : c.id === runningTaskId
                    ? 'var(--s-accent)'
                    : 'var(--s-ring-track)',
              }}
            />
          ))}
        </span>
      )}
      <span className="font-mono text-2xs uppercase tracking-[.12em]">Подзадачи</span>
      <span className="tabular font-mono text-2xs">
        {doneCount} из {subtasks.length}
      </span>
      {/* поворот стрелки — единственная анимация раскрытия; сам состав появляется сразу */}
      <span
        className="ml-auto flex transition-transform duration-200"
        style={{ transform: open ? 'rotate(180deg)' : undefined }}
      >
        <ChevronDown size={14} />
      </span>
    </button>
  )
}
