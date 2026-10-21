/**
 * Перетаскивание задач (0.41): чистая логика без DOM — куда встанет строка и какое место
 * записать в базу.
 */

/**
 * Новый индекс перетаскиваемой строки. mids — середины строк по вертикали в исходном
 * порядке, center — середина перетаскиваемой строки сейчас. Строка встаёт за последнюю
 * соседку, чью середину перешла.
 */
export function targetIndex(mids: number[], from: number, center: number): number {
  let to = from
  for (let i = from + 1; i < mids.length; i++) if (center > mids[i]) to = i
  for (let i = from - 1; i >= 0; i--) if (center < mids[i]) to = i
  return to
}

export interface OrderPatch {
  id: string
  sort_order: number
}

/** соседние места ближе этого — перенумеровываем список заново */
const MIN_GAP = 1e-6

/**
 * Что записать в базу, чтобы строка from встала на место to. Обычно — одну строку:
 * середина между новыми соседями (или ±1 у края). Если места сошлись (много перестановок
 * в одну щель или одинаковые места), — все строки по порядку 1, 2, 3…
 */
export function reorderPatch(items: OrderPatch[], from: number, to: number): OrderPatch[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return []
  const rest = items.filter((_, i) => i !== from)
  const moved = items[from]
  const prev = rest[to - 1]
  const next = rest[to]
  let order: number
  if (!prev) order = next.sort_order - 1
  else if (!next) order = prev.sort_order + 1
  else order = (prev.sort_order + next.sort_order) / 2
  const tight = (prev && order - prev.sort_order < MIN_GAP) || (next && next.sort_order - order < MIN_GAP)
  if (!tight) return [{ id: moved.id, sort_order: order }]
  const result = [...rest]
  result.splice(to, 0, moved)
  return result.map((t, i) => ({ id: t.id, sort_order: i + 1 }))
}

/** свой порядок: место, при равных — новые выше */
export function compareManual(a: { sort_order: number; created_at: string }, b: { sort_order: number; created_at: string }) {
  return a.sort_order - b.sort_order || b.created_at.localeCompare(a.created_at)
}
