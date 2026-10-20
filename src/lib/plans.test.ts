import { describe, expect, it } from 'vitest'
import { PLANS, effectivePlan, formatPrice, monthlyPrice, yearlySaving } from './plans'

const pro = PLANS.find((p) => p.id === 'pro')!
const studio = PLANS.find((p) => p.id === 'studio')!
const free = PLANS.find((p) => p.id === 'free')!

describe('plans', () => {
  it('годовая оплата — сумма за год на 12', () => {
    expect(monthlyPrice(pro, 'usd', 'year')).toBe(4)
    expect(monthlyPrice(pro, 'byn', 'year')).toBe(12)
    expect(monthlyPrice(studio, 'usd', 'month')).toBe(9)
    expect(monthlyPrice(free, 'usd', 'year')).toBe(0)
  })

  it('формат цены', () => {
    expect(formatPrice(4, 'usd')).toBe('$4')
    expect(formatPrice(21, 'byn')).toBe('21 BYN')
    expect(formatPrice(7.5, 'usd')).toBe('$7,5')
  })

  it('скидка за год', () => {
    expect(yearlySaving(pro, 'usd')).toBe(20)
    expect(yearlySaving(studio, 'byn')).toBe(22)
  })

  it('пожизненный действует как «Студия»', () => {
    expect(effectivePlan('lifetime')).toBe('studio')
    expect(effectivePlan('pro')).toBe('pro')
  })
})
