import { useEffect, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode, type Ref, type RefObject } from 'react'
import type { StageTone } from '../lib/stage'
import type { LabelColor } from '../lib/types'
import { Close } from './Icon'

/**
 * Знак Semternity: незамкнутое кольцо с одной точкой в разрыве.
 * Раньше кольцо было сплошным, а точка лежала на ободе и слипалась с ним в нашлёпку —
 * рисуем дугой с разрывом, чтобы читался замысел, а не дефект.
 */
export function Logo({ size = 22, color = 'var(--accent)' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className="shrink-0"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M11.4 7.9a9 9 0 1 0 9.2 0"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="4.1" stroke={color} strokeWidth={0.8} opacity={0.45} />
      <circle cx="16" cy="7" r="1.8" fill={color} />
    </svg>
  )
}

/**
 * Заголовок группы. Раньше — моноширинный капс с разрядкой в 11 px: кириллица капсом
 * в таком кегле теряет силуэт слов. По дизайн-системе — обычный регистр, 13 px, 500.
 */
export function Overline({ children, className = '' }: { children: ReactNode; className?: string }) {
  // свой цвет (например «Просрочено» малиновым) заменяет вторичный, а не спорит с ним в CSS
  const color = /\btext-(text|danger|accent|success|warning|info)/.test(className) ? '' : 'text-text-secondary'
  return <span className={`text-sm font-medium ${color} ${className}`}>{children}</span>
}

/** Подпись над полем — тем же голосом, что и заголовок группы. */
export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  // с htmlFor — настоящая подпись поля: диктор читает её вместе с полем, нажатие ставит фокус
  return htmlFor ? (
    <label htmlFor={htmlFor} className="text-sm font-medium text-text-secondary">
      {children}
    </label>
  ) : (
    <span className="text-sm font-medium text-text-secondary">{children}</span>
  )
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'md' | 'lg'

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active',
  secondary:
    'border border-border bg-surface text-text hover:border-border-strong hover:bg-surface-hover active:bg-surface-sunken',
  ghost: 'text-text-secondary hover:bg-surface-sunken hover:text-text active:bg-surface-sunken',
  danger: 'bg-danger text-text-inverse hover:brightness-95 active:brightness-90',
}

/** md — высота касания (44 на телефоне, 32 на широком экране), lg — подвал листа. */
const BUTTON_SIZE: Record<ButtonSize, string> = {
  md: 'h-[var(--tap)] px-3 text-base',
  lg: 'h-12 px-4 text-base',
}

/**
 * Кнопка дизайн-системы. Главная (primary) на экране одна, остальные — secondary или ghost.
 * Отключённая — полупрозрачная, а не серая: так видно, какая это кнопка и что её ждёт.
 * loading — спиннер вместо содержимого, ширина не меняется.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  className = '',
  children,
  type = 'button',
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
}) {
  // свой цвет текста (например «Перенести» малиновым) заменяет цвет варианта, а не спорит
  // с ним в CSS: какой из двух классов победит, зависело бы от порядка в таблице стилей
  const ownColor = /\btext-(text|danger|accent|success|warning|on-accent)/.test(className)
  const variantClass = ownColor
    ? BUTTON_VARIANT[variant].replace(/(^|\s)(hover:)?text-[a-z-]+/g, '')
    : BUTTON_VARIANT[variant]
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`relative inline-flex items-center justify-center gap-1.5 rounded-sm font-medium disabled:opacity-50 ${BUTTON_SIZE[size]} ${variantClass} ${className}`}
      {...rest}
    >
      <span className={`inline-flex items-center gap-1.5 ${loading ? 'invisible' : ''}`}>{children}</span>
      {loading && (
        <span
          className="absolute h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      )}
    </button>
  )
}

interface ChipProps {
  active?: boolean
  onClick?: () => void
  children: ReactNode
  className?: string
}

/**
 * Чип фильтра. Выбранный — мягкая заливка, а не акцент: акцентом в приложении горит
 * только идущий учёт и одна главная кнопка экрана.
 */
export function Chip({ active = false, onClick, children, className = '' }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium ${
        active
          ? 'border-[var(--selected-border)] bg-surface-selected text-accent-text'
          : 'border-border bg-surface text-text-secondary hover:border-border-strong active:bg-surface-sunken'
      } ${className}`}
    >
      {children}
    </button>
  )
}

/**
 * Сегментированный переключатель для взаимоисключающего выбора. Отдельный вид от чипов:
 * чипы — множественный фильтр. Дорожка утоплена, выбранный сегмент приподнят поверхностью.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = '',
  stretch = false,
  tip,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  className?: string
  /** вкладки на всю ширину: каждая — равная доля, крупная цель для пальца */
  stretch?: boolean
  /** якорь подсказки 0.43 (data-tip) */
  tip?: string
}) {
  return (
    <div
      className={`flex shrink-0 gap-0.5 rounded-md bg-surface-sunken p-0.5 ${stretch ? 'w-full' : ''} ${className}`}
      role="tablist"
      data-tip={tip}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`min-h-10 rounded-sm px-2.5 text-sm ${stretch ? 'flex-1' : ''} ${
              active
                ? 'bg-surface font-medium text-text shadow-sm ring-1 ring-border'
                : 'text-text-secondary hover:text-text'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Фокус в окне: при открытии — внутрь (если поле само не забрало его через autoFocus),
 * Tab ходит по кругу внутри, при закрытии фокус возвращается на кнопку, которая окно
 * открыла. Возвращает обработчик клавиш для самого окна — у вложенных окон он
 * срабатывает первым и дальше событие не пускает.
 */
function useDialogFocus(ref: RefObject<HTMLElement | null>, open: boolean) {
  useEffect(() => {
    if (!open) return
    const trigger = document.activeElement as HTMLElement | null
    const el = ref.current
    if (el && !el.contains(document.activeElement)) el.focus()
    return () => trigger?.focus?.()
  }, [open, ref])

  return (e: KeyboardEvent<HTMLElement>) => {
    if (e.key !== 'Tab' || !ref.current) return
    e.stopPropagation()
    const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
}

/**
 * Лист снизу на телефоне, окно по центру на широком экране — один каркас на все диалоги.
 * Закрытие: Esc, подложка, кнопка в шапке (headerAction) или в подвале.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  headerAction,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** справа от заголовка — например «Отмена» */
  headerAction?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onDialogKey = useDialogFocus(ref, open)
  /*
   * Закрытие с анимацией (0.57): лист уезжает вниз, подложка гаснет — и только потом
   * окно убирается из разметки. Раньше оно пропадало мгновенно.
   */
  const [present, setPresent] = useState(open)
  const [closing, setClosing] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setPresent(true)
      setClosing(false)
    } else if (present) setClosing(true)
  }
  useEffect(() => {
    if (!closing) return
    const t = window.setTimeout(() => {
      setPresent(false)
      setClosing(false)
    }, 220)
    return () => window.clearTimeout(t)
  }, [closing])

  // лист можно смахнуть вниз за «ручку» и шапку — как в iOS
  const [drag, setDrag] = useState(0)
  const dragStart = useRef<number | null>(null)
  const onDragStart = (e: React.TouchEvent) => {
    dragStart.current = e.touches[0].clientY
  }
  const onDragMove = (e: React.TouchEvent) => {
    if (dragStart.current === null) return
    setDrag(Math.max(0, e.touches[0].clientY - dragStart.current))
  }
  const onDragEnd = () => {
    if (dragStart.current === null) return
    dragStart.current = null
    if (drag > 90) onClose()
    setDrag(0)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!present) return null

  return (
    <div
      className="overlay-in fixed inset-0 z-[var(--z-modal)] flex items-end bg-overlay lg:items-center lg:justify-center"
      data-closing={closing || undefined}
      onClick={onClose}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onDialogKey}
        data-closing={closing || undefined}
        className="sheet-in safe-bottom flex max-h-[92dvh] w-full flex-col gap-3.5 overflow-y-auto rounded-t-lg bg-surface px-5 pt-3 pb-6 shadow-modal outline-none lg:max-h-[85vh] lg:max-w-120 lg:rounded-lg lg:p-6"
        style={drag ? { transform: `translateY(${drag}px)`, transition: 'none' } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="-mx-5 -mt-3 flex flex-col gap-3.5 px-5 pt-3 lg:contents" onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}>
          <span className="mx-auto h-1 w-9 shrink-0 rounded-full bg-border-strong lg:hidden" aria-hidden />
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold tracking-[-0.01em] text-text">{title}</h3>
            {headerAction ?? (
              // на десктопе окно закрывают и крестиком (дизайн-система 9.8); на телефоне — свайп/подложка
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 hidden h-8 w-8 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text lg:flex"
                aria-label="Закрыть"
              >
                <Close size={16} />
              </button>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

/** Пара кнопок в подвале листа: отмена слева, главное действие справа и шире. */
export function SheetActions({
  onCancel,
  onConfirm,
  confirmLabel,
  confirmDisabled = false,
  cancelLabel = 'Отмена',
  danger = false,
}: {
  onCancel: () => void
  onConfirm: () => void
  confirmLabel: string
  confirmDisabled?: boolean
  cancelLabel?: string
  /** деструктивное подтверждение — кнопка danger вместо главной */
  danger?: boolean
}) {
  return (
    <div className="mt-1 flex gap-2">
      <Button size="lg" className="flex-1" onClick={onCancel}>
        {cancelLabel}
      </Button>
      <Button
        size="lg"
        variant={danger ? 'danger' : 'primary'}
        className="flex-[2]"
        onClick={onConfirm}
        disabled={confirmDisabled}
      >
        {confirmLabel}
      </Button>
    </div>
  )
}

export type TagTone = 'neutral' | 'accent' | 'success' | 'danger'

const TAG_TONE: Record<TagTone, string> = {
  neutral: 'bg-surface-sunken text-text-secondary',
  accent: 'bg-accent-soft text-accent-text',
  success: 'bg-success-soft text-success-text',
  danger: 'bg-danger-soft text-danger-text',
}

/** Тег-чип: 22 px, круглый. Цвет — только у смысловых тонов, пользовательские статусы нейтральны. */
export function Tag({ tone = 'neutral', children }: { tone?: TagTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap ${TAG_TONE[tone]}`}
    >
      {children}
    </span>
  )
}

const STAGE_CLASS: Record<StageTone | 'none', string> = {
  todo: 'bg-status-todo-bg text-status-todo-text',
  progress: 'bg-status-progress-bg text-status-progress-text',
  done: 'bg-status-done-bg text-status-done-text',
  none: 'bg-status-backlog-bg text-status-backlog-text',
}

/**
 * Чип этапа: точка и название, цвет — по тону этапа (палитра статусов, а не акцент).
 * Без этапа — серый «Без этапа»: чип стоит у каждой строки, а не через одну.
 */
export function StageChip({ tone, label }: { tone: StageTone | null; label?: string }) {
  return (
    <span
      className={`inline-flex h-[22px] max-w-[132px] shrink-0 items-center gap-1.5 rounded-full px-2 text-xs font-medium ${STAGE_CLASS[tone ?? 'none']}`}
    >
      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-current opacity-80" aria-hidden />
      <span className="truncate">{tone ? label : 'Без этапа'}</span>
    </span>
  )
}

/** Цветная точка клиента (значения группы) — 8 px, цвет из меток дизайн-системы. */
export function ClientDot({ color, size = 8 }: { color: LabelColor | null | undefined; size?: number }) {
  if (!color) return null
  return (
    <span
      className="shrink-0 rounded-full"
      style={{ width: size, height: size, background: `var(--${color})` }}
      aria-hidden
    />
  )
}

/**
 * Сгруппированный список: строки внутри общей подложки с разделителями, без рамки у каждой
 * строки. Раньше каждая задача была отдельной карточкой — на экран влезало на две-три меньше.
 */
export function ListGroup({
  children,
  className = '',
  clip = true,
  ref,
}: {
  children: ReactNode
  className?: string
  /** обрезать по скруглению (нужно свайпу строк); без обрезки — для списков с выпадающим календарём */
  clip?: boolean
  /** контейнер строк — для перетаскивания (useDragSort) */
  ref?: Ref<HTMLDivElement>
}) {
  return (
    <div
      ref={ref}
      className={`flex flex-col divide-y divide-divider rounded-md border border-border bg-surface ${clip ? 'overflow-hidden' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

/** Карточка-контейнер: рамка без тени — тени в системе только у всплывающих слоёв. */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-border bg-surface ${className}`}>{children}</div>
}

/** Переключатель-пилюля (например «скрыть готовые»). Нажимается вся строка с подписью. */
export function Switch({
  on,
  onChange,
  label,
  ariaLabel,
}: {
  on: boolean
  onChange: (v: boolean) => void
  label?: string
  /** имя для экранного диктора, когда видимая подпись стоит отдельно */
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      onClick={() => onChange(!on)}
      className="flex min-h-11 shrink-0 items-center gap-2"
      aria-checked={on}
      aria-label={ariaLabel}
    >
      <span
        className={`flex h-5 w-[34px] items-center rounded-full p-0.5 transition-colors ${
          on ? 'justify-end bg-accent' : 'justify-start bg-border-strong'
        }`}
      >
        <span className="h-4 w-4 rounded-full bg-surface shadow-sm" />
      </span>
      {label && <span className="text-left text-sm whitespace-nowrap text-text-secondary">{label}</span>}
    </button>
  )
}

/**
 * Поле ввода: высота касания, шрифт 16 px на телефоне (иначе iOS приближает страницу),
 * рамка темнеет при наведении, при фокусе — акцент и кольцо фокуса.
 */
export const fieldClass =
  'h-[var(--tap)] w-full rounded-sm border border-border bg-surface px-2.5 text-[length:var(--input-size)] text-text placeholder:text-text-tertiary hover:border-border-strong focus:border-accent focus:outline-none'

/** Заглушка-плейсхолдер на время первой загрузки — вместо пустого экрана. */
export function Skeleton({ className = '', rounded = 'var(--radius-md)' }: { className?: string; rounded?: string }) {
  return <span className={`skeleton block bg-surface-sunken ${className}`} style={{ borderRadius: rounded }} aria-hidden />
}

/** Строка-заглушка под карточку задачи (кольцо + две строки текста). */
export function TaskRowSkeleton() {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5">
      <Skeleton className="h-8 w-8 shrink-0" rounded="999px" />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <Skeleton className="h-[13px] w-3/5" rounded="var(--radius-xs)" />
        <Skeleton className="h-[10px] w-2/5" rounded="var(--radius-xs)" />
      </span>
    </div>
  )
}

/**
 * Пустое состояние — приглашение к действию: знак-кольцо, заголовок, пояснение и одна
 * кнопка. Без заголовка и кнопки — просто тихая подпись, как раньше.
 */
export function EmptyState({
  children,
  title,
  action,
}: {
  children?: ReactNode
  title?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2.5 py-8 text-center">
      <span className="relative block h-8 w-8 rounded-full border-[1.5px] border-dashed border-text-tertiary">
        <span className="absolute -top-[3px] left-1/2 -ml-[3px] h-1.5 w-1.5 rounded-full bg-text-tertiary" />
      </span>
      {title && <p className="text-md font-semibold text-text">{title}</p>}
      {children && <p className="max-w-[280px] text-sm leading-[1.5] text-text-secondary">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

/** Клавиша в подсказке: «⌘K», «C». По дизайн-системе (9.11) — mono xs на sunken с рамкой. */
export function Kbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`inline-flex min-w-5 items-center justify-center rounded-xs border border-border bg-surface-sunken px-1 font-mono text-xs leading-4 font-normal text-text-secondary ${className}`}
    >
      {children}
    </kbd>
  )
}

/** ⌘ на маке, Ctrl — на остальных: подпись к сочетаниям */
export const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

/** сколько длится схлопывание — потом содержимое снимается с разметки */
const COLLAPSE_MS = 260

/**
 * Раскрытие и схлопывание по высоте (0.59), как секции в Asana: строки ниже плавно
 * подтягиваются, а не прыгают. Закрытое содержимое не держится в разметке — снимается,
 * когда доиграло схлопывание. Первое появление на экране без анимации.
 */
export function Collapse({ open, children, className = '' }: { open: boolean; children: ReactNode; className?: string }) {
  const [shown, setShown] = useState(open)
  const [phase, setPhase] = useState<'static' | 'opening' | 'closing'>('static')
  if (open && (!shown || phase === 'closing')) {
    setShown(true)
    setPhase('opening')
  } else if (!open && shown && phase !== 'closing') {
    setPhase('closing')
  }
  useEffect(() => {
    if (phase !== 'closing') return
    const t = window.setTimeout(() => {
      setShown(false)
      setPhase('static')
    }, COLLAPSE_MS)
    return () => window.clearTimeout(t)
  }, [phase])

  if (!shown) return null
  return (
    <div
      className={`collapse-box ${className}`}
      data-phase={phase === 'static' ? undefined : phase}
      onAnimationEnd={(e) => e.target === e.currentTarget && phase === 'opening' && setPhase('static')}
    >
      <div className="collapse-inner">{children}</div>
    </div>
  )
}
