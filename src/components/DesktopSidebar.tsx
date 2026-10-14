import { Link, useLocation } from 'react-router-dom'
import { NAV_TABS } from './navTabs'
import { Logo } from './ui'
import { supabase } from '../lib/supabaseClient'

export function DesktopSidebar({ onCreate }: { onCreate: () => void }) {
  const location = useLocation()

  return (
    <aside
      className="hidden shrink-0 flex-col lg:flex lg:w-60"
      style={{ borderRight: '1px solid var(--divider)' }}
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <Logo size={24} />
        <span className="font-semibold tracking-[.01em] text-text">Semternity</span>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onCreate}
          className="w-full rounded-sm py-2 text-base font-semibold"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          + Новая задача
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV_TABS.map((link) => {
          const active = link.match(location.pathname)
          return (
            <Link
              key={link.to}
              to={link.to}
              className={`flex items-center gap-2.5 rounded-sm px-3 py-2 text-base ${
                active
                  ? 'bg-[var(--accent)] font-medium text-[var(--on-accent)]'
                  : 'text-text-secondary hover:bg-surface hover:text-text'
              }`}
            >
              <link.Icon size={18} />
              {link.label}
            </Link>
          )
        })}
      </nav>

      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="mx-3 mb-5 rounded-sm px-3 py-2 text-left text-base text-text-secondary hover:bg-surface hover:text-text-secondary"
      >
        Выйти
      </button>
    </aside>
  )
}
