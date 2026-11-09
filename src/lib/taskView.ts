import { usePopoverMode } from '../components/Popover'
import { addDays, toDateString } from './period'
import { usePref } from './prefs'
import { useActiveWorkspaceId } from './workspace'

/**
 * Вид «Задач» (0.64): список, доска по этапам или календарь по сроку. Запоминается на
 * устройстве — у каждой папки свой: у «Горит» удобнее календарь, у клиента — доска.
 * На телефоне и планшете — всегда список.
 */
export type TaskView = 'list' | 'board' | 'calendar'

export const TASK_VIEW_LABEL: Record<TaskView, string> = {
  list: 'Список',
  board: 'Доска',
  calendar: 'Календарь',
}

const ALL = { key: 'all' }
const NO_VIEWS: Record<string, TaskView> = {}

/** выбранная папка на компьютере — общая для боковой панели и списка */
export function useActiveFolder(): [string, (key: string) => void] {
  const workspaceId = useActiveWorkspaceId()
  const [value, setValue] = usePref<{ key: string }>(`semternity.activeFolder.${workspaceId}`, ALL)
  return [value.key, (key) => setValue({ key })]
}

export function useTaskView(): [TaskView, (view: TaskView) => void] {
  const workspaceId = useActiveWorkspaceId()
  const desktop = usePopoverMode()
  const [folder] = useActiveFolder()
  const [views, setViews] = usePref<Record<string, TaskView>>(`semternity.folderViews.${workspaceId}`, NO_VIEWS)
  const stored = views[folder]
  const view: TaskView = desktop && (stored === 'board' || stored === 'calendar') ? stored : 'list'
  return [view, (next) => setViews({ ...views, [folder]: next })]
}

/** Недели месяца целиком, с понедельника: дни соседних месяцев тоже — как в календаре. */
export function calendarWeeks(year: number, month: number): string[][] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7
  const start = toDateString(new Date(year, month, 1 - lead))
  const last = new Date(year, month + 1, 0)
  const trail = 6 - ((last.getDay() + 6) % 7)
  const days = lead + last.getDate() + trail
  const weeks: string[][] = []
  for (let i = 0; i < days; i += 7) weeks.push(Array.from({ length: 7 }, (_, d) => addDays(start, i + d)))
  return weeks
}

/** Перенос срока на день: начало позже нового срока — подтягиваем его, иначе период вывернут. */
export function moveDueFields(task: { start_date: string | null }, date: string | null) {
  return { end_date: date, ...(date && task.start_date && task.start_date > date ? { start_date: date } : {}) }
}
