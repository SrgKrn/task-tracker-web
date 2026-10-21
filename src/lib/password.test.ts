import { describe, expect, it } from 'vitest'
import { isStrongPassword, passwordRules } from './password'

describe('пароль', () => {
  it('нужны длина, цифра, строчная и заглавная', () => {
    expect(isStrongPassword('Abcdefg1')).toBe(true)
    expect(isStrongPassword('Пароль12')).toBe(true)
    expect(isStrongPassword('Abc1')).toBe(false)
    expect(isStrongPassword('abcdefg1')).toBe(false)
    expect(isStrongPassword('ABCDEFG1')).toBe(false)
    expect(isStrongPassword('Abcdefgh')).toBe(false)
  })

  it('показывает, какого правила не хватает', () => {
    const missing = passwordRules('abcdefgh').filter((r) => !r.ok).map((r) => r.id)
    expect(missing).toEqual(['digit', 'upper'])
  })
})
