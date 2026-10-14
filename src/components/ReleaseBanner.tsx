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

  return (
    <div
      role="status"
      // над таб-баром на телефоне, в углу на компьютере
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+104px)] z-40 flex items-start gap-3 rounded-lg p-3.5 lg:right-6 lg:bottom-6 lg:left-auto lg:w-[380px]"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--timer-border)',
        boxShadow: 'var(--shadow-popover)',
      }}
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent-text)' }}
      >
        <Sparkle size={17} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-base font-semibold text-text">Вышла версия {LATEST_RELEASE.version}</span>
          <span className="text-sm leading-[1.45] text-text-secondary">
            {LATEST_RELEASE.title}. Ознакомьтесь с изменениями.
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            markSeen.mutate(LATEST_RELEASE.version)
            navigate('/changelog')
          }}
          className="h-9 self-start rounded-sm px-3.5 text-sm font-semibold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          Что нового
        </button>
      </div>
      <button
        type="button"
        onClick={() => markSeen.mutate(LATEST_RELEASE.version)}
        aria-label="Скрыть"
        className="hit-44 -mt-0.5 -mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center text-text-secondary"
      >
        <Close size={15} />
      </button>
    </div>
  )
}
