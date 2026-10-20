import { describe, expect, it } from 'vitest'
import { PLANS, effectivePlan, formatPrice, monthlyPrice, recommendPlan, yearlySaving } from './plans'

const plus = PLANS.find((p) => p.id === 'plus')!
const pro = PLANS.find((p) => p.id === 'pro')!
const free = PLANS.find((p) => p.id === 'free')!

describe('plans', () => {
  it('сетка: Старт, Плюс, Про', () => {
    expect(PLANS.map((p) => p.name)).toEqual(['Старт', 'Плюс', 'Про'])
  })

  it('годовая оплата — сумма за год на 12', () => {
    expect(monthlyPrice(plus, 'usd', 'year')).toBe(3)
    expect(monthlyPrice(plus, 'usd', 'month')).toBe(3.99)
    expect(monthlyPrice(pro, 'usd', 'year')).toBe(6)
    expect(monthlyPrice(pro, 'byn', 'year')).toBe(18)
    expect(monthlyPrice(pro, 'byn', 'month')).toBe(24)
    expect(monthlyPrice(free, 'usd', 'year')).toBe(0)
  })

  it('формат цены', () => {
    expect(formatPrice(3, 'usd')).toBe('$3')
    expect(formatPrice(7.99, 'usd')).toBe('$7,99')
    expect(formatPrice(108, 'byn')).toBe('108 BYN')
  })

  it('скидка за год — 25 % у обоих тарифов в обеих валютах', () => {
    for (const p of [plus, pro]) for (const c of ['usd', 'byn'] as const) expect(yearlySaving(p, c)).toBe(25)
  })

  it('пожизненный действует как «Про»', () => {
    expect(effectivePlan('lifetime')).toBe('pro')
    expect(effectivePlan('plus')).toBe('plus')
  })
})

describe('recommendPlan', () => {
  it('есть работа с клиентами — Про', () => {
    expect(recommendPlan([{ client_work: false }, { client_work: true }]).plan).toBe('pro')
  })
  it('несколько пространств без клиентов — Плюс', () => {
    expect(recommendPlan([{ client_work: false }, { client_work: false }]).plan).toBe('plus')
  })
  it('одно пространство — Старт', () => {
    expect(recommendPlan([{ client_work: false }]).plan).toBe('free')
  })
})
