import { describe, expect, it } from 'vitest'
import { NODE_H, NODE_W, edgePath, layoutCanvas, taskFields, wouldCycle } from './canvas'

const g = (id: string, parent: string | null = null, extra: Partial<{ canvas_x: number; canvas_y: number; sort_order: number }> = {}) => ({
  id,
  name: id,
  item_name: id,
  required: false,
  parent_group_id: parent,
  canvas_x: extra.canvas_x ?? null,
  canvas_y: extra.canvas_y ?? null,
  sort_order: extra.sort_order ?? 0,
})

describe('раскладка холста', () => {
  it('родитель над тем, что в него входит; отдельные — рядом ниже; задача — под всеми', () => {
    const groups = [g('clients'), g('projects', 'clients'), g('kinds')]
    const { pos, task } = layoutCanvas(groups, 360)
    expect(pos.get('clients')!.y).toBeLessThan(pos.get('projects')!.y)
    expect(pos.get('kinds')!.y).toBeGreaterThan(pos.get('projects')!.y)
    const bottom = Math.max(...[...pos.values()].map((p) => p.y + NODE_H))
    expect(task.y).toBeGreaterThan(bottom)
  })

  it('блоки не перекрываются и не выходят за ширину', () => {
    const groups = [g('a'), g('b'), g('c'), g('d'), g('e', 'a')]
    const width = 340
    const { pos } = layoutCanvas(groups, width)
    const boxes = [...pos.values()]
    for (const p of boxes) expect(p.x + NODE_W).toBeLessThanOrEqual(width)
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j]
        const overlap = a.x < b.x + NODE_W && b.x < a.x + NODE_W && a.y < b.y + NODE_H && b.y < a.y + NODE_H
        expect(overlap).toBe(false)
      }
  })

  it('сохранённое место важнее, но блок с широкого экрана не уезжает за край узкого', () => {
    const { pos } = layoutCanvas([g('a', null, { canvas_x: 900, canvas_y: 40 })], 360)
    expect(pos.get('a')).toEqual({ x: 360 - NODE_W - 12, y: 40 })
  })

  it('новый блок без места не ложится поверх перетащенного', () => {
    const groups = [g('a', null, { canvas_x: 12, canvas_y: 12 }), g('b')]
    const { pos } = layoutCanvas(groups, 360)
    const a = pos.get('a')!, b = pos.get('b')!
    const overlap = a.x < b.x + NODE_W && b.x < a.x + NODE_W && a.y < b.y + NODE_H && b.y < a.y + NODE_H
    expect(overlap).toBe(false)
  })
})

describe('связи', () => {
  const groups = [g('clients'), g('projects', 'clients'), g('stages', 'projects')]
  it('круг не получится', () => {
    expect(wouldCycle(groups, 'clients', 'stages')).toBe(true)
    expect(wouldCycle(groups, 'clients', 'clients')).toBe(true)
    expect(wouldCycle(groups, 'stages', 'clients')).toBe(false)
  })

  it('поля задачи: группа, в которую входит другая, подставится сама', () => {
    const fields = taskFields(groups)
    expect(fields.map((f) => [f.group.id, f.auto, f.from?.item_name ?? null])).toEqual([
      ['clients', true, 'projects'],
      ['projects', true, 'stages'],
      ['stages', false, null],
    ])
  })

  it('стрелка идёт от нижнего края верхнего блока к верхнему краю нижнего', () => {
    const { d, mid } = edgePath({ x: 0, y: 200 }, { x: 0, y: 0 })
    expect(d.startsWith(`M${NODE_W / 2},200`)).toBe(true)
    expect(d.endsWith(`${NODE_W / 2},${NODE_H}`)).toBe(true)
    expect(mid.y).toBe((200 + NODE_H) / 2)
  })
})
