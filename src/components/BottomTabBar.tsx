import { Link, useLocation } from 'react-router-dom'
import { Plus } from './Icon'
import { NAV_TABS, type NavTab } from './navTabs'

export function BottomTabBar({ onCreate }: { onCreate: () => void }) {
  const location = useLocation()
  const [today, tasks, summary, more] = NAV_TABS

  const item = (tab: NavTab) => {
    const active = tab.match(location.pathname)
    return (
      <Link
        key={tab.to}
        to={tab.to}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-11 flex-1 flex-col items-center justify-end gap-[5px] text-xs font-medium ${
          active ? 'text-accent-text' : 'text-text-secondary'
        }`}
      >
        <span className={active ? 'text-accent' : undefined}>
          <tab.Icon size={20} />
        </span>
        {tab.label}
      </Link>
    )
  }

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex items-end border-t border-border bg-surface pt-[9px] pb-[26px] lg:hidden"
    >
      <div className="mx-auto flex w-full max-w-lg items-end">
        {item(today)}
        {item(tasks)}
        <span className="flex w-14 shrink-0 justify-center">
          <button
            type="button"
            onClick={onCreate}
            aria-label="Новая задача"
            className="mb-1.5 flex h-[50px] w-[50px] items-center justify-center rounded-full bg-accent text-on-accent shadow-popover"
          >
            <Plus size={22} />
          </button>
        </span>
        {item(summary)}
        {item(more)}
      </div>
    </nav>
  )
}
