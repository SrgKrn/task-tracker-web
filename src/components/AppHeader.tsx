import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

const links = [
  { to: '/', label: 'Задачи' },
  { to: '/sections', label: 'Разделы' },
  { to: '/projects', label: 'Проекты' },
  { to: '/statuses', label: 'Статусы' },
]

export function AppHeader() {
  const location = useLocation()

  return (
    <header className="safe-top border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <nav className="mx-auto flex max-w-lg items-center gap-1 overflow-x-auto px-2 py-2">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              location.pathname === link.to
                ? 'bg-sky-600 text-slate-900'
                : 'text-slate-400 active:bg-slate-800'
            }`}
          >
            {link.label}
          </Link>
        ))}
        <button
          onClick={() => supabase.auth.signOut()}
          className="ml-auto shrink-0 rounded-full px-3 py-1.5 text-sm text-slate-500 active:bg-slate-800"
        >
          Выйти
        </button>
      </nav>
    </header>
  )
}
