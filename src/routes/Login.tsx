import { useEffect, useState, type CSSProperties } from 'react'
import { Eye, EyeOff } from '../components/Icon'
import { FieldLabel, Segmented } from '../components/ui'
import { PasswordRules } from '../components/PasswordRules'
import { MIN_PASSWORD, isStrongPassword } from '../lib/password'
import { supabase } from '../lib/supabaseClient'

/** поле входа: почта, пароль, повтор пароля */
const FIELD =
  'h-[46px] rounded-sm border border-border bg-surface text-[length:var(--input-size)] text-text placeholder:text-text-tertiary focus:border-accent'

type Mode = 'signin' | 'signup'
type Screen = Mode | 'reset' | 'newPassword'


/**
 * Supabase отдаёт ошибки строками на английском («Invalid login credentials»).
 * Показывать их пользователю нельзя — это внутренняя диагностика, а не сообщение.
 */
function describeAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Неверная почта или пароль.'
  if (m.includes('email not confirmed')) return 'Почта ещё не подтверждена — проверьте письмо.'
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Такая почта уже зарегистрирована. Попробуйте войти.'
  }
  if (m.includes('password should contain') || m.includes('weak')) {
    return 'Пароль: от 8 символов, с цифрой, строчной и заглавной буквой.'
  }
  if (m.includes('password should be at least')) {
    return `Пароль должен быть не короче ${MIN_PASSWORD} символов.`
  }
  if (m.includes('unable to validate email') || m.includes('invalid format')) {
    return 'Проверьте формат почты.'
  }
  if (m.includes('for security purposes') || m.includes('rate limit') || m.includes('too many')) {
    return 'Слишком часто. Подождите минуту и попробуйте снова.'
  }
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return 'Нет связи с сервером. Проверьте интернет.'
  }
  return 'Не получилось. Попробуйте ещё раз.'
}

export function Login() {
  const [screen, setScreen] = useState<Screen>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // переход по ссылке восстановления приводит сюда с особой сессией —
  // тогда вместо входа нужно спросить новый пароль
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setScreen('newPassword')
        setPassword('')
        setRepeat('')
        setInfo(null)
        setError(null)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  function goTo(next: Screen) {
    setScreen(next)
    setError(null)
    setInfo(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    // новый пароль — по правилам и дважды; вход старым паролем не проверяем
    if (newPassword && !isStrongPassword(password)) {
      return setError('Пароль: от 8 символов, с цифрой, строчной и заглавной буквой.')
    }
    if (newPassword && password !== repeat) return setError('Пароли не совпадают.')
    setLoading(true)
    try {
      if (screen === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (screen === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        // подтверждение почты может быть выключено в настройках проекта: если сессия
        // пришла сразу, пользователь уже внутри и просить его «проверить почту» — врать
        if (!data.session) setInfo('Проверьте почту — мы отправили ссылку для подтверждения.')
      } else if (screen === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/login',
        })
        if (error) throw error
        setInfo('Отправили ссылку для смены пароля на указанную почту.')
      } else {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        setInfo('Пароль обновлён.')
      }
    } catch (err) {
      setError(describeAuthError(err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
    }
  }

  const isAuthMode = screen === 'signin' || screen === 'signup'
  const needsPassword = screen !== 'reset'
  const newPassword = screen === 'signup' || screen === 'newPassword'

  const submitLabel = loading
    ? 'Секунду…'
    : screen === 'signin'
      ? 'Войти'
      : screen === 'signup'
        ? 'Создать аккаунт'
        : screen === 'reset'
          ? 'Прислать ссылку'
          : 'Сохранить пароль'

  const title =
    screen === 'reset'
      ? 'Восстановление'
      : screen === 'newPassword'
        ? 'Новый пароль'
        : screen === 'signin'
          ? 'С возвращением'
          : 'Заведём аккаунт'

  const subtitle =
    screen === 'reset'
      ? 'Пришлём ссылку для смены пароля на почту, с которой вы регистрировались.'
      : screen === 'newPassword'
        ? 'Придумайте пароль, с которым будете входить дальше.'
        : screen === 'signin'
          ? 'Учёт часов и задач — там же, где вы его оставили.'
          : 'Данные привязаны к почте и синхронизируются между устройствами.'

  const fieldStyle = { background: 'var(--surface)', border: '1px solid var(--border-strong)' }

  return (
    <div className="safe-top-page safe-bottom flex min-h-full flex-col items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <IntroBrand />

        <div className="intro-rise flex flex-col gap-6">
        {isAuthMode && (
          <Segmented
            className="self-center"
            value={screen}
            onChange={goTo}
            options={[
              { value: 'signin', label: 'Вход' },
              { value: 'signup', label: 'Регистрация' },
            ]}
          />
        )}

        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-xl font-semibold leading-[1.2] tracking-[-.02em] text-text">{title}</h1>
          <p className="text-sm leading-[1.5] text-text-secondary" style={{ textWrap: 'pretty' }}>
            {subtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          {screen !== 'newPassword' && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Почта</FieldLabel>
              <input
                type="email"
                required
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`${FIELD} px-3.5`}
                style={fieldStyle}
              />
            </div>
          )}

          {needsPassword && (
            <div className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between">
                <FieldLabel>Пароль</FieldLabel>
                {screen === 'signin' && (
                  <button
                    type="button"
                    onClick={() => goTo('reset')}
                    className="text-xs text-text-secondary"
                  >
                    Забыли пароль?
                  </button>
                )}
              </span>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={screen === 'signin' ? undefined : MIN_PASSWORD}
                  autoComplete={screen === 'signin' ? 'current-password' : 'new-password'}
                  placeholder={screen === 'signin' ? 'Ваш пароль' : `Не короче ${MIN_PASSWORD} символов`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${FIELD} w-full pr-12 pl-3.5`}
                  style={fieldStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  className="absolute top-1/2 right-1 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-sm text-text-secondary"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {newPassword && (
                <>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Пароль ещё раз"
                    aria-label="Пароль ещё раз"
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                    className={`${FIELD} mt-1 w-full px-3.5`}
                    style={fieldStyle}
                  />
                  <PasswordRules password={password} repeat={repeat} />
                </>
              )}
            </div>
          )}

          {error && (
            <p
              className="rounded-sm px-3 py-2.5 text-sm leading-[1.5] text-danger-text"
              style={{ background: 'var(--danger-soft)', border: '1px solid var(--danger-line)' }}
              role="alert"
            >
              {error}
            </p>
          )}
          {info && (
            <p
              className="rounded-sm px-3 py-2.5 text-sm leading-[1.5] text-success-text"
              style={{ background: 'var(--success-soft)', border: '1px solid var(--success-line)' }}
              role="status"
            >
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-sm text-base font-semibold disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {submitLabel}
          </button>

          {!isAuthMode && (
            <button
              type="button"
              onClick={() => goTo('signin')}
              className="py-1 text-sm text-text-secondary"
            >
              Вернуться ко входу
            </button>
          )}
        </form>

        {screen === 'signup' && (
          <p className="text-center text-sm leading-[1.5] text-text-secondary" style={{ textWrap: 'pretty' }}>
            Аккаунт нужен только для синхронизации — данные видны вам одному.
          </p>
        )}
        </div>
      </div>
    </div>
  )
}

const APP_NAME = 'Semternity'

/** Лого и название с заставкой: дуга рисуется, ядро и точка проявляются, буквы набираются. */
function IntroBrand() {
  const color = 'var(--accent)'
  return (
    <div className="flex flex-col items-center gap-3">
      <svg width={44} height={44} viewBox="0 0 32 32" fill="none" className="shrink-0" aria-hidden="true" focusable="false">
        <path
          className="intro-arc"
          pathLength={1}
          d="M11.4 7.9a9 9 0 1 0 9.2 0"
          stroke={color}
          strokeWidth={2.2}
          strokeLinecap="round"
        />
        <g opacity={0.45}>
          <circle className="intro-core" cx="16" cy="16" r="4.1" stroke={color} strokeWidth={0.8} />
        </g>
        <circle className="intro-dot" cx="16" cy="7" r="1.8" fill={color} />
      </svg>
      <span className="text-lg font-semibold tracking-[.01em] text-text">
        <span className="sr-only">{APP_NAME}</span>
        {[...APP_NAME].map((ch, i) => (
          <span key={i} className="intro-letter" aria-hidden="true" style={{ '--i': i } as CSSProperties}>
            {ch}
          </span>
        ))}
      </span>
    </div>
  )
}
