import { tap } from '../lib/haptics'
import type { ActiveTimer } from '../lib/types'
import { PlayGlyph, StopGlyph } from './Ring'
import { Button } from './ui'

interface TimerButtonProps {
  taskId: string
  activeTimer: ActiveTimer | null | undefined
  onStart: () => void
  onStop: () => void
}

/**
 * Главное действие карточки: начать или остановить учёт по этой задаче. В покое — главная
 * кнопка экрана (она на экране одна); при учёте — спокойная «Остановить»: учёт и так виден
 * по кольцу и плашке сверху.
 */
export function TimerButton({ taskId, activeTimer, onStart, onStop }: TimerButtonProps) {
  const isRunning = activeTimer?.task_id === taskId

  return (
    <Button
      variant={isRunning ? 'secondary' : 'primary'}
      className="w-full whitespace-nowrap"
      onClick={() => {
        tap()
        if (isRunning) onStop()
        else onStart()
      }}
    >
      {isRunning ? <StopGlyph size={10} /> : <PlayGlyph size={9} color="currentColor" />}
      {isRunning ? 'Остановить' : 'Начать учёт'}
    </Button>
  )
}
