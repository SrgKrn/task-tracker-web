import { useSyncExternalStore } from 'react'

/**
 * Устройство с мышью и клавиатурой. На телефоне поле в открывшемся окне фокус само не
 * берёт: выскакивала клавиатура и закрывала полэкрана, а окно часто открывают, чтобы
 * сначала выбрать что-то другое. На компьютере сразу печатать удобно.
 */
export const focusOnOpen: boolean =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches

/** Телефон или планшет: палец вместо мыши — даты выбираем системным календарём. */
export const touchDevice: boolean =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches

/** Совпадает ли медиазапрос сейчас; следит за поворотом и сменой ширины окна. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
      const mq = window.matchMedia(query)
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    },
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  )
}
