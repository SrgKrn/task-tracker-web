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
    expect(monthlyPrice(plus, 'usd', 'year')).toBe(2.5)
    expect(monthlyPrice(pro, 'byn', 'month')).toBe(21)
    expect(monthlyPrice(free, 'usd', 'year')).toBe(0)
  })

  it('формат цены', () => {
    expect(formatPrice(2.5, 'usd')).toBe('$2,5')
    expect(formatPrice(21, 'byn')).toBe('21 BYN')
  })

  it('скидка за год', () => {
    expect(yearlySaving(plus, 'usd')).toBe(17)
    expect(yearlySaving(pro, 'usd')).toBe(21)
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
