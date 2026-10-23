import { describeError, useToast } from '../lib/Toast'
import { freezeAndMove, freezeOrder, reorderPatch } from '../lib/dragSort'
import { todayStr } from '../lib/period'
import { useReorderTasks, useTasks } from '../lib/queries/tasks'
import { usePriorityMethod } from '../lib/queries/userSettings'
import {
  TASK_SORT_LABEL,
  effectiveSort,
  markDragHintSeen,
  setTaskSort,
  sortHeads,
  useTaskSort,
} from '../lib/taskSort'
import { childrenByParent } from '../lib/tree'
import type { Task } from '../lib/types'

/**
 * Перетащили задачу (в списке или в составе спринта). В «своём порядке» — просто новое
 * место. В любом другом режиме (0.42) — сначала текущий порядок экрана записывается как
 * свой, потом переставляется одна задача, режим становится «свой порядок», а тост
 * предлагает вернуть прежний режим (сам порядок остаётся записанным).
 */
export function useMoveTask() {
  const sortMode = useTaskSort()
  const method = usePriorityMethod()
  const { data: tasks = [] } = useTasks()
  const reorder = useReorderTasks()
  const { showError, showSuccess } = useToast()
  const onError = (e: unknown) => showError(describeError(e))

  return (visible: Task[], from: number, to: number) => {
    if (from === to) return
    markDragHintSeen()
    const sort = effectiveSort(sortMode, method)
    if (sort === 'manual') {
      const patch = reorderPatch(visible, from, to)
      if (patch.length) reorder.mutate(patch, { onError })
      return
    }
    // весь список и все составы — в том порядке, что сейчас на экране, со скрытыми
    const heads = sortHeads(
      tasks.filter((t) => !t.parent_id),
      sort,
      method,
      todayStr(),
    )
    const order = freezeOrder(heads, childrenByParent(tasks, false).values())
    reorder.mutate(freezeAndMove(order, visible, from, to), { onError })
    setTaskSort('manual')
    showSuccess('Порядок: свой', {
      label: `Вернуть «${TASK_SORT_LABEL[sortMode].toLowerCase()}»`,
      onAction: () => setTaskSort(sortMode),
    })
  }
}
