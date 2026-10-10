import { useEffect } from 'react'
import { useTimerQueueSync } from '../lib/queries/timer'
import { useNetworkState } from '../lib/timerQueue'
import { useToast } from '../lib/Toast'
import { plural } from '../lib/time'

const ACTIONS: [string, string, string] = ['нажатие', 'нажатия', 'нажатий']

/**
 * Нет сети — видно сразу, а не по ошибке после нажатия. Учёт при этом работает: старт
 * и стоп ложатся в очередь и уходят на сервер, когда связь вернётся.
 */
export function NetworkBanner() {
  const { online, pending } = useNetworkState()
  const { showError } = useToast()
  const sync = useTimerQueueSync((failed) =>
    showError(`Не удалось сохранить учёт, нажатый без сети: ${failed[0]}`),
  )

  // связь вернулась или приложение открыли с непустой очередью — отправить
  useEffect(() => {
    // sync пересоздаётся на каждую отрисовку, а нужен ровно при смене сети и очереди
    if (online && pending > 0) void sync()
  }, [online, pending])

  if (online && pending === 0) return null

  return (
    <div
      role="status"
      className="safe-top flex items-center gap-2 px-5 py-2 text-xs"
      style={{ background: 'var(--s-surface-2)', borderBottom: '1px solid var(--s-border)', color: 'var(--s-text-soft)' }}
    >
      <span
        className="h-[7px] w-[7px] shrink-0 rounded-full"
        style={{ background: online ? 'var(--s-accent)' : 'var(--s-danger-text)' }}
      />
      {online
        ? `Отправляем учёт: ${plural(pending, ACTIONS)}…`
        : pending > 0
          ? `Нет сети — учёт сохранится, когда связь вернётся (${plural(pending, ACTIONS)} ждёт)`
          : 'Нет сети — учёт можно запускать и останавливать, он сохранится позже'}
    </div>
  )
}
