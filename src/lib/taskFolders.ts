import type { GroupModel } from './groups'
import { addDays } from './period'
import type { LabelColor, Task } from './types'

/**
 * Папки над списком «Задач» (0.57). Не зашиты под клиентов: источник выбирает человек —
 * любая его группа (клиенты, разделы, что угодно), свои папки с условием или ничего.
 */
export type FolderCond =
  | { kind: 'item'; itemId: string }
  | { kind: 'today' }
  | { kind: 'hot' }
  | { kind: 'noplan' }

export interface CustomFolder {
  id: string
  name: string
  cond: FolderCond
}

export interface FolderSettings {
  /** 'auto' — первая группа; 'group:<id>' — значения группы; 'custom' — свои папки; 'off' — без папок */
  source: string
  custom: CustomFolder[]
}

export const DEFAULT_FOLDERS: FolderSettings = { source: 'auto', custom: [] }

export const SPECIAL_LABEL: Record<'today' | 'hot' | 'noplan', string> = {
  today: 'На сегодня',
  hot: 'Горит',
  noplan: 'Без плана',
}

export interface Folder {
  key: string
  name: string
  color?: LabelColor | null
  match: (task: Task) => boolean
}

export interface FolderContext {
  model: GroupModel
  today: string
  /** задача в плане дня (isInDay) */
  inDay: (task: Task) => boolean
  /** задача закрыта (финальный этап) */
  isDone: (task: Task) => boolean
}

/** «Горит»: просрочено или срок в ближайшие два дня, и задача не закрыта. */
export function isHot(task: Task, today: string, done: boolean): boolean {
  return !done && !!task.end_date && task.end_date <= addDays(today, 2)
}

export function condMatch(cond: FolderCond, task: Task, ctx: FolderContext): boolean {
  switch (cond.kind) {
    case 'item':
      return (task.item_ids ?? []).includes(cond.itemId)
    case 'today':
      return ctx.inDay(task)
    case 'hot':
      return isHot(task, ctx.today, ctx.isDone(task))
    case 'noplan':
      return !(task.planned_hours > 0)
  }
}

/** Какая группа стоит за источником; null — источник не группа или группы больше нет. */
export function sourceGroupId(settings: FolderSettings, model: GroupModel): string | null {
  if (settings.source === 'auto') return model.groups[0]?.id ?? null
  if (settings.source.startsWith('group:')) {
    const id = settings.source.slice(6)
    return model.groupById.has(id) ? id : (model.groups[0]?.id ?? null)
  }
  return null
}

export function condLabel(cond: FolderCond, model: GroupModel): string {
  if (cond.kind !== 'item') return SPECIAL_LABEL[cond.kind]
  const item = model.itemById.get(cond.itemId)
  if (!item) return 'значение удалено'
  const group = model.groupById.get(item.group_id)
  return group ? `${group.name}: ${item.name}` : item.name
}

/** Папки по настройке. Значения группы без единой задачи не показываем — пустые чипы мешают. */
export function buildFolders(settings: FolderSettings, ctx: FolderContext, tasks: Task[]): Folder[] {
  if (settings.source === 'off') return []
  if (settings.source === 'custom') {
    return settings.custom.map((f) => ({
      key: `c:${f.id}`,
      name: f.name,
      color: f.cond.kind === 'item' ? (ctx.model.itemById.get(f.cond.itemId)?.color ?? null) : null,
      match: (t: Task) => condMatch(f.cond, t, ctx),
    }))
  }
  const groupId = sourceGroupId(settings, ctx.model)
  if (!groupId) return []
  const used = new Set(tasks.flatMap((t) => t.item_ids ?? []))
  return ctx.model
    .itemsOf(groupId)
    .filter((item) => used.has(item.id))
    .map((item) => ({
      key: `g:${item.id}`,
      name: item.name,
      color: item.color,
      match: (t: Task) => (t.item_ids ?? []).includes(item.id),
    }))
}
