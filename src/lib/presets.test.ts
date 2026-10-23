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
    const base = presetByCode('clients')!
    const broken = {
      ...base,
      groups: base.groups.map((g) => ({ ...g, required: true })),
      examples: [{ name: 'Без клиента', planned_hours: 1, values: [] }],
    }
    expect(presetProblems(broken)).toContain('clients: пример «Без клиента» без обязательной «Клиенты»')
  })

  it('0.43: в заготовках нет обязательных групп, связей, примеров и нормы', () => {
    for (const p of [...PRESETS, BLANK_PRESET]) {
      expect(p.groups.length).toBeLessThanOrEqual(2)
      expect(p.groups.every((g) => !g.required && !g.parent)).toBe(true)
      expect(p.groups.flatMap((g) => g.values).some((v) => v.example)).toBe(false)
      expect(p.examples).toEqual([])
      expect(p.settings.planned_hours_per_day ?? p.settings.planned_hours_per_month).toBeNull()
      expect(p.settings.priority_method).toBe('none')
    }
    expect(BLANK_PRESET.groups).toEqual([])
  })

  it('методика и фокус с экрана подменяют значения пресета', () => {
    const p = presetPayload(presetByCode('clients')!, { method: 'frog', focus: '9030' })
    expect(p.settings.priority_method).toBe('frog')
    expect(p.settings.focus_mode).toBe('9030')
  })

  it('добавление к своей структуре не делает группы обязательными', () => {
    const p = presetPayload(presetByCode('clients')!, {}, { merge: true })
    expect(p.groups.every((g) => !g.required)).toBe(true)
  })
})
