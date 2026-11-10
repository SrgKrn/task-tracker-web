import { describe, expect, it } from 'vitest'
import { buildGroupModel } from './groups'
import {
  autoFolderName,
  buildFolders,
  customMatch,
  folderSummary,
  foldersEnabled,
  normalizeFolders,
  type FolderContext,
} from './taskFolders'
import type { Group, GroupItem, Task } from './types'

const group = (id: string, name: string): Group =>
  ({ id, name, item_name: name, sort_order: 0, show_in_list: true, required: false, parent_group_id: null }) as Group
const item = (id: string, group_id: string, name: string, color: string | null = null): GroupItem =>
  ({ id, group_id, name, color, sort_order: 0, archived: false }) as GroupItem
const task = (id: string, item_ids: string[], extra: Partial<Task> = {}): Task =>
  ({ id, name: id, item_ids, parent_id: null, planned_hours: 5, fact_hours: 0, status_id: null, end_date: null, ...extra }) as Task

const model = buildGroupModel(
  [group('g1', 'Клиенты'), group('g2', 'Разделы')],
  [item('c1', 'g1', 'Олари', 'label-1'), item('c2', 'g1', 'Wclass', 'label-2'), item('s1', 'g2', 'Дизайн')],
)
const ctx: FolderContext = { model, today: '2026-11-10', inDay: (t) => t.id === 'a', isDone: () => false }
const a = task('a', ['c1', 's1'], { end_date: '2026-11-11' })
const b = task('b', ['c2'], { planned_hours: 0 })
const c = task('c', ['c1'])

describe('свои папки', () => {
  it('в одной группе — любое значение, между группами — все', () => {
    const f = { items: ['c1', 'c2'], flags: [] }
    expect([a, b, c].filter((t) => customMatch(f, t, ctx)).map((t) => t.id)).toEqual(['a', 'b', 'c'])
    const g = { items: ['c1', 's1'], flags: [] }
    expect([a, b, c].filter((t) => customMatch(g, t, ctx)).map((t) => t.id)).toEqual(['a'])
  })
  it('особые условия складываются с значениями', () => {
    expect([a, b, c].filter((t) => customMatch({ items: ['c1'], flags: ['hot'] }, t, ctx)).map((t) => t.id)).toEqual(['a'])
    expect([a, b, c].filter((t) => customMatch({ items: [], flags: ['noplan'] }, t, ctx)).map((t) => t.id)).toEqual(['b'])
  })
  it('удалённые значения не ловят все задачи подряд', () => {
    expect(customMatch({ items: ['gone'], flags: [] }, a, ctx)).toBe(false)
    expect(folderSummary({ items: ['gone'], flags: [] }, model)).toBe('значения удалены')
  })
  it('подпись и название по условию', () => {
    expect(folderSummary({ items: ['c1', 'c2', 's1'], flags: ['hot'] }, model)).toBe('Олари или Wclass · Дизайн · Горит')
    expect(autoFolderName({ items: ['c1'], flags: ['hot'] }, model)).toBe('Олари, Горит')
  })
})

describe('настройки папок', () => {
  it('старые «только свои папки» переводятся без потерь', () => {
    const s = normalizeFolders({
      source: 'custom',
      custom: [
        { id: '1', name: 'Олари', cond: { kind: 'item', itemId: 'c1' } },
        { id: '2', name: 'Срочно', cond: { kind: 'hot' } },
      ],
    })
    expect(s.source).toBe('off')
    expect(s.custom).toEqual([
      { id: '1', name: 'Олари', items: ['c1'], flags: [] },
      { id: '2', name: 'Срочно', items: [], flags: ['hot'] },
    ])
    expect(foldersEnabled(s)).toBe(true)
  })
  it('мусор — значения по умолчанию', () => {
    expect(normalizeFolders(null)).toEqual({ source: 'auto', custom: [] })
    expect(normalizeFolders({ source: 42, custom: [{ nope: 1 }] })).toEqual({ source: 'auto', custom: [] })
    expect(foldersEnabled({ source: 'off', custom: [] })).toBe(false)
  })
  it('свои папки и папки группы вместе: свои первыми', () => {
    const s = normalizeFolders({ source: 'group:g1', custom: [{ id: 'x', name: '', items: [], flags: ['hot'] }] })
    const folders = buildFolders(s, ctx, [a, b, c])
    expect(folders.map((f) => [f.key, f.name])).toEqual([
      ['c:x', 'Горит'],
      ['g:c1', 'Олари'],
      ['g:c2', 'Wclass'],
    ])
  })
})
