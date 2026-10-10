import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Close, Sparkle } from './Icon'
import { useAuth } from '../lib/AuthContext'
import { LATEST_RELEASE } from '../lib/changelog'
import { useMarkReleaseSeen, useUserSettings } from '../lib/queries/userSettings'

/**
 * «Вышла новая версия» — при первом входе после обновления. Что уже видели, хранится
 * в настройках пользователя, поэтому на втором устройстве уведомление не повторится.
 */
export function ReleaseBanner() {
  const { session } = useAuth()
  const { data: settings, isFetched } = useUserSettings()
  const markSeen = useMarkReleaseSeen()
  const navigate = useNavigate()
  const location = useLocation()

  const seen = settings?.seen_release ?? null
  const unseen = isFetched && seen !== LATEST_RELEASE.version
  // аккаунт заведён уже после выхода версии — показывать «что нового» нечему
  const freshAccount =
    !!session?.user.created_at && session.user.created_at.slice(0, 10) >= LATEST_RELEASE.date

  useEffect(() => {
    if (unseen && freshAccount) markSeen.mutate(LATEST_RELEASE.version)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseen, freshAccount])

  if (!unseen || freshAccount || location.pathname === '/changelog') return null

  const more = LATEST_RELEASE.changes.length - 2
  const highlights = LATEST_RELEASE.changes
    .slice(0, 2)
    .map((c) => c.title.toLowerCase())
    .join(', ')

  return (
    <div
      role="status"
      // над таб-баром на телефоне, в углу на компьютере
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+104px)] z-40 flex items-start gap-3 rounded-[20px] p-3.5 lg:right-6 lg:bottom-6 lg:left-auto lg:w-[380px]"
      style={{
        background: 'var(--s-surface)',
        border: '1px solid var(--s-accent-line)',
        boxShadow: 'var(--s-pop-shadow)',
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
        style={{ background: 'var(--s-accent-ghost)', color: 'var(--s-accent-text)' }}
      >
        <Sparkle size={17} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-slate-100">Вышла версия {LATEST_RELEASE.version}</span>
          <span className="text-xs leading-[1.45] text-slate-400">
            {highlights.charAt(0).toUpperCase() + highlights.slice(1)}
            {more > 0 ? ` и ещё ${more}` : ''}. Ознакомьтесь с изменениями.
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            markSeen.mutate(LATEST_RELEASE.version)
            navigate('/changelog')
          }}
          className="h-9 self-start rounded-[11px] px-3.5 text-xs font-semibold"
          style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
        >
          Что нового
        </button>
      </div>
      <button
        type="button"
        onClick={() => markSeen.mutate(LATEST_RELEASE.version)}
        aria-label="Скрыть"
        className="hit-44 -mt-0.5 -mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-slate-500"
      >
        <Close size={15} />
      </button>
    </div>
  )
}
