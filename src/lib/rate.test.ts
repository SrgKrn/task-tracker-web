import { describe, expect, it } from 'vitest'
import { billSprint, billTotals, formatMoney, resolveRate } from './rate'

const items = [
  { id: 'c1', name: 'А-Лизинг', group_id: 'clients', hourly_rate: 40, rate_currency: 'BYN' },
  { id: 's1', name: 'Внедрение', group_id: 'sections', hourly_rate: 99, rate_currency: 'USD' },
  { id: 'c2', name: 'Без ставки', group_id: 'clients', hourly_rate: null, rate_currency: null },
]
const order = ['clients', 'sections']

describe('resolveRate', () => {
  it('своя ставка спринта важнее клиента', () => {
    const r = resolveRate({ item_ids: ['c1'], hourly_rate: 50, rate_currency: 'USD' }, items, order)
    expect(r).toEqual({ rate: 50, currency: 'USD', source: 'task' })
  })
  it('без своей — первая по порядку групп', () => {
    const r = resolveRate({ item_ids: ['s1', 'c1'], hourly_rate: null, rate_currency: null }, items, order)
    expect(r?.rate).toBe(40)
    expect(r?.itemName).toBe('А-Лизинг')
  })
  it('нигде не задана — null', () => {
    expect(resolveRate({ item_ids: ['c2'], hourly_rate: null, rate_currency: null }, items, order)).toBeNull()
  })
})

describe('billSprint', () => {
  const rate = { rate: 40, currency: 'BYN' as const, source: 'item' as const }
  it('с планом: до плана в сумму, переработка отдельно', () => {
    expect(billSprint(rate, 20, 25, 25)).toMatchObject({ hours: 20, amount: 800, overHours: 5, overAmount: 200 })
  })
  it('в плане — переработки нет', () => {
    expect(billSprint(rate, 20, 12.5, 12.5)).toMatchObject({ hours: 12.5, amount: 500, overHours: 0 })
  })
  it('без плана — часы периода', () => {
    expect(billSprint(rate, 0, 100, 7.25)).toMatchObject({ hours: 7.25, amount: 290, overHours: 0 })
  })
  it('без ставки — null', () => {
    expect(billSprint(null, 20, 10, 10)).toBeNull()
  })
})

describe('billTotals', () => {
  it('по валютам и с выбором переработки', () => {
    const a = billSprint({ rate: 40, currency: 'BYN', source: 'item' }, 20, 25, 25)
    const b = billSprint({ rate: 30, currency: 'USD', source: 'item' }, 0, 10, 10)
    const off = billTotals([a, b, null], false)
    expect(off.map((t) => [t.currency, t.due])).toEqual([['BYN', 800], ['USD', 300]])
    expect(billTotals([a], true)[0].due).toBe(1000)
  })
})

describe('formatMoney', () => {
  it('тысячи и копейки', () => {
    expect(formatMoney(1250.5, 'BYN')).toBe('1 250,50 BYN')
    expect(formatMoney(40, 'USD')).toBe('$40')
  })
})
