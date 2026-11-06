import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../lib/device'
import { Check } from './Icon'

/**
 * Всплывающие окна компьютера (0.61). На телефоне выбор открывается шторкой снизу, на
 * компьютере раньше — окном по центру с затемнением: шесть затемнений, чтобы поменять этап
 * трём задачам. Теперь выбор всплывает у самой кнопки, как в Asana; экран не гаснет.
 */

/** мышь и широкий экран: только тут окна всплывают у кнопки */
export const POPOVER_QUERY = '(min-width: 1024px) and (hover: hover) and (pointer: fine)'

export function usePopoverMode(): boolean {
  return useMediaQuery(POPOVER_QUERY)
}

/*
 * Кто открыл окно. Кнопки открывают шторки через состояние, а не передают себя — поэтому
 * запоминаем последнее нажатие на странице: это и есть кнопка, у которой окну всплыть.
 * С клавиатуры кнопку нажимают в фокусе — тогда якорь — элемент в фокусе.
 */
let lastPress: HTMLElement | null = null
let lastPressAt = 0
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('button, a, [role="button"], [role="combobox"], label')
      lastPress = el ?? null
      lastPressAt = Date.now()
    },
    true,
  )
}

/** кнопка, которая только что открыла окно: нажатая мышью или в фокусе */
export function pressedAnchor(): HTMLElement | null {
  if (lastPress?.isConnected && Date.now() - lastPressAt < 1500) return lastPress
  const active = document.activeElement as HTMLElement | null
  return active && active !== document.body ? active : null
}

export type PopoverAnchor = HTMLElement | { x: number; y: number }

interface Placement {
  top: number
  left: number
  maxHeight: number
  width: number
  origin: string
}

const GAP = 6
const EDGE = 12

function place(anchor: PopoverAnchor, box: HTMLElement, minWidth: number, maxWidth: number): Placement {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const r =
    anchor instanceof HTMLElement
      ? anchor.getBoundingClientRect()
      : { top: anchor.y, bottom: anchor.y, left: anchor.x, right: anchor.x, width: 0 }
  const width = Math.min(maxWidth, Math.max(minWidth, anchor instanceof HTMLElement ? r.width : 0), vw - EDGE * 2)
  const natural = box.scrollHeight
  const below = vh - r.bottom - GAP - EDGE
  const above = r.top - GAP - EDGE
  const down = natural <= below || below >= above
  const maxHeight = Math.max(160, down ? below : above)
  const height = Math.min(natural, maxHeight)
  const top = down ? r.bottom + GAP : r.top - GAP - height
  // к левому краю кнопки; не влезает справа — к правому краю
  let left = r.left
  if (left + width > vw - EDGE) left = Math.max(EDGE, r.right - width)
  left = Math.min(Math.max(EDGE, left), vw - EDGE - width)
  return { top, left, maxHeight, width, origin: `${down ? 'top' : 'bottom'} ${left < r.left ? 'right' : 'left'}` }
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null)
}

/**
 * Окно у кнопки или у курсора. Закрывается Esc, нажатием мимо и по Tab за край. Стрелки
 * ходят по кнопкам внутри — у списков выбора это и есть навигация меню. Фокус при
 * открытии — на выбранный пункт или первый, при закрытии — обратно на кнопку.
 */
export function Popover({
  anchor,
  onClose,
  label,
  children,
  minWidth = 240,
  maxWidth = 400,
  role = 'dialog',
  className = '',
}: {
  anchor: PopoverAnchor
  onClose: () => void
  label: string
  children: ReactNode
  minWidth?: number
  maxWidth?: number
  role?: 'dialog' | 'menu'
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<Placement | null>(null)
  const closeRef = useRef(onClose)
  useLayoutEffect(() => {
    closeRef.current = onClose
  })

  // место считаем после первой отрисовки — нужна высота содержимого; и заново при смене размеров
  useLayoutEffect(() => {
    const box = ref.current
    if (!box) return
    const update = () => setPos(place(anchor, box, minWidth, maxWidth))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(box)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [anchor, minWidth, maxWidth])

  // фокус внутрь — когда окно уже на месте: пока оно скрыто, браузер фокус не даёт
  const placed = pos !== null
  const focused = useRef(false)
  useEffect(() => {
    const box = ref.current
    if (!box || !placed || focused.current) return
    focused.current = true
    if (box.contains(document.activeElement)) return
    const items = focusables(box)
    const autofocus = box.querySelector<HTMLElement>('[autofocus], [data-autofocus]')
    const selected = items.find((n) => n.matches('[aria-checked="true"], [aria-selected="true"], [aria-pressed="true"], [data-selected]'))
    ;(autofocus ?? selected ?? items[0] ?? box).focus({ preventScroll: true })
  }, [placed])

  // фокус обратно на кнопку при закрытии; нажатие мимо закрывает
  useEffect(() => {
    const box = ref.current
    if (!box) return
    const trigger = anchor instanceof HTMLElement ? anchor : (document.activeElement as HTMLElement | null)
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (box.contains(t)) return
      // нажатие в другом окне поверх (подтверждение, выбор даты) — не наше
      if ((t as HTMLElement).closest?.('[role="dialog"], [role="menu"], [role="listbox"], [data-popover-keep]')) return
      // нажали на ту же кнопку — закрываем и гасим её клик, иначе окно тут же откроется снова
      if (anchor instanceof HTMLElement && anchor.contains(t)) {
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation()
          ev.preventDefault()
        }
        anchor.addEventListener('click', swallow, { capture: true, once: true })
        window.setTimeout(() => anchor.removeEventListener('click', swallow, { capture: true }), 600)
      }
      closeRef.current()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [anchor])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const box = ref.current
    if (!box) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      closeRef.current()
      return
    }
    const typing = (e.target as HTMLElement).matches('input, textarea, select, [contenteditable="true"]')
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || ((e.key === 'Home' || e.key === 'End') && !typing)) {
      if (typing && (e.target as HTMLElement).matches('textarea')) return
      const items = focusables(box).filter((n) => !n.matches('input, textarea, select'))
      if (!items.length) return
      e.preventDefault()
      e.stopPropagation()
      const i = items.indexOf(document.activeElement as HTMLElement)
      const next =
        e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
      items[next].focus()
      return
    }
    if (e.key === 'Tab') {
      // Tab за последний элемент — закрыть и вернуться к кнопке, как у меню в Asana
      const items = focusables(box)
      const edge = e.shiftKey ? items[0] : items[items.length - 1]
      if (!items.length || document.activeElement === edge) {
        e.preventDefault()
        closeRef.current()
      }
    }
    // одиночные клавиши приложения (C, S, J…) внутри окна не срабатывают
    e.stopPropagation()
  }

  return createPortal(
    <div
      ref={ref}
      role={role}
      aria-label={label}
      aria-modal={role === 'dialog' ? false : undefined}
      tabIndex={-1}
      data-popover
      onKeyDown={onKeyDown}
      className={`popover-in sc fixed z-[var(--z-dropdown)] flex flex-col overflow-y-auto rounded-md border border-border bg-surface shadow-popover outline-none ${className}`}
      style={
        pos
          ? { top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight, transformOrigin: pos.origin }
          : { top: 0, left: 0, width: minWidth, visibility: 'hidden' }
      }
    >
      {children}
    </div>,
    document.body,
  )
}

export interface MenuItem {
  label: string
  onSelect: () => void
  /** клавиша справа — только та, что работает в этом месте */
  hint?: string
  icon?: ReactNode
  danger?: boolean
  checked?: boolean
  /** черта перед пунктом */
  separated?: boolean
  disabled?: boolean
}

/**
 * Меню у кнопки или у курсора (правый клик). Стрелки, Home/End, Enter, первая буква —
 * к пункту на эту букву. Выбор закрывает меню, потом выполняет действие.
 */
export function Menu({
  anchor,
  items,
  onClose,
  label,
  minWidth = 220,
}: {
  anchor: PopoverAnchor
  items: MenuItem[]
  onClose: () => void
  label: string
  minWidth?: number
}) {
  const typeahead = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return
    const box = e.currentTarget
    const buttons = [...box.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])')]
    const letter = e.key.toLowerCase()
    const start = buttons.indexOf(document.activeElement as HTMLElement) + 1
    const order = [...buttons.slice(start), ...buttons.slice(0, start)]
    order.find((b) => b.textContent?.trim().toLowerCase().startsWith(letter))?.focus()
  }

  return (
    <Popover anchor={anchor} onClose={onClose} label={label} role="menu" minWidth={minWidth} maxWidth={320} className="py-1">
      <div className="flex flex-col" onKeyDown={typeahead}>
        {items.map((item) => (
          <div key={item.label} className="flex flex-col">
            {item.separated && <span className="mx-2 my-1 h-px bg-divider" aria-hidden />}
            <button
              type="button"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={item.checked}
              disabled={item.disabled}
              onClick={() => {
                onClose()
                item.onSelect()
              }}
              className={`mx-1 flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-left text-sm outline-none hover:bg-surface-hover focus-visible:bg-surface-selected disabled:opacity-50 ${
                item.danger ? 'text-danger-text' : 'text-text'
              }`}
            >
              {item.icon !== undefined && <span className="flex w-4 shrink-0 justify-center text-text-secondary">{item.icon}</span>}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.checked && <Check size={14} className="text-accent" />}
              {item.hint && <kbd className="font-mono text-xs text-text-tertiary">{item.hint}</kbd>}
            </button>
          </div>
        ))}
      </div>
    </Popover>
  )
}
