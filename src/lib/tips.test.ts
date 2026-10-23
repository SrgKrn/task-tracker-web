import { describe, expect, it } from 'vitest'
import migration from '../../supabase/migrations/0039_tips.sql?raw'
import { HELP, HELP_BY_ID } from './help'
import { FIRST_STEPS, TIP_IDS, TIPS, pickTip, stepLabel, type TipId } from './tips'

describe('подсказки 0.43', () => {
  it('список совпадает с миграцией 0039 — старым аккаунтам отмечены ровно эти', () => {
    const m = migration.match(/unnest\(array\[([^\]]+)\]/)
    expect(m).not.toBeNull()
    const ids = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    expect(ids).toEqual([...TIP_IDS])
  })

  it('у каждой подсказки есть статья справки, у статей — существующие соседи', () => {
    for (const id of TIP_IDS) expect(HELP_BY_ID.has(TIPS[id].help)).toBe(true)
    for (const a of HELP) for (const r of a.related) expect(HELP_BY_ID.has(r)).toBe(true)
    expect(new Set(HELP.map((a) => a.id)).size).toBe(HELP.length)
    expect(HELP).toHaveLength(16)
  })

  it('очередь: по порядку списка, без закрытых, без лимита в день', () => {
    const c = new Set<TipId>(['ring', 'new-task', 'groups', 'summary', 'focus'])
    expect(pickTip(c, {}, true)).toEqual(['new-task', 'ring', 'groups', 'summary', 'focus'])
    expect(pickTip(c, { 'new-task': '2026-10-24', ring: '2026-10-24' }, true)).toEqual(['groups', 'summary', 'focus'])
  })

  it('выключенные подсказки не показываются', () => {
    expect(pickTip(new Set<TipId>(['timer']), {}, false)).toEqual([])
  })

  it('первые шаги подписаны «1 из 3», остальные — нет', () => {
    expect(FIRST_STEPS).toEqual(['new-task', 'timer', 'ring'])
    expect(stepLabel('timer')).toBe('2 из 3 · первые шаги')
    expect(stepLabel('groups')).toBeNull()
  })
})
