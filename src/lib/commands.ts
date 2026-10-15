/**
 * Командная палитра открывается из разных мест — кнопка в боковой панели, ⌘K, клавиша «/».
 * Событие на window вместо контекста: открывающему не нужно знать, где палитра живёт.
 */
const OPEN_EVENT = 'semternity:open-palette'

export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function onOpenCommandPalette(handler: () => void): () => void {
  window.addEventListener(OPEN_EVENT, handler)
  return () => window.removeEventListener(OPEN_EVENT, handler)
}

/** фокус в поле ввода — одиночные клавиши (C, J, K, S) не перехватываем */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
}
