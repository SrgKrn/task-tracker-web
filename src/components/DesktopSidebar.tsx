import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const links = [
  {
    to: '/',
    label: 'Задачи',
    match: (path: string) => path === '/' || path.startsWith('/tasks'),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/dashboard',
    label: 'Дашборд',
    match: (path: string) => path === '/dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M5 19V10M12 19V5M19 19v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/sections',
    label: 'Разделы',
    match: (path: string) => path.startsWith('/sections'),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    to: '/projects',
    label: 'Проекты',
    match: (path: string) => path.startsWith('/projects'),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      </svg>
    ),
  },
  {
    to: '/statuses',
    label: 'Статусы',
    match: (path: string) => path.startsWith('/statuses'),
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

function ChronographMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="13" r="7" stroke="var(--color-sky-600)" strokeWidth="1.6" />
      <line x1="12" y1="13" x2="12" y2="9" stroke="var(--color-sky-600)" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12" y1="13" x2="14.5" y2="14.5" stroke="var(--color-sky-600)" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12" y1="3.5" x2="12" y2="5" stroke="var(--color-sky-600)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function DesktopSidebar() {
  const location = useLocation()

  return (
    <aside className="hidden shrink-0 flex-col border-r border-slate-800 lg:flex lg:w-60">
      <div className="flex items-center gap-2 px-5 py-5">
        <ChronographMark />
        <span className="font-semibold text-slate-100">Хронограф</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {links.map((link) => {
          const active = link.match(location.pathname)
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                active ? 'bg-sky-600 text-slate-900' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              {link.icon}
              {link.label}
            </Link>
          )
        })}
      </nav>

      <button
        onClick={() => supabase.auth.signOut()}
        className="mx-3 mb-5 rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-800 hover:text-slate-300"
      >
        Выйти
      </button>
    </aside>
  )
}
