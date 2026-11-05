/**
 * Комментарий улетает из поля в ленту (0.60). Поле запоминает, откуда и что отправили; лента,
 * когда в ней появится этот текст, проигрывает полёт строки с места поля на её место.
 */
let flight: { taskId: string; body: string; rect: DOMRect; at: number } | null = null

export function launchComment(taskId: string, body: string, from: Element) {
  flight = { taskId, body, rect: from.getBoundingClientRect(), at: performance.now() }
}

/** Ищет в ленте отправленный комментарий и проигрывает его прилёт. */
export function landComment(taskId: string, box: HTMLElement | null) {
  const f = flight
  if (!f || !box || f.taskId !== taskId) return
  if (performance.now() - f.at > 4000) {
    flight = null
    return
  }
  const el = [...box.querySelectorAll<HTMLElement>('[data-comment]')].find((n) => n.textContent === f.body)
  if (!el) return
  flight = null
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const to = el.getBoundingClientRect()
  // поле ушло за экран (длинная лента) — лететь неоткуда, просто проявляем
  const visible = f.rect.top < window.innerHeight && f.rect.bottom > 0
  const dx = f.rect.left + 16 - to.left
  const dy = f.rect.top + (f.rect.height - to.height) / 2 - to.top
  el.animate(
    visible
      ? [
          { transform: `translate(${dx}px, ${dy}px)`, opacity: 0.4 },
          { transform: 'none', opacity: 1 },
        ]
      : [{ opacity: 0 }, { opacity: 1 }],
    { duration: 440, easing: 'cubic-bezier(0.2, 0.85, 0.15, 1)' },
  )
}
