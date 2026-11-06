import { useQueryClient } from '@tanstack/react-query'
import { useDeleteTask } from '../lib/queries/tasks'
import { describeError, useToast } from '../lib/Toast'
import { plural, TASKS } from '../lib/time'
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

  // одна задача или несколько выделенных (0.63) — одним уведомлением и одним «Вернуть»
  return (input: Task | Task[]) => {
    const heads = Array.isArray(input) ? input : [input]
    if (heads.length === 0) return
    const headIds = new Set(heads.map((t) => t.id))
    const list = qc.getQueryData<Task[]>(['tasks']) ?? []
    const removed = list.filter((t) => headIds.has(t.id) || (!!t.parent_id && headIds.has(t.parent_id)))
    const ids = new Set(removed.map((t) => t.id))
    qc.setQueryData<Task[]>(['tasks'], (old) => old?.filter((t) => !ids.has(t.id)))

    const restore = (only?: Set<string>) =>
      qc.setQueryData<Task[]>(['tasks'], (old) => {
        if (!old) return old
        const have = new Set(old.map((t) => t.id))
        return [...old, ...removed.filter((t) => !have.has(t.id) && (!only || only.has(t.id) || (!!t.parent_id && only.has(t.parent_id))))]
      })

    const key = heads.map((t) => t.id).join(',')
    const run = () => {
      window.clearTimeout(timer)
      pending.delete(key)
      for (const head of heads) {
        del.mutate(head.id, {
          onError: (e) => {
            restore(new Set([head.id]))
            showError(describeError(e))
          },
        })
      }
    }
    const timer = window.setTimeout(run, UNDO_MS + 200)
    pending.set(key, run)

    const subs = removed.length - heads.length
    const what =
      heads.length > 1
        ? `Удалено: ${plural(heads.length, TASKS)}`
        : subs > 0
          ? `Удалено: ${heads[0].name} и ${plural(subs, SUBTASKS)}`
          : `Удалено: ${heads[0].name}`
    showSuccess(what, {
      label: 'Вернуть',
      onAction: () => {
        window.clearTimeout(timer)
        pending.delete(key)
        restore()
      },
    })
  }
}
