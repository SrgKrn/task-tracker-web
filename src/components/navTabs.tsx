import { TabMore, TabSummary, TabTasks, TabToday } from './Icon'

/**
 * Разделы приложения — одна конфигурация для нижней панели и бокового меню. Раньше их
 * было два списка с иконками из span разной величины: пункт добавляли в один и
 * забывали в другой.
 */
export interface NavTab {
  to: string
  label: string
  match: (pathname: string) => boolean
  Icon: typeof TabToday
}

/** экраны, которые открываются из «Ещё» — вкладка «Ещё» на них подсвечена */
const MORE_SECTIONS = ['/settings', '/groups', '/items', '/statuses', '/changelog', '/sections', '/projects']

export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Сегодня', match: (p) => p === '/', Icon: TabToday },
  { to: '/tasks', label: 'Задачи', match: (p) => p.startsWith('/tasks'), Icon: TabTasks },
  { to: '/dashboard', label: 'Сводка', match: (p) => p === '/dashboard', Icon: TabSummary },
  { to: '/settings', label: 'Ещё', match: (p) => MORE_SECTIONS.some((x) => p.startsWith(x)), Icon: TabMore },
]
