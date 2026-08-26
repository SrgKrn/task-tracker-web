import { useState } from 'react'
import { useActiveTimer } from '../lib/queries/timer'

const STALE_AFTER_MS = 2 * 60 * 60 * 1000

export function StaleTimerBanner() {
  const { data: activeTimer } = useActiveTimer()
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)

  if (!activeTimer) return null

  const elapsedMs = Date.now() - new Date(activeTimer.started_at).getTime()
  if (elapsedMs < STALE_AFTER_MS) return null
  if (dismissedFor === activeTimer.started_at) return null

  const hours = Math.floor(elapsedMs / (60 * 60 * 1000))

  return (
    <div className="safe-top flex items-center justify-between gap-3 border-b border-sky-600/40 bg-sky-600/10 px-4 py-2 text-sm text-sky-600">
      <span>Таймер идёт уже {hours} ч — забыли остановить?</span>
      <button onClick={() => setDismissedFor(activeTimer.started_at)} className="shrink-0 text-slate-400">
        ✕
      </button>
    </div>
  )
}
