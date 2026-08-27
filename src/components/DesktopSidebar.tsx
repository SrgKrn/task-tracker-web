import { Link, useLocation } from 'react-router-dom'
import { Logo } from './ui'
import { supabase } from '../lib/supabaseClient'

const links = [
  {
    to: '/',
    label: 'Сегодня',
    match: (p: string) => p === '/',
    icon: (
      <span className="relative block h-[18px] w-[18px] rounded-full border-2 border-current">
        <span
          className="absolute h-[3.5px] w-[3.5px] rounded-full bg-current"
          style={{ top: -2, left: '50%', marginLeft: -1.75 }}
        />
      </span>
    ),
  },
  {
    to: '/tasks',
    label: 'Задачи',
    match: (p: string) => p.startsWith('/tasks'),
    icon: (
      <span className="flex h-[18px] w-[18px] flex-col justify-center gap-1">
        <span className="h-0.5 rounded-sm bg-current" />
        <span className="h-0.5 rounded-sm bg-current" />
        <span className="h-0.5 w-[60%] rounded-sm bg-current" />
      </span>
    ),
  },
  {
    to: '/dashboard',
    label: 'Сводка',
    match: (p: string) => p === '/dashboard',
    icon: (
      <span className="flex h-[18px] w-[18px] items-end gap-[3px]">
        <span className="h-[8px] flex-1 rounded-[1px] bg-current" />
        <span className="h-[14px] flex-1 rounded-[1px] bg-current" />
        <span className="h-[11px] flex-1 rounded-[1px] bg-current" />
      </span>
    ),
  },
  {
    to: '/settings',
    label: 'Ещё',
    match: (p: string) =>
      p.startsWith('/settings') || p.startsWith('/sections') || p.startsWith('/projects') || p.startsWith('/statuses'),
    icon: (
      <span className="flex h-[18px] w-[18px] items-center justify-center gap-[3px]">
        <span className="h-[3px] w-[3px] rounded-full bg-current" />
        <span className="h-[3px] w-[3px] rounded-full bg-current" />
        <span className="h-[3px] w-[3px] rounded-full bg-current" />
      </span>
    ),
  },
]

export function DesktopSidebar({ onCreate }: { onCreate: () => void }) {
  const location = useLocation()

  return (
    <aside
      className="hidden shrink-0 flex-col lg:flex lg:w-60"
      style={{ borderRight: '1px solid var(--s-hairline)' }}
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={24} />
        <span className="font-semibold tracking-[.01em] text-slate-100">Semternity</span>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onCreate}
          className="w-full rounded-xl py-2 text-sm font-semibold"
          style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
        >
          + Новая задача
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {links.map((link) => {
          const active = link.match(location.pathname)
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${
                active
                  ? 'bg-sky-600 font-medium text-[var(--s-on-accent)]'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
              }`}
            >
              {link.icon}
              {link.label}
            </Link>
          )
        })}
      </nav>

      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="mx-3 mb-5 rounded-lg px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-800 hover:text-slate-300"
      >
        Выйти
      </button>
    </aside>
  )
}
