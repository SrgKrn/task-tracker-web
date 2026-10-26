import { describe, expect, it } from 'vitest'
import { navDepth, navDirection } from './navMotion'

describe('направление перехода', () => {
  it('вкладки — один уровень', () => {
    expect(navDepth('/')).toBe(0)
    expect(navDepth('/tasks')).toBe(0)
    expect(navDepth('/dashboard')).toBe(0)
    expect(navDirection('/', '/tasks')).toBe('tab')
    expect(navDirection('/tasks', '/focus')).toBe('tab')
  })

  it('карточка и профиль — вглубь, обратно — назад', () => {
    expect(navDirection('/tasks', '/tasks/abc')).toBe('forward')
    expect(navDirection('/tasks/abc', '/tasks')).toBe('back')
    expect(navDirection('/', '/settings')).toBe('forward')
    expect(navDirection('/settings', '/settings/profile')).toBe('forward')
    expect(navDirection('/settings/profile', '/settings')).toBe('back')
  })

  it('соседняя карточка: вперёд по ссылке, назад системной кнопкой', () => {
    expect(navDirection('/tasks/a', '/tasks/b')).toBe('forward')
    expect(navDirection('/tasks/a', '/tasks/b', true)).toBe('back')
    expect(navDirection('/tasks/a', '/tasks/a')).toBe('none')
  })
})
