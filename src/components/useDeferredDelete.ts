import { useQueryClient } from '@tanstack/react-query'
import { useDeleteTask } from '../lib/queries/tasks'
import { describeError, useToast } from '../lib/Toast'
import { plural } from '../lib/time'
import { SUBTASKS } from '../lib/tree'
import type { Task } from '../lib/types'

/** столько живёт уведомление с «Вернуть» (Toast) — и столько ждём с настоящим удалением */
export const UNDO_MS = 5000

/** отложенные удаления: при закрытии страницы выполняем сразу, а не теряем */
const pending = new Map<string, () => void>()
let flushInstalled = false
function installFlush() {
  if (flushInstalled || typeof window === 'undefined') return
  flushInstalled = true
  window.addEventListener('pagehide', () => [...pending.values()].forEach((run) => run()))
}

/**
 * Удаление с «Вернуть» (0.60). Задача (с подзадачами) сразу пропадает из списков, а в базе
 * удаляется, когда уведомление уйдёт, — «Вернуть» просто возвращает её на место. Удаление
 * необратимо (файлы и история уходят вместе с задачей), поэтому до истечения срока его
 * не делаем вовсе. Закрыли приложение раньше — удаляем сразу при уходе со страницы.
 */
export function useDeferredDelete() {
  const qc = useQueryClient()
  const del = useDeleteTask()
  const { showSuccess, showError } = useToast()
  installFlush()

  return (task: Task) => {
    const list = qc.getQueryData<Task[]>(['tasks']) ?? []
    const removed = list.filter((t) => t.id === task.id || t.parent_id === task.id)
    const ids = new Set(removed.map((t) => t.id))
    qc.setQueryData<Task[]>(['tasks'], (old) => old?.filter((t) => !ids.has(t.id)))

    const restore = () =>
      qc.setQueryData<Task[]>(['tasks'], (old) => {
        if (!old) return old
        const have = new Set(old.map((t) => t.id))
        return [...old, ...removed.filter((t) => !have.has(t.id))]
      })

    const run = () => {
      window.clearTimeout(timer)
      pending.delete(task.id)
      del.mutate(task.id, {
        onError: (e) => {
          restore()
          showError(describeError(e))
        },
      })
    }
    const timer = window.setTimeout(run, UNDO_MS + 200)
    pending.set(task.id, run)

    const subs = removed.length - 1
    showSuccess(subs > 0 ? `Удалено: ${task.name} и ${plural(subs, SUBTASKS)}` : `Удалено: ${task.name}`, {
      label: 'Вернуть',
      onAction: () => {
        window.clearTimeout(timer)
        pending.delete(task.id)
        restore()
      },
    })
  }
}
