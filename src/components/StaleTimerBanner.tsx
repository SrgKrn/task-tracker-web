import { useState } from 'react'
import { useActiveTimer } from '../lib/queries/timer'
import { useTicker } from '../lib/time'
import { Close } from './Icon'

const STALE_AFTER_MS = 2 * 60 * 60 * 1000

/**
 * Баннер «забыли остановить?» внутри приложения. Раньше рядом жило и системное
 * уведомление от самой страницы — оно работало, только пока приложение открыто, а на
 * iPhone не работало вовсе. Теперь напоминания приходят пушем с сервера (через час,
 * потом каждый час) — даже при заблокированном экране.
 */
export function StaleTimerBanner() {
  const { data: activeTimer } = useActiveTimer()
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)
  // тикает, чтобы баннер появился ровно на двух часах, а не при следующей перерисовке
  useTicker(!!activeTimer)

  const elapsedMs = activeTimer ? Date.now() - new Date(activeTimer.started_at).getTime() : 0
  const stale = !!activeTimer && elapsedMs >= STALE_AFTER_MS

  if (!activeTimer || !stale) return null
  if (dismissedFor === activeTimer.started_at) return null

  const hours = Math.floor(elapsedMs / (60 * 60 * 1000))

  return (
    <div
      className="safe-top flex items-center justify-between gap-3 px-5 py-2 text-sm text-brass-600"
      style={{ background: 'var(--s-timer-bg)', borderBottom: '1px solid var(--s-accent-line)' }}
    >
      <span>Таймер идёт уже {hours} ч — забыли остановить?</span>
      <button onClick={() => setDismissedFor(activeTimer.started_at)} className="shrink-0 text-slate-400">
        <Close size={15} />
      </button>
    </div>
  )
}
