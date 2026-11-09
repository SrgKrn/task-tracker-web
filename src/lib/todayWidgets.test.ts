import { describe, expect, it } from 'vitest'
import { ALL_WIDGETS, moveWidget, normalizeWidgets, stepWidget, widgetSize, type TodayWidget } from './todayWidgets'

const order: TodayWidget[] = ['day', 'overdue', 'meetings', 'plan', 'week']

describe('moveWidget', () => {
  it('вперёд: встаёт на место цели, цель сдвигается назад', () => {
    expect(moveWidget(order, 'day', 'meetings')).toEqual(['overdue', 'meetings', 'day', 'plan', 'week'])
  })
  it('назад: встаёт перед целью', () => {
    expect(moveWidget(order, 'week', 'overdue')).toEqual(['day', 'week', 'overdue', 'meetings', 'plan'])
  })
  it('на себя или неизвестный — без изменений', () => {
    expect(moveWidget(order, 'day', 'day')).toBe(order)
    expect(moveWidget(order, 'recent', 'day')).toBe(order)
  })
})

describe('stepWidget', () => {
  it('шагает среди видимых, перепрыгивая скрытые', () => {
    expect(stepWidget(order, ['day', 'plan', 'week'], 'day', 1)).toEqual(['overdue', 'meetings', 'plan', 'day', 'week'])
  })
  it('с края не двигается', () => {
    expect(stepWidget(order, order, 'day', -1)).toBe(order)
    expect(stepWidget(order, order, 'week', 1)).toBe(order)
  })
})

describe('normalizeWidgets / widgetSize', () => {
  it('дописывает новые и отбрасывает неизвестные', () => {
    const n = normalizeWidgets({ order: ['plan', 'gone' as TodayWidget], on: ['plan', 'gone' as TodayWidget] })
    expect(n.order[0]).toBe('plan')
    expect(n.order).toHaveLength(ALL_WIDGETS.length)
    expect(n.on).toEqual(['plan'])
    expect(n.size).toEqual({})
  })
  it('размер: сохранённый или по умолчанию', () => {
    expect(widgetSize({ order, on: order }, 'plan')).toBe('full')
    expect(widgetSize({ order, on: order }, 'day')).toBe('half')
    expect(widgetSize({ order, on: order, size: { day: 'full' } }, 'day')).toBe('full')
  })
})
