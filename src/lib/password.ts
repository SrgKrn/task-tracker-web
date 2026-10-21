/**
 * Правила нового пароля: не короче 8 символов, есть цифра, строчная и заглавная буква
 * (латиница или кириллица). Вход по старому паролю правила не проверяют.
 */

export const MIN_PASSWORD = 8

export interface PasswordRule {
  id: 'length' | 'digit' | 'lower' | 'upper'
  label: string
  ok: boolean
}

export function passwordRules(password: string): PasswordRule[] {
  return [
    { id: 'length', label: `От ${MIN_PASSWORD} символов`, ok: password.length >= MIN_PASSWORD },
    { id: 'digit', label: 'Цифра', ok: /\d/.test(password) },
    { id: 'lower', label: 'Строчная буква', ok: /\p{Ll}/u.test(password) },
    { id: 'upper', label: 'Заглавная буква', ok: /\p{Lu}/u.test(password) },
  ]
}

export function isStrongPassword(password: string): boolean {
  return passwordRules(password).every((r) => r.ok)
}
