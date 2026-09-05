import { useEffect, useState } from 'react'
import { Eye, EyeOff } from '../components/Icon'
import { FieldLabel, Logo, Segmented } from '../components/ui'
import { supabase } from '../lib/supabaseClient'

type Mode = 'signin' | 'signup'
type Screen = Mode | 'reset' | 'newPassword'

const MIN_PASSWORD = 6

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
  const passwordTooShort = screen !== 'signin' && password.length > 0 && password.length < MIN_PASSWORD

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

  const fieldStyle = { background: '#0f0f13', border: '1px solid var(--s-border-strong)' }

  return (
    <div className="safe-top safe-bottom flex min-h-full flex-col items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex flex-col items-center gap-3">
          <Logo size={44} />
          <span className="text-lg font-semibold tracking-[.01em] text-slate-100">Semternity</span>
        </div>

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
          <h1 className="text-xl font-semibold leading-[1.2] tracking-[-.02em] text-slate-100">{title}</h1>
          <p className="text-xs leading-[1.5] text-slate-500" style={{ textWrap: 'pretty' }}>
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
                className="h-[46px] rounded-[14px] px-3.5 text-base text-slate-100 placeholder:text-[#83838c]"
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
                    className="text-2xs text-slate-500"
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
                  placeholder={screen === 'signin' ? 'Ваш пароль' : `Минимум ${MIN_PASSWORD} символов`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-[46px] w-full rounded-[14px] pr-12 pl-3.5 text-base text-slate-100 placeholder:text-[#83838c]"
                  style={fieldStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  className="absolute top-1/2 right-1 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[12px] text-slate-500"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {passwordTooShort && (
                <span className="text-2xs text-slate-500">
                  Ещё {MIN_PASSWORD - password.length} симв. до минимума
                </span>
              )}
            </div>
          )}

          {error && (
            <p
              className="rounded-xl px-3 py-2.5 text-xs leading-[1.5] text-red-400"
              style={{ background: 'rgba(217,114,86,.1)', border: '1px solid rgba(217,114,86,.35)' }}
              role="alert"
            >
              {error}
            </p>
          )}
          {info && (
            <p
              className="rounded-xl px-3 py-2.5 text-xs leading-[1.5] text-emerald-400"
              style={{ background: 'rgba(127,184,148,.1)', border: '1px solid rgba(127,184,148,.3)' }}
              role="status"
            >
              {info}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-12 rounded-[15px] text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
          >
            {submitLabel}
          </button>

          {!isAuthMode && (
            <button
              type="button"
              onClick={() => goTo('signin')}
              className="py-1 text-xs text-slate-500"
            >
              Вернуться ко входу
            </button>
          )}
        </form>

        {screen === 'signup' && (
          <p className="text-center text-2xs leading-[1.5] text-slate-600" style={{ textWrap: 'pretty' }}>
            Аккаунт нужен только для синхронизации — данные видны вам одному.
          </p>
        )}
      </div>
    </div>
  )
}
