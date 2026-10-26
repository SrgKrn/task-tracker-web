import { useStatuses } from '../lib/queries/statuses'
import { useUpdateTask } from '../lib/queries/tasks'
import { useActiveTimer, useStopTimer } from '../lib/queries/timer'
import { describeError, useToast } from '../lib/Toast'
import { tap } from '../lib/haptics'
import type { Task } from '../lib/types'

/**
 * «Готово» прямо из списка (0.57): свайп строки вправо ставит первый финальный этап,
 * у закрытой задачи — возвращает в первый открытый. Учёт по задаче останавливается,
 * в уведомлении — «Вернуть» с прежним этапом.
 */
export function useToggleDone() {
  const { data: statuses = [] } = useStatuses()
  const update = useUpdateTask()
  const { data: activeTimer } = useActiveTimer()
  const stopTimer = useStopTimer()
  const { showError, showSuccess } = useToast()
  const onError = (e: unknown) => showError(describeError(e))

  const sorted = [...statuses].sort((a, b) => a.sort_order - b.sort_order)
  const finalStatus = sorted.find((s) => s.is_final)
  const openStatus = sorted.find((s) => !s.is_final)

  return (task: Task) => {
    const current = statuses.find((s) => s.id === task.status_id)
    const done = !!current?.is_final
    const target = done ? (openStatus?.id ?? null) : finalStatus?.id
    if (!done && !target) {
      showError('Нет этапа «готово» — отметьте финальный этап в настройке этапов')
      return
    }
    tap()
    const previous = task.status_id
    update.mutate(
      { id: task.id, fields: { status_id: target ?? null } },
      {
        onError,
        onSuccess: () => {
          if (!done && activeTimer?.task_id === task.id) stopTimer.mutate(undefined, { onError })
          showSuccess(done ? 'Снова в работе' : `Готово: ${task.name}`, {
            label: 'Вернуть',
            onAction: () => update.mutate({ id: task.id, fields: { status_id: previous } }, { onError }),
          })
        },
      },
    )
  }
}
