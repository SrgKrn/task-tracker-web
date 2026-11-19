import { useEffect, useState } from 'react'

/**
 * Нижняя панель уступает место содержимому (0.68): листаем вниз — панель сжимается до
 * значков, листаем вверх или вернулись к началу — разворачивается. Так ведёт себя панель
 * вкладок в iOS 26: навигация всегда под рукой, но не закрывает список.
 */

/** Не сжимаем у самого верха: там панель ничего важного не закрывает. */
export const COMPACT_FROM = 96
/** Столько нужно пролистать вниз подряд, чтобы панель сжалась, … */
export const COMPACT_DOWN = 28
/** … и столько вверх, чтобы она развернулась обратно. */
export const COMPACT_UP = 14

export interface CompactState {
  compact: boolean
  /** точка, от которой считается путь в текущую сторону */
  anchor: number
}

/**
 * Следующее состояние по новому положению прокрутки. Путь меряется от точки последнего
 * разворота: мелкое дрожание пальца и «резинка» iOS панель не дёргают.
 */
export function nextCompact(state: CompactState, y: number): CompactState {
  if (y <= COMPACT_FROM) return { compact: false, anchor: y }
  if (!state.compact) {
    // двинулись вверх — путь вниз считается заново отсюда
    if (y < state.anchor) return { compact: false, anchor: y }
    return y - state.anchor >= COMPACT_DOWN ? { compact: true, anchor: y } : state
  }
  if (y > state.anchor) return { compact: true, anchor: y }
  return state.anchor - y >= COMPACT_UP ? { compact: false, anchor: y } : state
}

/** Что прокручивается: окно или внутренняя область экрана — но не окна и не поля ввода. */
function scrollTopOf(target: EventTarget | null): number | null {
  if (target === document || target === document.documentElement || target === document.body) return window.scrollY
  if (!(target instanceof HTMLElement)) return null
  if (target.closest('[role="dialog"], [data-popover], textarea, input')) return null
  // горизонтальные ленты (папки, вкладки) панель не трогают
  if (target.scrollHeight <= target.clientHeight + 1) return null
  return target.scrollTop
}

/** Сжата ли нижняя панель сейчас. `resetKey` — смена экрана: на новом панель полная. */
export function useScrollCompact(resetKey: string): boolean {
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    // по умолчанию листается окно: отсчёт с его положения, а не с первого события —
    // иначе быстрый рывок одним событием «съедается» сменой источника
    let state: CompactState = { compact: false, anchor: window.scrollY }
    let source: EventTarget | null = document
    const onScroll = (e: Event) => {
      const y = scrollTopOf(e.target)
      if (y === null) return
      // сменилась прокручиваемая область — отсчёт с её положения
      if (e.target !== source) {
        source = e.target
        state = { compact: state.compact, anchor: y }
      }
      const next = nextCompact(state, y)
      if (next.compact !== state.compact) setCompact(next.compact)
      state = next
    }
    // события прокрутки не всплывают — ловим на погружении, сразу со всех областей
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      setCompact(false)
    }
  }, [resetKey])

  return compact
}
