import { describe, expect, it } from 'vitest'
import { stageTone } from './stage'
import type { Status } from './types'

const st = (id: string, sort_order: number, is_final = false) => ({ id, label: id, sort_order, is_final }) as Status

describe('stageTone', () => {
  it('пять этапов: первый — к выполнению, средние — в работе, финальный — готово', () => {
    const all = [st('100', 4, true), st('0', 0), st('25', 1), st('50', 2), st('75', 3)]
    expect(stageTone(all[1], all)).toBe('todo')
    expect(stageTone(all[2], all)).toBe('progress')
    expect(stageTone(all[4], all)).toBe('progress')
    expect(stageTone(all[0], all)).toBe('done')
  })

  it('«В работе / Готово»: единственный нефинальный — в работе, а не серый', () => {
    const all = [st('work', 0), st('done', 1, true)]
    expect(stageTone(all[0], all)).toBe('progress')
    expect(stageTone(all[1], all)).toBe('done')
  })
})
