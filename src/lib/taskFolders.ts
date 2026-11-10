import type { GroupModel } from './groups'
import { addDays } from './period'
import type { LabelColor, Task } from './types'

/**
 * Папки над списком «Задач». Не зашиты под клиентов: человек выбирает группу, из значений
 * которой выходят папки (или никакую), и добавляет к ним свои папки с условием (0.66.5).
 * Раньше это был выбор «или-или»: включил свои папки — пропали папки группы.
 */
export type FolderFlag = 'today' | 'hot' | 'noplan'

export const FOLDER_FLAGS: FolderFlag[] = ['today', 'hot', 'noplan']

export interface CustomFolder {
  id: string
  name: string
  /** значения групп: внутри одной группы — любое из них, между группами — все сразу */
  items: string[]
  /** особые условия — все сразу */
  flags: FolderFlag[]
}

export interface FolderSettings {
  /** 'auto' — первая группа; 'group:<id>' — значения группы; 'off' — без папок из группы */
  source: string
  custom: CustomFolder[]
}

export const DEFAULT_FOLDERS: FolderSettings = { source: 'auto', custom: [] }

export const SPECIAL_LABEL: Record<FolderFlag, string> = {
  today: 'На сегодня',
  hot: 'Горит',
  noplan: 'Без плана',
}

export const SPECIAL_HINT: Record<FolderFlag, string> = {
  today: 'в плане дня или был учёт сегодня',
  hot: 'просрочено или срок в ближайшие 2 дня',
  noplan: 'план часов не задан',
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

const isFlag = (v: unknown): v is FolderFlag => v === 'today' || v === 'hot' || v === 'noplan'

/**
 * Настройки из хранилища в нынешний вид. До 0.66.5: source 'custom' означал «только свои
 * папки», а у своей папки было одно условие `cond` — переводим без потерь.
 */
export function normalizeFolders(raw: unknown): FolderSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { source?: unknown; custom?: unknown }
  let source = typeof r.source === 'string' ? r.source : 'auto'
  if (source === 'custom') source = 'off'
  if (source !== 'auto' && source !== 'off' && !source.startsWith('group:')) source = 'auto'
  const custom: CustomFolder[] = []
  for (const f of Array.isArray(r.custom) ? r.custom : []) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string') continue
    const name = typeof f.name === 'string' ? f.name : ''
    let items: string[] = Array.isArray(f.items) ? f.items.filter((x: unknown) => typeof x === 'string') : []
    let flags: FolderFlag[] = Array.isArray(f.flags) ? f.flags.filter(isFlag) : []
    const cond = f.cond as { kind?: unknown; itemId?: unknown } | undefined
    if (cond && cond.kind === 'item' && typeof cond.itemId === 'string') items = [...items, cond.itemId]
    else if (cond && isFlag(cond.kind)) flags = [...flags, cond.kind]
    custom.push({ id: f.id, name, items: [...new Set(items)], flags: [...new Set(flags)] })
  }
  return { source, custom }
}

/** Есть ли что показывать строкой папок: группа выбрана или есть свои папки. */
export function foldersEnabled(settings: FolderSettings): boolean {
  return settings.source !== 'off' || settings.custom.length > 0
}

/** «Горит»: просрочено или срок в ближайшие два дня, и задача не закрыта. */
export function isHot(task: Task, today: string, done: boolean): boolean {
  return !done && !!task.end_date && task.end_date <= addDays(today, 2)
}

export function flagMatch(flag: FolderFlag, task: Task, ctx: FolderContext): boolean {
  switch (flag) {
    case 'today':
      return ctx.inDay(task)
    case 'hot':
      return isHot(task, ctx.today, ctx.isDone(task))
    case 'noplan':
      return !(task.planned_hours > 0)
  }
}

/** Значения папки, которые ещё существуют, — по группам. */
function itemsByGroup(items: string[], model: GroupModel): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  for (const id of items) {
    const item = model.itemById.get(id)
    if (!item) continue
    const set = out.get(item.group_id) ?? new Set<string>()
    set.add(id)
    out.set(item.group_id, set)
  }
  return out
}

/**
 * Задача в своей папке: в каждой выбранной группе есть хотя бы одно выбранное значение
 * и выполнены все особые условия. Папка без живых условий (значения удалили) пуста.
 */
export function customMatch(folder: Pick<CustomFolder, 'items' | 'flags'>, task: Task, ctx: FolderContext): boolean {
  const groups = itemsByGroup(folder.items, ctx.model)
  if (groups.size === 0 && folder.flags.length === 0) return false
  const own = task.item_ids ?? []
  for (const set of groups.values()) if (!own.some((id) => set.has(id))) return false
  return folder.flags.every((f) => flagMatch(f, task, ctx))
}

/** Какая группа стоит за источником; null — без папок из группы или группы больше нет. */
export function sourceGroupId(settings: FolderSettings, model: GroupModel): string | null {
  if (settings.source === 'auto') return model.groups[0]?.id ?? null
  if (settings.source.startsWith('group:')) {
    const id = settings.source.slice(6)
    return model.groupById.has(id) ? id : (model.groups[0]?.id ?? null)
  }
  return null
}

/** Условие папки словами: «Олари, World Class · Горит». */
export function folderSummary(folder: Pick<CustomFolder, 'items' | 'flags'>, model: GroupModel): string {
  const parts: string[] = []
  for (const set of itemsByGroup(folder.items, model).values()) {
    parts.push([...set].map((id) => model.itemById.get(id)!.name).join(' или '))
  }
  for (const f of folder.flags) parts.push(SPECIAL_LABEL[f])
  if (parts.length === 0) return folder.items.length ? 'значения удалены' : 'без условия'
  return parts.join(' · ')
}

/** Название по условию, пока человек не ввёл своё. */
export function autoFolderName(folder: Pick<CustomFolder, 'items' | 'flags'>, model: GroupModel): string {
  const names = folder.items.map((id) => model.itemById.get(id)?.name).filter((n): n is string => !!n)
  const all = [...names, ...folder.flags.map((f) => SPECIAL_LABEL[f])]
  if (all.length === 0) return ''
  const text = all.join(', ')
  return text.length > 40 ? `${all[0]} и ещё ${all.length - 1}` : text
}

/** Цвет своей папки — цвет значения, если оно в ней одно. */
function customColor(folder: CustomFolder, model: GroupModel): LabelColor | null {
  const live = folder.items.filter((id) => model.itemById.has(id))
  return live.length === 1 ? (model.itemById.get(live[0])?.color ?? null) : null
}

/**
 * Папки по настройке: сначала свои, затем значения выбранной группы. Значения группы без
 * единой задачи не показываем — пустые чипы мешают.
 */
export function buildFolders(settings: FolderSettings, ctx: FolderContext, tasks: Task[]): Folder[] {
  const custom: Folder[] = settings.custom.map((f) => ({
    key: `c:${f.id}`,
    name: f.name || autoFolderName(f, ctx.model) || 'Папка',
    color: customColor(f, ctx.model),
    match: (t: Task) => customMatch(f, t, ctx),
  }))
  const groupId = sourceGroupId(settings, ctx.model)
  if (!groupId) return custom
  const used = new Set(tasks.flatMap((t) => t.item_ids ?? []))
  const fromGroup = ctx.model
    .itemsOf(groupId)
    .filter((item) => used.has(item.id))
    .map((item) => ({
      key: `g:${item.id}`,
      name: item.name,
      color: item.color,
      match: (t: Task) => (t.item_ids ?? []).includes(item.id),
    }))
  return [...custom, ...fromGroup]
}

/**
 * Свой порядок папок (0.64): ключи из `order` — первыми и по нему, новые папки — следом в
 * исходном порядке. Ключи удалённых папок просто не находятся.
 */
export function orderFolders<T extends { key: string }>(folders: T[], order: string[]): T[] {
  const rank = new Map(order.map((key, i) => [key, i]))
  return folders
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (rank.get(a.f.key) ?? order.length + a.i) - (rank.get(b.f.key) ?? order.length + b.i))
    .map(({ f }) => f)
}
