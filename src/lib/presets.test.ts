import { describe, expect, it } from 'vitest'
import { BLANK_PRESET, PRESETS, presetByCode, presetPayload, presetProblems } from './presets'

describe('каталог пресетов', () => {
  it('шесть пресетов с разными кодами', () => {
    expect(PRESETS.map((p) => p.code)).toEqual(['clients', 'team', 'study', 'personal', 'project', 'sport'])
  })

  it.each([...PRESETS, BLANK_PRESET].map((p) => [p.code, p] as const))('%s: связи и примеры сходятся', (_code, p) => {
    expect(presetProblems(p)).toEqual([])
  })

  it('ловит пример без обязательной группы', () => {
    const broken = { ...PRESETS[0], examples: [{ name: 'Без клиента', planned_hours: 1, values: [{ group: 'kinds', value: 'Дизайн' }] }] }
    expect(presetProblems(broken)).toContain('clients: пример «Без клиента» без обязательной «Клиенты»')
  })

  it('методика и фокус с экрана подменяют значения пресета', () => {
    const p = presetPayload(presetByCode('clients')!, { method: 'frog', focus: 'pomodoro' })
    expect(p.settings.priority_method).toBe('frog')
    expect(p.settings.focus_mode).toBe('pomodoro')
    expect(p.settings.planned_hours_per_month).toBe(140)
  })

  it('добавление к своей структуре не делает группы обязательными', () => {
    const p = presetPayload(presetByCode('clients')!, {}, { merge: true })
    expect(p.groups.every((g) => !g.required)).toBe(true)
  })
})
