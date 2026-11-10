import { useMemo } from 'react'
import { isInDay } from '../lib/dayPlan'
import { useGroupModel } from '../lib/groups'
import { todayStr } from '../lib/period'
import { usePref } from '../lib/prefs'
import { useTimeEntriesInRange } from '../lib/queries/dashboard'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useActiveTimer } from '../lib/queries/timer'
import {
  DEFAULT_FOLDERS,
  buildFolders,
  normalizeFolders,
  orderFolders,
  type FolderContext,
  type FolderSettings,
} from '../lib/taskFolders'
import { childrenByParent } from '../lib/tree'
import { useActiveWorkspaceId } from '../lib/workspace'
import type { Task } from '../lib/types'

const NO_ORDER = { keys: [] as string[] }

/**
 * Папки «Задач» одним местом (0.64): их показывают и чипы над списком (телефон), и раздел
 * боковой панели (компьютер). Настройки и свой порядок — на устройстве, у пространства свои.
 */
export function useTaskFolders() {
  const workspaceId = useActiveWorkspaceId()
  const { data: tasks = [] } = useTasks()
  const model = useGroupModel()
  const { data: statuses = [], isSuccess: statusesReady } = useStatuses()
  const { data: activeTimer } = useActiveTimer()
  const today = todayStr()
  const [stored, setSettings] = usePref<FolderSettings>(`semternity.taskFolders.${workspaceId}`, DEFAULT_FOLDERS)
  // старые настройки (до 0.66.5) приводим к нынешнему виду при чтении
  const settings = useMemo(() => normalizeFolders(stored), [stored])
  const [order, setOrder] = usePref<{ keys: string[] }>(`semternity.folderOrder.${workspaceId}`, NO_ORDER)

  // «На сегодня» в папках — то же, что в «Сегодня»: план дня и всё, по чему сегодня шёл учёт
  const { data: todayEntries = [] } = useTimeEntriesInRange(today, today)
  const trackedToday = useMemo(() => new Set(todayEntries.map((e) => e.task_id)), [todayEntries])
  const childrenOf = useMemo(() => childrenByParent(tasks, false), [tasks])
  const heads = useMemo(() => tasks.filter((t) => !t.parent_id), [tasks])
  const finalIds = useMemo(() => new Set(statuses.filter((s) => s.is_final).map((s) => s.id)), [statuses])
  const isDone = useMemo(() => (t: Task) => !!t.status_id && finalIds.has(t.status_id), [finalIds])

  const ctx = useMemo<FolderContext>(
    () => ({
      model,
      today,
      inDay: (t) =>
        isInDay(t, today, activeTimer?.task_id, trackedToday) ||
        (childrenOf.get(t.id) ?? []).some((c) => isInDay(c, today, activeTimer?.task_id, trackedToday)),
      isDone,
    }),
    [model, today, activeTimer?.task_id, trackedToday, childrenOf, isDone],
  )
  const folders = useMemo(() => orderFolders(buildFolders(settings, ctx, heads), order.keys), [settings, ctx, heads, order.keys])

  return {
    settings,
    setSettings,
    folders,
    heads,
    isDone,
    /** этапы пришли — без них готовые посчитались бы открытыми */
    ready: statusesReady,
    model,
    /** условия папок — для счётчика в редакторе своей папки */
    ctx,
    /** новый порядок — ключи папок сверху вниз */
    setOrder: (keys: string[]) => setOrder({ keys }),
  }
}
