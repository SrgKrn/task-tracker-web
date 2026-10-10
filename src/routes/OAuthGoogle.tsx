import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/ui'
import { describeError } from '../lib/Toast'
import { exchangeGoogleCode, googleServiceOf } from '../lib/google'

/**
 * Сюда Google возвращает после входа. Страница может открыться и не в самом приложении
 * (на iPhone вход идёт в отдельном окне браузера) — поэтому пользователя узнаём по
 * одноразовому state, а не по сессии, и в конце просим вернуться в Semternity.
 * Что подключали — Диск или Календарь — тоже записано в state.
 */
export function OAuthGoogle() {
  const params = new URLSearchParams(window.location.search)
  const service = googleServiceOf(params.get('state') ?? '')
  const what = service === 'calendar' ? 'Google Календарь' : 'Google Диск'
  const [state, setState] = useState<{ kind: 'working' | 'ok' | 'error'; text: string }>({
    kind: 'working',
    text: `Подключаем ${what}…`,
  })

  useEffect(() => {
    const code = params.get('code')
    const st = params.get('state')
    if (params.get('error')) {
      setState({ kind: 'error', text: `Вход в Google отменён — ${what} не подключён.` })
      return
    }
    if (!code || !st) {
      setState({ kind: 'error', text: 'Google не прислал код входа — попробуйте подключить ещё раз.' })
      return
    }
    exchangeGoogleCode(code, st)
      .then((r) =>
        setState({
          kind: 'ok',
          text:
            `${what} подключён${r.email ? `: ${r.email}` : ''}.` +
            (r.service === 'calendar' && r.events ? ` Встреч на неделе — ${r.events}.` : ''),
        }),
      )
      .catch((e) => setState({ kind: 'error', text: describeError(e) }))
  }, [])

  return (
    <div className="safe-top mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo size={40} />
      <p className={`text-base leading-[1.5] ${state.kind === 'error' ? 'text-red-400' : 'text-slate-100'}`}>{state.text}</p>
      {state.kind !== 'working' && (
        <>
          {state.kind === 'ok' && (
            <p className="text-sm leading-[1.5] text-slate-500">
              Если это окно открылось поверх приложения — закройте его и вернитесь в Semternity.
            </p>
          )}
          <Link
            to={service === 'calendar' ? '/settings/calendar' : '/settings/drive'}
            className="flex h-11 items-center rounded-[14px] px-6 text-sm font-semibold"
            style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
          >
            Открыть Semternity
          </Link>
        </>
      )}
    </div>
  )
}
