import { describe, expect, it } from 'vitest'
import sql from '../../supabase/migrations/0032_plan_limits.sql?raw'
import { PLAN_LIMITS, cheapestWith, planLimitMessage } from './limits'

/** Лимиты из миграции: JSON после ('free', '…') и т. д. */
function migrationLimits(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const m of sql.matchAll(/\('(free|plus|pro)', '(\{[\s\S]*?\})'\)/g)) out[m[1]] = JSON.parse(m[2])
  return out
}

describe('limits', () => {
  it('таблица в приложении совпадает с миграцией', () => {
    expect(migrationLimits()).toEqual(PLAN_LIMITS)
  })

  it('решения чек-листа', () => {
    expect([PLAN_LIMITS.free.workspaces, PLAN_LIMITS.plus.workspaces, PLAN_LIMITS.pro.workspaces]).toEqual([1, 3, 5])
    expect([PLAN_LIMITS.free.groups, PLAN_LIMITS.plus.groups, PLAN_LIMITS.pro.groups]).toEqual([3, 5, null])
    expect(PLAN_LIMITS.plus.gcal).toBe(false)
    expect(PLAN_LIMITS.free.history_days).toBe(365)
  })

  it('где возможность появляется', () => {
    expect(cheapestWith('export')).toBe('plus')
    expect(cheapestWith('client_work')).toBe('pro')
    expect(cheapestWith('timer')).toBe('free')
  })

  it('сообщения об отказе', () => {
    expect(planLimitMessage('plan_limit:workspaces')).toContain('на «Плюсе» — 3')
    expect(planLimitMessage('plan_limit:storage_mb')).toContain('1 ГБ')
    expect(planLimitMessage('plan_limit:groups')).toContain('без ограничений')
    expect(planLimitMessage('plan_limit:nope')).toBeNull()
  })
})
