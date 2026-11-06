import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useMatch, useNavigate } from 'react-router-dom'
import { PlayGlyph, Ring, StopGlyph, type RingState } from './Ring'
import { SubtaskList } from './SubtaskList'
import { ClientDot, Collapse } from './ui'
import { Check, ChevronDown, CornerDownRight, Plus } from './Icon'
import { tap } from '../lib/haptics'
import { isFresh } from '../lib/fresh'
import { RowMenu, type RowMenuItem } from './RowMenu'
import { ROW_MENU_EVENT } from './useDragSort'
import { autoExpandFor, startAdding, stopAdding, useAddingFor, useExpanded } from '../lib/expanded'
import { useStatuses } from '../lib/queries/statuses'
import { addDays, formatDueDate, todayStr } from '../lib/period'
import type { ActiveTimer, LabelColor, Status, Task } from '../lib/types'
import { elapsedHours, formatClock, formatHoursRu, useTicker } from '../lib/time'
import { isOverdue, rollupFact, runningWithin } from '../lib/tree'

export { isOverdue }

interface TaskListItemProps {
  task: Task
  status: Status | undefined
  /** значения групп «в строке» — например «Ромашка» или «Битрикс24 · Ромашка» */
  label?: string
  /** цвет точки клиента (model.colorOf) */
  color?: LabelColor | null
  activeTimer: ActiveTimer | null | undefined
  onStartTimer: () => void
  onStopTimer: () => void
  /** свайп влево открывает эти действия; без них строка не свайпается */
  onDuplicate?: () => void
  onDelete?: () => void
  /** «Не сегодня»: снять с плана дня («Сегодня») */
  onUnplan?: () => void
  /** подзадачи спринта: их часы входят в факт строки, а сам состав раскрывается под ней */
  subtasks?: Task[]
  /** false — факт считается с подзадачами, но раскрыть состав здесь нельзя («Сегодня») */
  expandable?: boolean
  /** поиск нашёл совпадение внутри состава — показываем его, не дожидаясь нажатия */
  forceExpanded?: boolean
  hideDoneSubtasks?: boolean
  /** у подзадачи вне своего спринта: чья она, иначе «Созвон» непонятно к чему относится */
  parentName?: string
  /**
   * Подзадачи спринта показаны прямо под строкой («Сегодня»): часы идущего учёта — у
   * подзадачи, по которой он идёт, а не дважды.
   */
  subtasksBelow?: boolean
  /** отметка методики приоритизации (квадрант, «A-1»…) — первой в строке под названием */
  badge?: ReactNode
  /** этап в подписи: там, где список не разложен по этапам («Сегодня») */
  showStage?: boolean
  /** свайп вправо — «Готово» (или «Вернуть в работу» у закрытой), не открывая карточку */
  onToggleDone?: () => void
}

/** ширина одной кнопки в «ящике» действий, открываемом свайпом */
const ACTION_WIDTH = 74
const OPEN_THRESHOLD = 56
/** свайп вправо дальше этого — отметка «Готово» */
const DONE_THRESHOLD = 92
/** удержание кольца дольше этого — «Готово» (касание — по-прежнему старт учёта) */
const HOLD_MS = 550
/** сколько играет «Готово» на кольце, прежде чем задача закроется (и, может, уйдёт из списка) */
const FINISH_MS = 620
/** свайп влево дальше «ящика» на столько — удаление целиком, без нажатия кнопки */
const DELETE_PAST = 72
/**
 * …но не дальше этой доли строки: с тремя кнопками «ящик» и запас вместе шире экрана
 * телефона, и одним движением до удаления было не дотянуться (как в Почте на iPhone —
 * длинный свайп через полстроки удаляет)
 */
const DELETE_SHARE = 0.55
/** дальше квадратики сливаются в полосу и перестают считываться поштучно */
const MAX_PIPS = 12

export function TaskListItem({
  task,
  status,
  label = '',
  color = null,
  activeTimer,
  onStartTimer,
  onStopTimer,
  onDuplicate,
  onDelete,
  onUnplan,
  subtasks,
  expandable = true,
  forceExpanded = false,
  hideDoneSubtasks = false,
  parentName,
  subtasksBelow = false,
  badge,
  showStage = false,
  onToggleDone,
}: TaskListItemProps) {
  const runningTaskId = activeTimer?.task_id
  const isRunningSelf = runningTaskId === task.id
  // спринт «идёт», если учёт идёт по нему самому или по любой его подзадаче
  const isRunning = runningWithin(task, subtasks, runningTaskId)
  useTicker(isRunning)

  const hasSubtasks = !!subtasks && subtasks.length > 0
  const [storedOpen, setOpen] = useExpanded(task.id)
  // поле новой подзадачи открыто именно здесь
  const addingHere = useAddingFor() === task.id

  // запустили учёт по подзадаче — спринт раскрывается сам, чтобы было видно, что тикает.
  // Один раз на подзадачу: свёрнутый после этого спринт так и остаётся свёрнутым
  const runningChildId = hasSubtasks && subtasks?.some((c) => c.id === runningTaskId) ? runningTaskId : null
  useEffect(() => {
    if (expandable) autoExpandFor(task.id, runningChildId)
  }, [task.id, runningChildId, expandable])

  /** зажали кольцо: «Готово» доигрывает на строке, потом меняется этап */
  const [finishing, setFinishing] = useState(false)
  const done = !!status?.is_final || finishing
  // первая подзадача открытого спринта — из «ящика» свайпа, а не полосой под каждым спринтом
  // «ящик» есть только там, где строке дали действия (список задач), — туда и кладём
  const addSubtaskAction = expandable && !task.parent_id && !done && (!!onDuplicate || !!onDelete)
  const actionCount = [onUnplan, onDuplicate, onDelete, addSubtaskAction].filter(Boolean).length
  const actionsWidth = actionCount * ACTION_WIDTH
  const swipeable = actionCount > 0 || !!onToggleDone
  const [offset, setOffset] = useState(0)
  /** строка улетает вправо после отметки «Готово» */
  const [flying, setFlying] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const startY = useRef(0)
  const passedDone = useRef(false)
  // флаг жеста живёт в ref, а не в state: touchmove может прийти в том же кадре, что и
  // touchstart, когда состояние ещё не перерисовалось — и жест бы просто не начался
  const draggingRef = useRef(false)
  const [animating, setAnimating] = useState(true)
  const startX = useRef(0)
  const startOffset = useRef(0)
  /** где в этом жесте срабатывает удаление; вне жеста — нигде */
  const [deleteAt, setDeleteAt] = useState(Infinity)
  const axisLocked = useRef<'x' | 'y' | null>(null)

  /*
   * Полоса состава у спринта в списке. У каждого пустого спринта она висела строкой
   * «+ ПОДЗАДАЧА» — в списке из двадцати спринтов это двадцать одинаковых полос. Теперь
   * полоса есть у спринта с подзадачами (это кнопка раскрытия) и у пустого — только пока
   * в него вводят первую подзадачу; начать ввод — свайпом строки, кнопка «Подзадача».
   */
  const showComposition = expandable && !task.parent_id && (hasSubtasks || addingHere)
  // пустой спринт раскрыт, только пока в него вводят первую подзадачу: запомненное
  // раскрытие пустых спринтов и давало «случайные» поля посреди списка
  const open = showComposition && ((hasSubtasks && (storedOpen || forceExpanded)) || addingHere)
  // факт активной задачи растёт на лету — считаем от started_at, а не накоплением тиков
  const live = isRunning && activeTimer ? elapsedHours(activeTimer.started_at) : 0
  const fact = rollupFact(task, subtasks) + live
  const hasPlan = task.planned_hours > 0
  const pct = hasPlan ? (fact / task.planned_hours) * 100 : 0
  const over = pct > 100 && !done
  const overdue = isOverdue(task, status)

  const ringState: RingState = done ? 'done' : over ? 'over' : isRunning ? 'running' : 'idle'
  // отклик кольца — только на смену (старт, стоп, «готово»), не при каждом открытии списка
  const ringKey = done ? 'done' : isRunning ? 'run' : 'idle'
  const [prevRingKey, setPrevRingKey] = useState(ringKey)
  const [ringChanged, setRingChanged] = useState(false)
  if (ringKey !== prevRingKey) {
    setPrevRingKey(ringKey)
    setRingChanged(true)
  }
  // под учётом — мягкая заливка и полоска акцента слева; рамку строки даёт общий список
  // открытая справа задача (десктоп) подсвечена, как выбранная строка в дизайн-системе (9.5)
  const selected = useMatch('/tasks/:id')?.params.id === task.id
  const cardBg = isRunning ? 'var(--timer-bg)' : selected ? 'var(--surface-selected)' : 'var(--surface)'
  // «1,8 / 0 ч» выглядело как ошибка: у задачи без плана нет знаменателя
  const hours = hasPlan ? `${formatHoursRu(fact)} / ${formatHoursRu(task.planned_hours)} ч` : `${formatHoursRu(fact)} ч`
  // справа одна мета (0.57): срок пилюлей, если он горит, иначе часы. Красный — просрочено,
  // жёлтый — сегодня-послезавтра
  const today = todayStr()
  const soon = !done && !!task.end_date && !overdue && task.end_date <= addDays(today, 2)
  const duePill = !done && task.end_date && (overdue || soon) ? formatDueDate(task.end_date, today) : ''
  const meta = [showStage ? status?.label : '', label].filter(Boolean).join(' · ')

  // часы справа: у раскрытого спринта они уже тикают в строке подзадачи — второй раз не нужны
  const showClock = isRunning && !!activeTimer && (isRunningSelf || (!open && !subtasksBelow))

  /*
   * Зажать кольцо — «Готово» (0.60). Касание по-прежнему запускает учёт: удержание
   * начинает наливать кольцо зелёным только через ~120 мс, так что быстрое нажатие ничего
   * лишнего не показывает. Сдвинули палец (свайп, прокрутка) — удержание отменяется.
   */
  const [holding, setHolding] = useState(false)
  const holdTimer = useRef(0)
  const held = useRef(false)
  useEffect(() => () => window.clearTimeout(holdTimer.current), [])
  function holdStart(e: React.PointerEvent) {
    if (!onToggleDone || flying || finishing || (e.pointerType === 'mouse' && e.button !== 0)) return
    held.current = false
    setHolding(true)
    window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => {
      held.current = true
      setHolding(false)
      tap()
      if (status?.is_final) {
        onToggleDone()
        return
      }
      setFinishing(true)
      holdTimer.current = window.setTimeout(() => {
        onToggleDone()
        setFinishing(false)
      }, FINISH_MS)
    }, HOLD_MS)
  }
  function holdEnd() {
    if (!holding) return
    window.clearTimeout(holdTimer.current)
    setHolding(false)
  }

  function onTouchStart(e: React.TouchEvent) {
    if (!swipeable || flying) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    startOffset.current = offset
    // из открытого «ящика» — ещё немного влево, чтобы не удалить случайным касанием
    const width = rowRef.current?.offsetWidth ?? 360
    setDeleteAt(onDelete ? Math.max(Math.min(actionsWidth + DELETE_PAST, width * DELETE_SHARE), -offset + 40) : Infinity)
    axisLocked.current = null
    passedDone.current = false
    draggingRef.current = true
    setAnimating(false)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!swipeable || !draggingRef.current) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    // до первого заметного сдвига не решаем, свайп это или прокрутка списка
    if (axisLocked.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      axisLocked.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    holdEnd()
    if (axisLocked.current === 'y') return
    // с «Удалить» строку можно дотянуть дальше «ящика» — туго, с сопротивлением
    const min = actionCount > 0 ? (onDelete ? -Infinity : -actionsWidth) : 0
    // вправо — только к «Готово», с сопротивлением после порога
    const raw = startOffset.current + dx
    const max = onToggleDone ? Infinity : 0
    const next =
      raw > DONE_THRESHOLD
        ? DONE_THRESHOLD + (raw - DONE_THRESHOLD) * 0.35
        : raw < -actionsWidth
          ? -actionsWidth + (raw + actionsWidth) * 0.55
          : raw
    const clamped = Math.min(max, Math.max(min, next))
    // порог пройден — лёгкий отклик, как у переключателя
    const past = clamped >= DONE_THRESHOLD || clamped <= -deleteAt
    if (past !== passedDone.current) {
      passedDone.current = past
      tap()
    }
    setOffset(clamped)
  }

  function onTouchEnd() {
    if (!swipeable || !draggingRef.current) return
    draggingRef.current = false
    setAnimating(true)
    setDeleteAt(Infinity)
    if (onToggleDone && offset >= DONE_THRESHOLD) {
      // строка уезжает вправо, затем меняется этап; там, где строка остаётся, — возвращается
      setFlying(true)
      setOffset((rowRef.current?.offsetWidth ?? 400) + 24)
      window.setTimeout(() => {
        onToggleDone()
        setFlying(false)
        setAnimating(false)
        setOffset(0)
      }, 240)
      return
    }
    if (onDelete && offset <= -deleteAt) {
      flyOut(-1, onDelete)
      return
    }
    setOffset((current) => (current < -OPEN_THRESHOLD ? -actionsWidth : 0))
  }

  const close = () => setOffset(0)

  /*
   * Меню строки (0.60): удержать строку и отпустить, не сдвигая. В списке с перетаскиванием
   * удержание ловит useDragSort (сдвинули — перетаскивание, нет — меню); там, где его нет
   * («Сегодня»), — своё удержание. Правая кнопка мыши — то же меню.
   */
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuHold = useRef(0)
  const menuPress = useRef<{ x: number; y: number } | null>(null)
  const swallowClick = useRef(false)
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const open = () => setMenuOpen(true)
    root.addEventListener(ROW_MENU_EVENT, open)
    return () => {
      root.removeEventListener(ROW_MENU_EVENT, open)
      window.clearTimeout(menuHold.current)
    }
  }, [])
  function menuDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' || flying) return
    const target = e.target as HTMLElement
    if (target.closest('button, input, textarea, [data-no-drag]')) return
    // перетаскивание здесь включено — удержание обработает оно
    if (rowRef.current?.closest('[data-sort-active]')) return
    menuPress.current = { x: e.clientX, y: e.clientY }
    window.clearTimeout(menuHold.current)
    menuHold.current = window.setTimeout(() => {
      menuPress.current = null
      swallowClick.current = true
      tap(15)
      setMenuOpen(true)
    }, 450)
  }
  function menuMove(e: React.PointerEvent) {
    const p = menuPress.current
    if (p && (Math.abs(e.clientX - p.x) > 8 || Math.abs(e.clientY - p.y) > 8)) menuCancel()
  }
  function menuCancel() {
    menuPress.current = null
    window.clearTimeout(menuHold.current)
  }
  const menuItems: RowMenuItem[] = [
    { label: 'Открыть', onSelect: () => navigate(`/tasks/${task.id}`) },
    isRunning ? { label: 'Остановить учёт', onSelect: onStopTimer } : { label: 'Начать учёт', onSelect: onStartTimer },
    ...(onToggleDone ? [{ label: done ? 'Вернуть в работу' : 'Готово', onSelect: onToggleDone }] : []),
    ...(addSubtaskAction
      ? [
          {
            label: 'Подзадача',
            onSelect: () => {
              setOpen(true)
              startAdding(task.id)
            },
          },
        ]
      : []),
    ...(onUnplan ? [{ label: 'Не сегодня', onSelect: onUnplan }] : []),
    ...(onDuplicate ? [{ label: 'Дублировать', onSelect: onDuplicate }] : []),
    ...(onDelete ? [{ label: 'Удалить', danger: true, onSelect: () => flyOut(-1, onDelete) }] : []),
  ]

  /*
   * Строка улетает за край, её место схлопывается, и только потом действие (0.60): нижние
   * строки подтягиваются плавно, а не прыжком, когда задача пропадёт из списка.
   */
  const rootRef = useRef<HTMLDivElement>(null)
  // только что созданная задача: раздвигает место, проявляется и подсвечивается (0.60)
  const [isNew] = useState(() => isFresh(task.id))
  useLayoutEffect(() => {
    const box = rootRef.current
    if (!isNew || !box || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    box.style.overflow = 'hidden'
    const anim = box.animate([{ height: '0px' }, { height: `${box.offsetHeight}px` }], {
      duration: 300,
      easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      delay: 120,
      fill: 'backwards',
    })
    anim.finished.then(
      () => (box.style.overflow = ''),
      () => {},
    )
    return () => anim.cancel()
  }, [isNew])
  function flyOut(dir: 1 | -1, then: () => void) {
    setAnimating(true)
    setFlying(true)
    setOffset(dir * ((rowRef.current?.offsetWidth ?? 400) + 24))
    window.setTimeout(() => {
      const box = rootRef.current
      if (!box || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        then()
        return
      }
      box.style.overflow = 'hidden'
      const anim = box.animate([{ height: `${box.offsetHeight}px` }, { height: '0px' }], {
        duration: 220,
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        fill: 'forwards',
      })
      // анимация в фоне (свернули приложение) не идёт и не заканчивается — не ждём её вечно
      let ran = false
      const once = () => {
        if (ran) return
        ran = true
        then()
      }
      anim.finished.then(once, once)
      window.setTimeout(once, 400)
    }, 220)
  }
  const swipeButton = 'flex-1 text-sm font-medium'

  return (
    <div ref={rootRef} className={`flex flex-col ${isNew ? 'row-new' : ''}`}>
      <div className="relative overflow-hidden" ref={rowRef}>
        {onToggleDone && (
          <div
            className={`absolute inset-0 flex items-center gap-2 pl-5 text-sm font-medium ${
              done ? 'bg-surface-sunken text-text' : 'bg-success-soft text-success-text'
            }`}
            aria-hidden
          >
            <span
              className="done-check flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-current"
              data-armed={offset >= DONE_THRESHOLD || undefined}
            >
              <Check size={14} />
            </span>
            <span className="whitespace-nowrap">{done ? 'Вернуть в работу' : 'Готово'}</span>
          </div>
        )}
        {actionCount > 0 && (
          <div className="absolute inset-y-0 right-0 flex" style={{ width: Math.max(actionsWidth, -offset) }}>
            {addSubtaskAction && (
              <button
                type="button"
                onClick={() => {
                  close()
                  setOpen(true)
                  startAdding(task.id)
                }}
                className={`${swipeButton} bg-accent-soft text-accent-text`}
              >
                Подзадача
              </button>
            )}
            {onUnplan && (
              <button
                type="button"
                onClick={() => {
                  close()
                  onUnplan()
                }}
                className={`${swipeButton} bg-accent-soft text-accent-text`}
              >
                Не сегодня
              </button>
            )}
            {onDuplicate && (
              <button
                type="button"
                onClick={() => {
                  close()
                  onDuplicate()
                }}
                className={`${swipeButton} bg-surface-sunken text-text`}
              >
                Дублировать
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={() => flyOut(-1, onDelete)}
                data-armed={offset <= -deleteAt || undefined}
                className={`swipe-delete ${swipeButton} bg-danger-soft text-danger-text`}
              >
                Удалить
              </button>
            )}
          </div>
        )}

        <div
          className="task-row relative flex min-h-[var(--row-task)] flex-col justify-center px-3 py-2.5"
          data-quiet={isRunning || selected ? undefined : ''}
          style={{
            // фон через переменную: при наведении её меняет index.css, и центр кольца следом
            // (у обычной строки переменная задана в index.css — инлайн её бы не перебить)
            ['--row-bg' as string]: isRunning || selected ? cardBg : undefined,
            background: 'var(--row-bg)',
            boxShadow: isRunning || selected ? 'inset 2px 0 0 var(--accent)' : undefined,
            transform: `translateX(${offset}px)`,
            transition: animating ? 'transform var(--duration-base) var(--ease-out)' : 'none',
          }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onPointerDown={menuDown}
          onPointerMove={menuMove}
          onPointerUp={menuCancel}
          onPointerCancel={menuCancel}
          onContextMenu={(e) => {
            if ((e.target as HTMLElement).closest('input, textarea')) return
            e.preventDefault()
            // долгое касание пальцем (Android) тоже присылает contextmenu — его ведёт удержание
            const kind = (e.nativeEvent as PointerEvent).pointerType
            if (kind && kind !== 'mouse') return
            menuCancel()
            setMenuOpen(true)
          }}
        >
          <div className="flex items-center gap-3">
            <span
              key={ringKey}
              data-no-drag
              data-tip={onToggleDone ? 'timer ring-done' : 'timer'}
              data-holding={holding || undefined}
              className={`ring-hold relative shrink-0 rounded-full ${ringChanged ? `ring-pop ring-to-${ringKey}` : ''}`}
              onPointerDown={holdStart}
              onPointerUp={holdEnd}
              onPointerCancel={holdEnd}
              onPointerLeave={holdEnd}
              onContextMenu={(e) => onToggleDone && e.preventDefault()}
            >
            <Ring
              size={32}
              pct={done ? 100 : pct}
              state={ringState}
              // под учётом центр заливается терракотой — видно издалека, что идёт (0.60)
              centerBg={isRunning && !done ? 'var(--accent)' : 'var(--row-bg)'}
              onClick={() => {
                // удержание уже отметило «Готово» — отпускание пальца не должно ещё и запускать учёт
                if (held.current) {
                  held.current = false
                  return
                }
                if (finishing) return
                tap()
                // идёт подзадача — кольцо спринта её останавливает; иначе учёт идёт в сам спринт
                if (isRunning) onStopTimer()
                else onStartTimer()
              }}
              // с названием: на экране десять одинаковых «Начать учёт» диктору не различить
              ariaLabel={`${isRunning ? 'Остановить учёт' : 'Начать учёт'}: ${task.name}`}
            >
              {done ? <Check size={14} className="text-success" /> : isRunning ? <StopGlyph color="var(--on-accent)" /> : <PlayGlyph />}
            </Ring>
            {onToggleDone && <span className="ring-charge" aria-hidden />}
            {ringChanged && ringKey === 'done' && (
              <span className="ring-sparks" aria-hidden>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <i key={i} style={{ ['--a' as string]: `${i * 60 + 30}deg` }} />
                ))}
              </span>
            )}
            </span>

            <Link
              to={`/tasks/${task.id}`}
              className="min-w-0 flex-1"
              // открытый «ящик» действий: первый тап должен закрывать его, а не уводить в карточку
              onClick={(e) => {
                // удержание открыло меню — отпускание пальца не открывает ещё и карточку
                if (swallowClick.current) {
                  swallowClick.current = false
                  e.preventDefault()
                  return
                }
                if (offset !== 0) {
                  e.preventDefault()
                  close()
                }
              }}
            >
              {parentName && (
                <span className="flex min-w-0 items-center gap-1 text-xs leading-[1.4] text-text-secondary">
                  <CornerDownRight size={11} />
                  <span className="truncate">{parentName}</span>
                </span>
              )}
              {/* две строки вместо одной: чип справа оставлял имени мало места,
                  и половина названий обрывалась на середине прямо на главном экране */}
              <p
                title={task.name}
                className={`text-base leading-[1.35] ${
                  done ? 'font-normal text-text-secondary' : 'font-medium text-text'
                }`}
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {/* зачёркивание — линией-фоном: так оно прочерчивается слева направо (0.60) */}
                <span className={done ? `strike ${ringChanged && ringKey === 'done' ? 'strike-in' : ''}` : undefined}>{task.name}</span>
              </p>
              {/* подпись серым: идущий учёт — терракотой с часами, иначе отметка методики,
                  этап (где нужен) и группы с цветной точкой */}
              {showClock && activeTimer ? (
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm leading-[1.35] font-medium text-accent-text">
                  идёт учёт ·<span className="tabular font-mono text-xs">{formatClock(activeTimer.started_at)}</span>
                </span>
              ) : (
                (meta || badge) && (
                  <span
                    title={meta}
                    className="mt-0.5 flex min-w-0 items-center gap-1.5 text-sm leading-[1.35] whitespace-nowrap text-text-secondary"
                  >
                    {badge}
                    {label && <ClientDot color={color} />}
                    <span className="min-w-0 truncate">{meta}</span>
                  </span>
                )
              )}
            </Link>

            {duePill ? (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  overdue ? 'bg-danger-soft text-danger-text' : 'bg-warning-soft text-warning-text'
                }`}
                aria-label={overdue ? `Просрочено: ${duePill}` : `Срок: ${duePill}`}
              >
                {duePill}
              </span>
            ) : (
              <span className={`tabular shrink-0 font-mono text-xs ${over ? 'text-danger-text' : 'text-text-secondary'}`}>{hours}</span>
            )}
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
                if (!hasSubtasks) {
                  // у пустого спринта полоса — это сразу «добавить подзадачу»
                  if (addingHere) stopAdding(task.id)
                  else startAdding(task.id)
                  return
                }
                if (open) stopAdding(task.id)
                setOpen(!open)
              }}
            />
          )}
        </div>
      </div>

      {menuOpen && <RowMenu anchor={rowRef.current} items={menuItems} onClose={() => setMenuOpen(false)} />}

      <Collapse open={open}>
        <div className="bg-surface px-3">
          <SubtaskList
            id={`subtasks-${task.id}`}
            parent={task}
            subtasks={subtasks ?? []}
            hideDone={hideDoneSubtasks}
            nested
          />
        </div>
      </Collapse>
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
        className={`-mb-2.5 mt-2 ml-11 flex h-10 items-center gap-2 border-t border-divider text-left ${
          open ? 'text-text' : 'text-text-secondary'
        }`}
      >
        <Plus size={14} />
        <span className="text-sm font-medium">Подзадача</span>
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
      className={`-mb-2.5 mt-2 ml-11 flex h-10 items-center gap-2.5 border-t border-divider text-left ${
        open ? 'text-text' : 'text-text-secondary'
      }`}
    >
      {subtasks.length <= MAX_PIPS && (
        <span className="flex gap-[3px]" aria-hidden="true">
          {subtasks.map((c) => (
            <span
              key={c.id}
              className="h-[5px] w-[5px] rounded-[1.5px]"
              style={{
                background: isDone(c)
                  ? 'var(--success)'
                  : c.id === runningTaskId
                    ? 'var(--accent)'
                    : 'var(--border-strong)',
              }}
            />
          ))}
        </span>
      )}
      <span className="text-sm font-medium">Подзадачи</span>
      <span className="tabular font-mono text-xs">
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
