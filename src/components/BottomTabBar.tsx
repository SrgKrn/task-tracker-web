import { Link, useLocation } from 'react-router-dom'
import { useKeyboardOpen } from '../lib/viewport'
import { Plus } from './Icon'
import { NAV_TABS, type NavTab } from './navTabs'

/**
 * Нижняя панель телефона — парящая «пилюля», как в Telegram: четыре вкладки, активная —
 * в мягкой подложке; «Новая задача» — отдельный кружок справа. Пока открыта клавиатура,
 * панель прячется: над клавиатурой она только закрывала поле.
 */
export function BottomTabBar({ onCreate }: { onCreate: () => void }) {
  const location = useLocation()
  const keyboard = useKeyboardOpen()

  const item = (tab: NavTab) => {
    const active = tab.match(location.pathname)
    return (
      <Link
        key={tab.to}
        to={tab.to}
        aria-current={active ? 'page' : undefined}
        className={`flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full text-xs font-medium ${
          active ? 'bg-surface-selected text-accent-text' : 'text-text-secondary'
        }`}
      >
        <span className={active ? 'text-accent' : undefined}>
          <tab.Icon size={20} />
        </span>
        <span className="truncate">{tab.label}</span>
      </Link>
    )
  }

  return (
    <nav className="tabbar fixed inset-x-0 z-40 px-3 lg:hidden" data-hidden={keyboard || undefined}>
      <div className="mx-auto flex max-w-lg items-center gap-2">
        <div className="tabbar-pill flex h-[var(--tabbar-h)] min-w-0 flex-1 items-stretch rounded-full border border-border p-1 shadow-popover">
          {NAV_TABS.map(item)}
        </div>
        <button
          type="button"
          onClick={onCreate}
          aria-label="Новая задача"
          data-tip="new-task"
          className="flex h-[var(--tabbar-h)] w-[var(--tabbar-h)] shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-popover"
        >
          <Plus size={24} />
        </button>
      </div>
    </nav>
  )
}
