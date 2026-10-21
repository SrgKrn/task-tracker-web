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
