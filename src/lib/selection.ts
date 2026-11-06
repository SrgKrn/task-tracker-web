/*
 * Выделение строк списка задач (0.63, компьютер с мышью). Порядок — как на экране:
 * секции сверху вниз, без свёрнутых.
 */

/** Shift-клик и Shift+↑↓: всё от якоря до строки включительно; без якоря — одна строка */
export function rangeIds(order: string[], from: string | null | undefined, to: string): string[] {
  const end = order.indexOf(to)
  if (end === -1) return []
  const start = from ? order.indexOf(from) : -1
  if (start === -1) return [to]
  const [lo, hi] = start < end ? [start, end] : [end, start]
  return order.slice(lo, hi + 1)
}

/** ↑↓: соседняя строка, у краёв стоим; без курсора — первая (вниз) или последняя (вверх) */
export function stepCursor(order: string[], cursor: string | null | undefined, step: 1 | -1): string | null {
  if (order.length === 0) return null
  const i = cursor ? order.indexOf(cursor) : -1
  if (i === -1) return order[step === 1 ? 0 : order.length - 1]
  return order[Math.min(order.length - 1, Math.max(0, i + step))]
}

export function toggleId(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** Ctrl+A: сначала вся секция строки под курсором, уже выделена — весь список */
export function selectAllStep(sections: string[][], cursor: string | null | undefined, current: ReadonlySet<string>): Set<string> {
  const all = sections.flat()
  const section = (cursor && sections.find((s) => s.includes(cursor))) || sections[0] || []
  const sectionFull = section.length > 0 && section.every((id) => current.has(id))
  return new Set(sectionFull ? all : section)
}
