import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { NAV_TABS } from './navTabs'
import { Avatar } from './Avatar'
import { useProfile } from '../lib/profile'
import { LogOut, PanelLeft, Plus, Search } from './Icon'
import { Kbd, Logo, MOD_KEY } from './ui'
import { useAuth } from '../lib/AuthContext'
import { openCommandPalette } from '../lib/commands'
import { supabase } from '../lib/supabaseClient'

const COLLAPSED_KEY = 'semternity.sidebarCollapsed'

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Боковая панель десктопа по дизайн-системе (9.7): 248 px, сворачивается до 56 px —
 * остаются иконки. Активный пункт — мягкая подсветка --surface-selected, а не заливка
 * терракотой: акцент остаётся за главной кнопкой и идущим учётом. Внизу — аккаунт.
 */
export function DesktopSidebar({ onCreate }: { onCreate: () => void }) {
  const location = useLocation()
  const { session } = useAuth()
  const [collapsed, setCollapsed] = useState(loadCollapsed)

  function toggle() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1')
      } catch {
        // приватный режим — просто не запоминаем
      }
      return !c
    })
  }

  const email = session?.user.email ?? ''
  const profile = useProfile()
  const item = (active: boolean) =>
    `flex h-8 items-center gap-2.5 rounded-sm text-sm font-medium transition-colors ${
      collapsed ? 'justify-center px-0' : 'px-2.5'
    } ${active ? 'bg-surface-selected text-accent-text' : 'text-text-secondary hover:bg-surface-sunken hover:text-text'}`

  return (
    <aside
      className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface lg:flex"
      style={{ width: collapsed ? 'var(--sidebar-w-collapsed)' : 'var(--sidebar-w)' }}
    >
      <div className={`flex h-14 items-center gap-2.5 ${collapsed ? 'justify-center' : 'pr-2 pl-4'}`}>
        {!collapsed && (
          <>
            <Logo size={22} />
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-text">Semternity</span>
          </>
        )}
        <button
          type="button"
          onClick={toggle}
          className="flex h-8 w-8 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text"
          aria-label={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
          title={collapsed ? 'Развернуть панель' : 'Свернуть панель'}
        >
          <PanelLeft size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-1 px-2 pb-3">
        <button
          type="button"
          onClick={onCreate}
          className={`flex h-8 items-center gap-2 rounded-sm bg-accent text-sm font-semibold text-on-accent hover:bg-accent-hover ${
            collapsed ? 'justify-center' : 'px-2.5'
          }`}
          aria-label="Новая задача"
          title="Новая задача · C"
        >
          <Plus size={16} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Новая задача</span>
              <kbd className="font-mono text-xs font-normal opacity-70">C</kbd>
            </>
          )}
        </button>
        <button type="button" onClick={openCommandPalette} className={item(false)} aria-label="Поиск и команды" title={`Поиск · ${MOD_KEY}K`}>
          <Search size={18} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Поиск</span>
              <Kbd>{MOD_KEY}K</Kbd>
            </>
          )}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV_TABS.map((link) => {
          const active = link.match(location.pathname)
          return (
            <Link key={link.to} to={link.to} className={item(active)} title={collapsed ? link.label : undefined}>
              <link.Icon size={18} className={active ? 'text-accent' : ''} />
              {!collapsed && link.label}
            </Link>
          )
        })}
      </nav>

      <div className={`flex items-center gap-2 border-t border-divider p-2 ${collapsed ? 'flex-col' : ''}`}>
        <Link
          to="/settings"
          className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-sm p-1.5 hover:bg-surface-sunken ${collapsed ? 'justify-center' : ''}`}
          title={`Профиль · ${email}`}
        >
          <Avatar size={28} />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-text">{profile.name}</span>
              <span className="block truncate text-xs text-text-secondary">{email}</span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text"
          aria-label="Выйти"
          title="Выйти"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  )
}
