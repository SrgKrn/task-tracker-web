import { TabFocus, TabSummary, TabTasks, TabToday } from './Icon'

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

/** экраны профиля — бывшего «Ещё»: открываются кружком справа вверху, а не вкладкой */
export const PROFILE_SECTIONS = ['/settings', '/groups', '/items', '/statuses', '/changelog', '/sections', '/projects']

export const NAV_TABS: NavTab[] = [
  { to: '/', label: 'Сегодня', match: (p) => p === '/', Icon: TabToday },
  { to: '/tasks', label: 'Задачи', match: (p) => p.startsWith('/tasks'), Icon: TabTasks },
  { to: '/dashboard', label: 'Сводка', match: (p) => p === '/dashboard', Icon: TabSummary },
  // «Фокус» встал на место «Ещё»; настройки — в профиле (кружок справа вверху)
  { to: '/focus', label: 'Фокус', match: (p) => p === '/focus', Icon: TabFocus },
]
