import type { Group } from './types'

/**
 * Холст структуры: группы — блоки, «входит в» — стрелки от группы к той, в которую она
 * входит. Внизу — блок «Задача»: по значению из каждой группы.
 */

export const NODE_W = 148
export const NODE_H = 120
/** блок «Задача» шире: подпись в нём длиннее названий групп */
export const TASK_W = 184
export const TASK_H = 56
const GAP_X = 14
const GAP_Y = 46
const PAD = 12

export interface Point {
  x: number
  y: number
}

type CanvasGroup = Pick<Group, 'id' | 'parent_group_id' | 'canvas_x' | 'canvas_y' | 'sort_order'>

/** глубина в цепочке «входит в»: верхний уровень — 0. Круг (его не даёт база) обрывается. */
function depthOf(g: CanvasGroup, byId: Map<string, CanvasGroup>): number {
  let d = 0
  const seen = new Set([g.id])
  for (let p = g.parent_group_id ? byId.get(g.parent_group_id) : undefined; p && !seen.has(p.id); p = p.parent_group_id ? byId.get(p.parent_group_id) : undefined) {
    seen.add(p.id)
    d++
  }
  return d
}

/**
 * Раскладка без сохранённых координат: связанные группы — по уровням сверху вниз
 * (родитель над тем, что в него входит), отдельные — рядами под ними. Сохранённые
 * координаты важнее; блок, уехавший за край узкого экрана, возвращается в ширину.
 */
export function layoutCanvas(groups: CanvasGroup[], width: number): { pos: Map<string, Point>; task: Point; height: number } {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const cols = Math.max(1, Math.floor((width - 2 * PAD + GAP_X) / (NODE_W + GAP_X)))
  const linked = groups.filter((g) => (g.parent_group_id && byId.has(g.parent_group_id)) || groups.some((c) => c.parent_group_id === g.id))
  const solo = groups.filter((g) => !linked.includes(g))

  const auto = new Map<string, Point>()
  const rows: CanvasGroup[][] = []
  for (const g of linked) {
    const d = depthOf(g, byId)
    ;(rows[d] ??= []).push(g)
  }
  let y = PAD
  const place = (row: CanvasGroup[]) => {
    for (let i = 0; i < row.length; i += cols) {
      const chunk = row.slice(i, i + cols)
      const used = chunk.length * NODE_W + (chunk.length - 1) * GAP_X
      const x0 = Math.max(PAD, (width - used) / 2)
      chunk.forEach((g, j) => auto.set(g.id, { x: x0 + j * (NODE_W + GAP_X), y }))
      y += NODE_H + GAP_Y
    }
  }
  for (const row of rows) if (row?.length) place([...row].sort((a, b) => a.sort_order - b.sort_order))
  if (solo.length) place([...solo].sort((a, b) => a.sort_order - b.sort_order))

  const pos = new Map<string, Point>()
  const maxX = Math.max(PAD, width - NODE_W - PAD)
  const clamp = (p: Point) => ({ x: Math.min(Math.max(0, p.x), maxX), y: Math.max(0, p.y) })
  const hits = (a: Point, b: Point) => a.x < b.x + NODE_W && b.x < a.x + NODE_W && a.y < b.y + NODE_H && b.y < a.y + NODE_H
  // сначала те, кого поставил человек: их место не трогаем
  for (const g of groups) {
    if (g.canvas_x != null && g.canvas_y != null) pos.set(g.id, clamp({ x: g.canvas_x, y: g.canvas_y }))
  }
  // остальные — по раскладке; занято — ниже, пока не найдётся свободное место
  for (const g of groups) {
    if (pos.has(g.id)) continue
    const p = clamp(auto.get(g.id)!)
    while ([...pos.values()].some((q) => hits(p, q))) p.y += NODE_H + GAP_Y
    pos.set(g.id, p)
  }
  const bottom = Math.max(PAD, ...[...pos.values()].map((p) => p.y + NODE_H))
  const task = { x: Math.max(PAD, (width - TASK_W) / 2), y: bottom + GAP_Y + 10 }
  return { pos, task, height: task.y + TASK_H + PAD }
}

/**
 * Можно ли сделать так, чтобы child входила в parent: не в саму себя и не в группу,
 * которая уже (прямо или через другие) входит в child — получился бы круг.
 */
export function wouldCycle(groups: Pick<Group, 'id' | 'parent_group_id'>[], childId: string, parentId: string): boolean {
  if (childId === parentId) return true
  const byId = new Map(groups.map((g) => [g.id, g]))
  const seen = new Set<string>()
  for (let p = byId.get(parentId); p && !seen.has(p.id); p = p.parent_group_id ? byId.get(p.parent_group_id) : undefined) {
    if (p.id === childId) return true
    seen.add(p.id)
  }
  return false
}

export interface TaskField {
  group: Pick<Group, 'id' | 'name' | 'item_name' | 'required'>
  /** значение подставится само: в эту группу входит другая, выбранная в задаче */
  auto: boolean
  /** из какой группы подставится */
  from?: Pick<Group, 'item_name'>
}

/** Поля новой задачи по группам: какие выбирать, а какие база заполнит сама по связям. */
export function taskFields(groups: Pick<Group, 'id' | 'name' | 'item_name' | 'required' | 'parent_group_id'>[]): TaskField[] {
  return groups.map((g) => {
    const child = groups.find((c) => c.parent_group_id === g.id)
    return { group: g, auto: !!child, from: child }
  })
}

/** Кубическая кривая от нижнего края a к верхнему краю b (или наоборот, если b выше). */
export function edgePath(a: Point, b: Point, h = NODE_H, w = NODE_W): { d: string; mid: Point } {
  const x1 = a.x + w / 2
  const x2 = b.x + w / 2
  let y1: number
  let y2: number
  if (b.y > a.y + h / 2) {
    y1 = a.y + h
    y2 = b.y
  } else {
    y1 = a.y
    y2 = b.y + h
  }
  const k = Math.max(28, Math.abs(y2 - y1) / 2) * (y2 > y1 ? 1 : -1)
  return {
    d: `M${x1},${y1} C${x1},${y1 + k} ${x2},${y2 - k} ${x2},${y2}`,
    mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
  }
}
