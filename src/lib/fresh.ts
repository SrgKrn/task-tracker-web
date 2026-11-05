/**
 * Только что созданные задачи (0.60): строка такой задачи встаёт в список заметно —
 * раздвигает место и подсвечивается, чтобы было видно, куда она попала.
 */
const fresh = new Map<string, number>()
const FRESH_MS = 4000

export function markFresh(id: string) {
  fresh.set(id, Date.now())
}

/** задачу создали только что; отметка гаснет сама — в следующий раз строка встанет тихо */
export function isFresh(id: string): boolean {
  const at = fresh.get(id)
  if (at === undefined) return false
  if (Date.now() - at > FRESH_MS) {
    fresh.delete(id)
    return false
  }
  return true
}
