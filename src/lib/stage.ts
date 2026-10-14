import type { Status } from './types'

/** тон этапа — ключ палитры статусов дизайн-системы (--status-{tone}) */
export type StageTone = 'todo' | 'progress' | 'done'

/**
 * Цвет этапа вычисляется, а не хранится: финальный — «готово», первый по порядку —
 * «к выполнению» (если этапов три и больше), остальные — «в работе». От названий не
 * зависит, поэтому этапы можно переименовывать как угодно. Если этап один нефинальный,
 * он «в работе»: «В работе / Готово» не должно начинаться с серого.
 */
export function stageTone(status: Status, statuses: Status[]): StageTone {
  if (status.is_final) return 'done'
  const ordered = [...statuses].sort((a, b) => a.sort_order - b.sort_order)
  if (ordered.length >= 3 && ordered[0]?.id === status.id) return 'todo'
  return 'progress'
}
