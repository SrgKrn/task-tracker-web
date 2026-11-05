import { useEffect, useRef, type RefObject } from 'react'
import { targetIndex } from '../lib/dragSort'
import { tap } from '../lib/haptics'

const HOLD_MS = 350
/** сдвиг пальца до срабатывания, после которого это уже прокрутка или свайп, а не удержание */
const SLOP = 8
/** у края экрана список прокручивается сам */
const EDGE = 90
const SCROLL_STEP = 10

/**
 * Перетаскивание строк списка долгим нажатием (0.41). Строки — прямые дети контейнера с
 * атрибутом data-sort-row. Короткое касание и сдвиг вбок по-прежнему открывают задачу и
 * свайп: перетаскивание начинается, только если палец (или мышь) удержали на месте.
 *
 * Пока строку тащат, события касания до самой строки не доходят — иначе свайп строки
 * принял бы движение пальца за свой жест. После отпускания — onDrop(откуда, куда) в
 * индексах строк; нажатие, которое закончило перетаскивание, задачу не открывает.
 *
 * 0.60: пока палец держат, строка чуть проседает — «заряжается»; поднятая — крупнее, с
 * глубокой тенью и лёгким наклоном; отпущенная садится на место с пружиной. Удержали и
 * отпустили, не сдвинув, — это не перетаскивание, а меню строки: на строку уходит событие
 * row-menu (его ловит TaskListItem).
 */

/** поднятая строка: крупнее, наклонена, с глубокой тенью */
const LIFT = 'scale(1.04) rotate(-0.5deg)'
const LIFT_SHADOW = 'var(--shadow-popover), 0 18px 36px rgb(0 0 0 / 0.18)'
const SPRING = 'cubic-bezier(0.34, 1.4, 0.64, 1)'
export const ROW_MENU_EVENT = 'row-menu'
export function useDragSort(
  containerRef: RefObject<HTMLElement | null>,
  { enabled, onDrop }: { enabled: boolean; onDrop: (from: number, to: number) => void },
) {
  const dropRef = useRef(onDrop)
  useEffect(() => {
    dropRef.current = onDrop
  })

  useEffect(() => {
    const box = containerRef.current
    if (!enabled || !box) return

    let timer = 0
    let pending: { row: HTMLElement; x: number; y: number; target: Element; squash: Animation | null } | null = null
    let drag: {
      rows: HTMLElement[]
      from: number
      to: number
      mids: number[]
      height: number
      startY: number
      startScroll: number
      lastY: number
      target: Element
      moved: boolean
    } | null = null
    box.dataset.sortActive = ''
    let raf = 0

    const rowsOf = () => [...box.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.hasAttribute('data-sort-row'))

    function start() {
      if (!pending) return
      const rows = rowsOf()
      const from = rows.indexOf(pending.row)
      if (from < 0) return
      pending.squash?.cancel()
      const rects = rows.map((r) => r.getBoundingClientRect())
      drag = {
        rows,
        from,
        to: from,
        // середины в координатах документа: при автопрокрутке они не плывут
        mids: rects.map((r) => r.top + window.scrollY + r.height / 2),
        height: rects[from].height,
        startY: pending.y,
        startScroll: window.scrollY,
        lastY: pending.y,
        target: pending.target,
        moved: false,
      }
      pending = null
      tap(15)
      document.documentElement.style.userSelect = 'none'
      for (const r of rows) {
        r.style.transition = 'transform var(--duration-base) var(--ease-out)'
      }
      const el = rows[from]
      el.style.transition = 'none'
      el.style.position = 'relative'
      el.style.zIndex = '20'
      el.style.boxShadow = LIFT_SHADOW
      el.style.background = 'var(--surface)'
      // подъём — пружиной, а не скачком
      el.animate([{ transform: 'none', boxShadow: 'none' }, { transform: LIFT, boxShadow: LIFT_SHADOW }], { duration: 220, easing: SPRING })
      el.style.transform = LIFT
      el.dataset.dragging = ''
      raf = requestAnimationFrame(autoScroll)
    }

    function layout(y: number) {
      if (!drag) return
      drag.lastY = y
      const dy = y - drag.startY + (window.scrollY - drag.startScroll)
      if (Math.abs(y - drag.startY) > SLOP) drag.moved = true
      const center = drag.mids[drag.from] + dy
      const to = targetIndex(drag.mids, drag.from, center)
      drag.to = to
      drag.rows.forEach((r, i) => {
        if (i === drag!.from) {
          r.style.transform = `translateY(${dy}px) ${LIFT}`
          return
        }
        let shift = 0
        if (drag!.from < to && i > drag!.from && i <= to) shift = -drag!.height
        if (drag!.from > to && i < drag!.from && i >= to) shift = drag!.height
        r.style.transform = shift ? `translateY(${shift}px)` : ''
      })
    }

    function autoScroll() {
      if (!drag) return
      const y = drag.lastY
      const bottomEdge = window.innerHeight - EDGE - 70 // над нижней панелью
      if (y < EDGE) window.scrollBy(0, -SCROLL_STEP)
      else if (y > bottomEdge) window.scrollBy(0, SCROLL_STEP)
      layout(y)
      raf = requestAnimationFrame(autoScroll)
    }

    function finish(commit: boolean) {
      window.clearTimeout(timer)
      pending?.squash?.cancel()
      pending = null
      if (!drag) return
      cancelAnimationFrame(raf)
      const { rows, from, to, moved, target } = drag
      drag = null
      const el = rows[from]
      const before = el.getBoundingClientRect().top
      document.documentElement.style.userSelect = ''
      for (const r of rows) {
        r.style.transition = 'none'
        r.style.transform = ''
        r.style.position = ''
        r.style.zIndex = ''
        r.style.boxShadow = ''
        r.style.background = ''
        delete r.dataset.dragging
      }
      // нажатие, закончившее перетаскивание, — не переход в задачу
      const swallow = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
      }
      window.addEventListener('click', swallow, { capture: true, once: true })
      window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400)
      if (commit && from !== to) dropRef.current(from, to)
      // строка садится на новое место с пружиной: от того, где её отпустили
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const after = el.getBoundingClientRect().top
            el.animate(
              [
                { transform: `translateY(${before - after}px) ${LIFT}`, boxShadow: LIFT_SHADOW, position: 'relative', zIndex: 20 },
                { transform: 'none', boxShadow: 'none', position: 'relative', zIndex: 20 },
              ],
              { duration: 380, easing: SPRING },
            )
          }),
        )
      }
      // удержали и отпустили на месте — меню строки
      if (commit && !moved) target.dispatchEvent(new CustomEvent(ROW_MENU_EVENT, { bubbles: true }))
    }

    function down(target: EventTarget | null, x: number, y: number) {
      if (drag) return
      const row = (target as HTMLElement | null)?.closest?.('[data-sort-row]') as HTMLElement | null
      if (!row || row.parentElement !== box) return
      // кнопки и поля строки (учёт, галочка, поле подзадачи) — не ручка перетаскивания
      if ((target as HTMLElement).closest('input, textarea, [data-no-drag]')) return
      // пока держат — строка чуть проседает: видно, что сейчас что-то будет
      const squash = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? null
        : row.animate([{ transform: 'none' }, { transform: 'scale(0.98)' }], { duration: HOLD_MS, delay: 80, easing: 'ease-out', fill: 'forwards' })
      pending = { row, x, y, target: target as Element, squash }
      window.clearTimeout(timer)
      timer = window.setTimeout(start, HOLD_MS)
    }

    function move(x: number, y: number, e: Event) {
      if (drag) {
        e.preventDefault()
        e.stopPropagation()
        layout(y)
        return
      }
      if (pending && (Math.abs(x - pending.x) > SLOP || Math.abs(y - pending.y) > SLOP)) {
        window.clearTimeout(timer)
        pending.squash?.cancel()
        pending = null
      }
    }

    const onTouchStart = (e: TouchEvent) => down(e.target, e.touches[0].clientX, e.touches[0].clientY)
    const onTouchMove = (e: TouchEvent) => move(e.touches[0].clientX, e.touches[0].clientY, e)
    const onTouchEnd = (e: TouchEvent) => {
      if (drag) e.stopPropagation()
      finish(e.type === 'touchend')
    }
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) down(e.target, e.clientX, e.clientY)
    }
    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY, e)
    const onMouseUp = () => finish(true)
    // долгое нажатие на ссылке — не меню браузера
    const onContextMenu = (e: Event) => {
      if (pending || drag) e.preventDefault()
    }
    // мышью ссылку браузер сам «перетаскивает» как ссылку — это не наш жест
    const onDragStart = (e: Event) => {
      if (pending || drag) e.preventDefault()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish(false)
    }

    // слушатели на самом контейнере в фазе захвата: строка (её свайп) их уже не получит
    box.addEventListener('touchstart', onTouchStart, { capture: true, passive: true })
    box.addEventListener('touchmove', onTouchMove, { capture: true, passive: false })
    box.addEventListener('touchend', onTouchEnd, { capture: true })
    box.addEventListener('touchcancel', onTouchEnd, { capture: true })
    box.addEventListener('mousedown', onMouseDown, { capture: true })
    window.addEventListener('mousemove', onMouseMove, { capture: true })
    window.addEventListener('mouseup', onMouseUp, { capture: true })
    box.addEventListener('contextmenu', onContextMenu)
    box.addEventListener('dragstart', onDragStart)
    window.addEventListener('keydown', onKey)
    return () => {
      finish(false)
      delete box.dataset.sortActive
      box.removeEventListener('touchstart', onTouchStart, { capture: true })
      box.removeEventListener('touchmove', onTouchMove, { capture: true })
      box.removeEventListener('touchend', onTouchEnd, { capture: true })
      box.removeEventListener('touchcancel', onTouchEnd, { capture: true })
      box.removeEventListener('mousedown', onMouseDown, { capture: true })
      window.removeEventListener('mousemove', onMouseMove, { capture: true })
      window.removeEventListener('mouseup', onMouseUp, { capture: true })
      box.removeEventListener('contextmenu', onContextMenu)
      box.removeEventListener('dragstart', onDragStart)
      window.removeEventListener('keydown', onKey)
    }
  }, [containerRef, enabled])
}
