import type { ActiveTimer } from '../lib/types'

interface TimerButtonProps {
  taskId: string
  activeTimer: ActiveTimer | null | undefined
  onStart: () => void
  onStop: () => void
}

/** Главное действие карточки: латунь с квадратом-стопом при учёте, контур с треугольником в покое. */
export function TimerButton({ taskId, activeTimer, onStart, onStop }: TimerButtonProps) {
  const isRunning = activeTimer?.task_id === taskId

  return (
    <button
      type="button"
      onClick={isRunning ? onStop : onStart}
      className="flex h-[42px] w-full items-center justify-center gap-[9px] rounded-[13px] text-sm font-semibold"
      style={{
        background: isRunning ? 'var(--s-accent)' : 'transparent',
        border: '1px solid var(--s-accent)',
        color: isRunning ? 'var(--s-on-accent)' : 'var(--s-accent)',
      }}
    >
      {isRunning ? (
        <span
          style={{ width: 11, height: 11, borderRadius: 2, background: 'var(--s-on-accent)' }}
        />
      ) : (
        <span
          style={{
            width: 0,
            height: 0,
            borderLeft: '10px solid var(--s-accent)',
            borderTop: '6px solid transparent',
            borderBottom: '6px solid transparent',
          }}
        />
      )}
      {isRunning ? 'Остановить' : 'Начать учёт'}
    </button>
  )
}
