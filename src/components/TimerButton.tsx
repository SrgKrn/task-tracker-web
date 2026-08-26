import { formatElapsed, useTicker } from '../lib/time'
import type { ActiveTimer } from '../lib/types'

interface TimerButtonProps {
  taskId: string
  activeTimer: ActiveTimer | null | undefined
  onStart: () => void
  onStop: () => void
}

export function TimerButton({ taskId, activeTimer, onStart, onStop }: TimerButtonProps) {
  const isThisTask = activeTimer?.task_id === taskId
  useTicker(isThisTask)

  if (isThisTask && activeTimer) {
    return (
      <button
        onClick={onStop}
        className="flex w-full items-center justify-center gap-3 rounded-lg bg-red-600 px-4 py-3 font-medium text-white active:bg-red-700"
      >
        <span className="tabular-nums">{formatElapsed(activeTimer.started_at)}</span>
        <span>Остановить</span>
      </button>
    )
  }

  return (
    <button
      onClick={onStart}
      className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white active:bg-emerald-700"
    >
      ▶ Начать выполнение
    </button>
  )
}
