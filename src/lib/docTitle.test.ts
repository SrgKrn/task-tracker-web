import { describe, expect, it } from 'vitest'
import { documentTitle, timerLabel } from './docTitle'

describe('documentTitle', () => {
  it('называет экран', () => {
    expect(documentTitle('/')).toBe('Сегодня — Semternity')
    expect(documentTitle('/tasks')).toBe('Задачи — Semternity')
    expect(documentTitle('/tasks/new')).toBe('Новая задача — Semternity')
    expect(documentTitle('/settings/plan')).toBe('Профиль — Semternity')
    expect(documentTitle('/непонятно')).toBe('Semternity')
  })
  it('задача важнее экрана, учёт — впереди', () => {
    expect(documentTitle('/tasks/1', 'Спринт 7 ')).toBe('Спринт 7 — Semternity')
    expect(documentTitle('/', null, 3725)).toBe('▶ 1:02 · Сегодня — Semternity')
  })
  it('время без секунд', () => {
    expect(timerLabel(59)).toBe('0:00')
    expect(timerLabel(-5)).toBe('0:00')
    expect(timerLabel(36000)).toBe('10:00')
  })
})
