import { passwordRules } from '../lib/password'
import { Check } from './Icon'

/**
 * Правила нового пароля галочками под полем и проверка повтора. Повтор показываем,
 * только когда его начали вводить: пустое поле — ещё не ошибка.
 */
export function PasswordRules({ password, repeat }: { password: string; repeat: string }) {
  const mismatch = repeat.length > 0 && repeat !== password
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {passwordRules(password).map((r) => (
          <li
            key={r.id}
            className={`flex items-center gap-1 text-xs ${r.ok ? 'text-success-text' : 'text-text-tertiary'}`}
          >
            <Check size={12} className={r.ok ? '' : 'opacity-40'} />
            {r.label}
          </li>
        ))}
      </ul>
      {mismatch && <span className="text-xs text-danger-text">Пароли не совпадают</span>}
    </div>
  )
}
