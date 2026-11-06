import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isTypingTarget } from '../lib/commands'
import { rangeIds, selectAllStep, stepCursor, toggleId } from '../lib/selection'

/** что сделать с задачами под курсором или выделенными — с клавиатуры */
export type ListAction = 'stage' | 'due' | 'done' | 'delete'

interface Options {
  /** таблица на компьютере с мышью; на телефоне выделения нет */
  enabled: boolean
  /** id строк по секциям, как на экране, без свёрнутых */
  sections: string[][]
  /** открытая карточка */
  openId: string | undefined
  onOpen: (id: string) => void
  onRename: (id: string) => void
  onAction: (action: ListAction, ids: string[]) => void
  /** Ctrl+1…9: 0 — «Все», дальше папки по порядку */
  onFolder: (index: number) => void
}

/**
 * Выделение и клавиатура списка задач (0.63), как в Asana и почте: Ctrl-клик добавляет,
 * Shift-клик — диапазон, ↑↓ ходят по строкам, Space выделяет, Ctrl+A — секция, потом всё.
 * Клавиши слушаем на window до остальных: Esc сначала снимает выделение, а не закрывает
 * карточку. Не трогаем, пока фокус в поле, открыто окно или всплывающее меню.
 */
export function useListSelection(o: Options) {
  const [rawPicked, setPicked] = useState<Set<string>>(() => new Set())
  const [cursor, setCursor] = useState<string | null>(null)
  /** курсор рисуем, только пока ходят клавишами, — мышью он не нужен */
  const [keyboard, setKeyboard] = useState(false)
  const anchor = useRef<string | null>(null)

  const order = useMemo(() => o.sections.flat(), [o.sections])
  const visible = useMemo(() => new Set(order), [order])
  // ушедшее из вида (фильтр, папка, свернули секцию) из выделения выпадает
  const picked = useMemo(() => new Set([...rawPicked].filter((id) => visible.has(id))), [rawPicked, visible])

  // открыли задачу — курсор на ней: стрелки продолжают отсюда
  const [seenOpen, setSeenOpen] = useState(o.openId)
  if (o.openId !== seenOpen) {
    setSeenOpen(o.openId)
    if (o.openId) setCursor(o.openId)
  }

  const clear = () => {
    setPicked(new Set())
    anchor.current = null
  }

  /** клик по строке; true — это было выделение, карточку не открываем */
  const pick = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }, id: string): boolean => {
    if (!o.enabled) return false
    setKeyboard(false)
    setCursor(id)
    if (e.shiftKey) {
      const from = anchor.current ?? (o.openId && visible.has(o.openId) ? o.openId : null)
      anchor.current = from ?? id
      setPicked(new Set(rangeIds(order, anchor.current, id)))
      return true
    }
    if (e.ctrlKey || e.metaKey) {
      // открытая карточка — уже как будто выделена: Ctrl-клик по второй берёт обе
      const base = picked.size === 0 && o.openId && o.openId !== id && visible.has(o.openId) ? new Set([o.openId]) : picked
      setPicked(toggleId(base, id))
      anchor.current = id
      return true
    }
    clear()
    anchor.current = id
    return false
  }

  const state = { picked, cursor, order }
  const latest = useRef({ o, state })
  useLayoutEffect(() => {
    latest.current = { o, state }
  })

  useEffect(() => {
    if (!o.enabled) return
    const onKey = (e: KeyboardEvent) => {
      const { o, state } = latest.current
      if (e.defaultPrevented || isTypingTarget(e.target)) return
      if (document.querySelector('[aria-modal="true"], [data-popover]')) return
      const mod = e.ctrlKey || e.metaKey

      // папки — откуда угодно, лишь бы не в поле; в браузере Ctrl+цифра занята вкладками — есть Alt
      const digit = e.code.startsWith('Digit') ? Number(e.code.slice(5)) : NaN
      if ((mod || e.altKey) && !e.shiftKey && digit >= 1 && digit <= 9) {
        e.preventDefault()
        o.onFolder(digit - 1)
        return
      }

      // остальное — когда фокус в списке или нигде: в карточке стрелки и Enter свои
      const active = document.activeElement
      if (active && active !== document.body && !active.closest('.task-list-pane')) return
      if (e.altKey) return

      const here = state.cursor && state.order.includes(state.cursor) ? state.cursor : null
      const targets = state.picked.size > 0 ? state.order.filter((id) => state.picked.has(id)) : here ? [here] : []
      const handled = () => {
        e.preventDefault()
        e.stopPropagation()
      }

      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !mod) {
        const next = stepCursor(state.order, here, e.key === 'ArrowDown' ? 1 : -1)
        if (!next) return
        handled()
        setKeyboard(true)
        setCursor(next)
        if (e.shiftKey) {
          anchor.current = anchor.current ?? here ?? next
          setPicked(new Set(rangeIds(state.order, anchor.current, next)))
        } else if (o.openId && next !== o.openId) {
          // карточка открыта — она идёт следом за курсором, как чат в Telegram
          o.onOpen(next)
        }
        requestAnimationFrame(() =>
          document.querySelector(`.task-list-pane [data-row-id="${next}"]`)?.scrollIntoView({ block: 'nearest' }),
        )
        return
      }
      if (e.key === 'Enter') {
        if (mod) {
          if (!targets.length) return
          handled()
          o.onAction('done', targets)
        } else if (here && !e.shiftKey) {
          handled()
          o.onOpen(here)
        }
        return
      }
      if (e.key === ' ' && !mod) {
        if (!here) return
        handled()
        setKeyboard(true)
        setPicked((prev) => toggleId(new Set([...prev].filter((id) => state.order.includes(id))), here))
        anchor.current = here
        return
      }
      if (e.key === 'Escape' && state.picked.size > 0) {
        handled()
        setPicked(new Set())
        anchor.current = null
        return
      }
      if (mod && e.code === 'KeyA' && !e.shiftKey) {
        handled()
        setPicked(selectAllStep(o.sections, here, state.picked))
        return
      }
      if (mod || e.shiftKey) return
      if (e.code === 'KeyE' || e.code === 'KeyD' || e.key === 'Delete' || e.key === 'Backspace') {
        if (!targets.length) return
        handled()
        o.onAction(e.code === 'KeyE' ? 'stage' : e.code === 'KeyD' ? 'due' : 'delete', targets)
        return
      }
      if (e.key === 'F2' && here) {
        handled()
        o.onRename(here)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [o.enabled])

  // мышью повели — курсор клавиатуры гасим
  useEffect(() => {
    if (!keyboard) return
    const off = () => setKeyboard(false)
    window.addEventListener('pointermove', off, { once: true })
    return () => window.removeEventListener('pointermove', off)
  }, [keyboard])

  return { picked, setPicked, cursor: keyboard ? cursor : null, pick, clear }
}
