import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Menu, usePopoverMode } from './Popover'

export interface RowMenuItem {
  label: string
  onSelect: () => void
  danger?: boolean
  /** клавиша справа — в меню у курсора на компьютере (0.63) */
  hint?: string
}

const MENU_W = 232
const ITEM_H = 44
/** сколько гаснет меню после выбора, прежде чем уйти из разметки */
const CLOSE_MS = 160

/**
 * Меню строки долгим нажатием, как в Telegram (0.60): всё вокруг размывается и темнеет,
 * строка «отрывается» — чуть крупнее и с тенью, — под ней раскрывается меню из угла.
 * Строка здесь — копия настоящей: настоящая остаётся в списке на своём месте.
 */
export function RowMenu({
  anchor,
  point,
  items,
  onClose,
}: {
  anchor: HTMLElement | null
  /** где нажали правой кнопкой: на компьютере меню всплывает у курсора (0.61) */
  point?: { x: number; y: number } | null
  items: RowMenuItem[]
  onClose: () => void
}) {
  const popover = usePopoverMode()
  if (popover && (point || anchor)) {
    return (
      <Menu
        anchor={point ?? anchor!}
        label="Действия с задачей"
        onClose={onClose}
        items={items.map((it, i) => ({ ...it, separated: it.danger && i > 0 }))}
      />
    )
  }
  return <TouchRowMenu anchor={anchor} items={items} onClose={onClose} />
}

function TouchRowMenu({ anchor, items, onClose }: { anchor: HTMLElement | null; items: RowMenuItem[]; onClose: () => void }) {
  const cloneBox = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState(false)
  const [rect] = useState(() => anchor?.getBoundingClientRect() ?? null)

  useLayoutEffect(() => {
    const box = cloneBox.current
    if (!anchor || !box) return
    const copy = anchor.cloneNode(true) as HTMLElement
    copy.inert = true
    box.replaceChildren(copy)
  }, [anchor])

  const close = (then?: () => void) => {
    if (closing) return
    setClosing(true)
    window.setTimeout(() => {
      onClose()
      then?.()
    }, CLOSE_MS)
  }
  const closeRef = useRef(close)
  useLayoutEffect(() => {
    closeRef.current = close
  })

  useEffect(() => {
    // фокус — для клавиатуры и экранного диктора; рамку на телефоне не рисуем — её видели как
    // «нажатый» первый пункт
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!rect) return null
  const menuH = items.length * ITEM_H + 12
  // под строкой, если там хватает места над таб-баром, иначе — над ней
  const below = rect.bottom + 8 + menuH < window.innerHeight - 96
  const left = Math.min(Math.max(12, rect.left + 12), window.innerWidth - MENU_W - 12)
  const top = below ? rect.bottom + 8 : Math.max(12, rect.top - 8 - menuH)

  return createPortal(
    <div className="row-menu" data-closing={closing || undefined} role="presentation">
      <div className="row-menu-dim" onClick={() => close()} />
      <div ref={cloneBox} className="row-menu-row" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} aria-hidden />
      <div
        ref={menuRef}
        role="menu"
        aria-label="Действия с задачей"
        className="row-menu-list flex flex-col rounded-lg border border-border bg-surface py-1.5 shadow-popover"
        style={{ top, left, width: MENU_W, transformOrigin: below ? 'top left' : 'bottom left' }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            onClick={() => close(item.onSelect)}
            className={`flex min-h-11 items-center px-4 text-left text-base ${item.danger ? 'text-danger-text' : 'text-text'} lg:hover:bg-surface-hover`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
