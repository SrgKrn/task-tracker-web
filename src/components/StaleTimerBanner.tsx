import { useEffect, useRef, useState } from 'react'
import { useActiveTimer } from '../lib/queries/timer'
import { Close } from './Icon'

const STALE_AFTER_MS = 2 * 60 * 60 * 1000

/**
 * Системное уведомление в дополнение к баннеру: баннер виден, только если приложение
 * открыто на этом экране, а вкладка часто просто свёрнута. Разрешение спрашиваем не
 * заранее, а в момент, когда уведомление действительно нужно.
 *
 * Ограничение: это уведомление от самой страницы, поэтому оно работает, пока приложение
 * запущено (в том числе в фоновой вкладке). Полностью закрытое приложение разбудить
 * может только Web Push — это отдельный сервер и ключи VAPID.
 */
function useStaleNotification(startedAt: string | undefined, stale: boolean) {
  const notifiedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!stale || !startedAt) return
    if (notifiedFor.current === startedAt) return
    if (typeof Notification === 'undefined') return

    notifiedFor.current = startedAt

    const show = () => {
      // экран уже перед глазами — хватит баннера, не дублируем системным уведомлением
      if (document.visibilityState === 'visible') return
      try {
        new Notification('Semternity — учёт всё ещё идёт', {
          body: 'Таймер запущен больше двух часов назад. Остановить?',
          tag: `stale-timer-${startedAt}`,
        })
      } catch {
        // на iOS уведомления доступны только установленному PWA — молча пропускаем
      }
    }

    if (Notification.permission === 'granted') show()
    else if (Notification.permission === 'default') Notification.requestPermission().then(show)
  }, [stale, startedAt])
}

export function StaleTimerBanner() {
  const { data: activeTimer } = useActiveTimer()
  const [dismissedFor, setDismissedFor] = useState<string | null>(null)

  const elapsedMs = activeTimer ? Date.now() - new Date(activeTimer.started_at).getTime() : 0
  const stale = !!activeTimer && elapsedMs >= STALE_AFTER_MS
  useStaleNotification(activeTimer?.started_at, stale)

  if (!activeTimer || !stale) return null
  if (dismissedFor === activeTimer.started_at) return null

  const hours = Math.floor(elapsedMs / (60 * 60 * 1000))

  return (
    <div
      className="safe-top flex items-center justify-between gap-3 px-5 py-2 text-sm text-sky-600"
      style={{ background: '#17130c', borderBottom: '1px solid rgba(232,163,61,.4)' }}
    >
      <span>Таймер идёт уже {hours} ч — забыли остановить?</span>
      <button onClick={() => setDismissedFor(activeTimer.started_at)} className="shrink-0 text-slate-400">
        <Close size={15} />
      </button>
    </div>
  )
}
