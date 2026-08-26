import { Link, useLocation } from 'react-router-dom'

const tabs = [
  {
    to: '/',
    label: 'Задачи',
    match: (path: string) => path === '/' || path.startsWith('/tasks'),
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 6h14M5 12h14M5 18h9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    to: '/dashboard',
    label: 'Дашборд',
    match: (path: string) => path === '/dashboard',
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <path d="M5 19V10M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/settings',
    label: 'Настройки',
    match: (path: string) => path.startsWith('/settings') || path.startsWith('/sections') || path.startsWith('/projects') || path.startsWith('/statuses'),
    icon: (
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 4.3l.06.06A1.65 1.65 0 0 0 8.92 4.7 1.65 1.65 0 0 0 9.91 3.2V3a2 2 0 0 1 4 0v.09c0 .68.39 1.29 1 1.51.61.26 1.32.13 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.46.5-.59 1.21-.33 1.82.22.61.83 1 1.51 1H21a2 2 0 0 1 0 4h-.09c-.68 0-1.29.39-1.51 1Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
]

export function BottomTabBar() {
  const location = useLocation()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-900/90 backdrop-blur safe-bottom lg:hidden">
      <div className="mx-auto flex max-w-lg">
        {tabs.map((tab) => {
          const active = tab.match(location.pathname)
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                active ? 'text-sky-600' : 'text-slate-500'
              }`}
            >
              {tab.icon}
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
