import { useState } from 'react'
import { Logo } from '../components/ui'
import { supabase } from '../lib/supabaseClient'

export function Login() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setInfo(null)
    setLoading(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setInfo('Проверьте почту — нужно подтвердить регистрацию.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Что-то пошло не так')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="safe-top safe-bottom flex min-h-full items-center justify-center px-5">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-3.5">
        <div className="mb-2 flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-lg font-semibold tracking-[.01em] text-slate-100">Semternity</span>
        </div>

        <h1 className="text-2xl font-semibold leading-[1.2] tracking-[-.02em] text-slate-100">
          {mode === 'signin' ? 'Вход' : 'Регистрация'}
        </h1>

        <input
          type="email"
          required
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-[46px] rounded-[14px] px-3.5 text-base text-slate-100 placeholder:text-[#83838c]"
          style={{ background: '#0f0f13', border: '1px solid var(--s-border-strong)' }}
        />
        <input
          type="password"
          required
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-[46px] rounded-[14px] px-3.5 text-base text-slate-100 placeholder:text-[#83838c]"
          style={{ background: '#0f0f13', border: '1px solid var(--s-border-strong)' }}
        />

        {error && <p className="text-sm text-red-400">{error}</p>}
        {info && <p className="text-sm text-emerald-400">{info}</p>}

        <button
          type="submit"
          disabled={loading}
          className="h-12 rounded-[15px] text-sm font-semibold disabled:opacity-50"
          style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
        >
          {mode === 'signin' ? 'Войти' : 'Создать аккаунт'}
        </button>

        <button
          type="button"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          className="text-sm text-slate-400"
        >
          {mode === 'signin' ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти'}
        </button>
      </form>
    </div>
  )
}
