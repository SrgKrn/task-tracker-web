import { Link, useLocation } from 'react-router-dom'
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
        className="flex min-h-11 flex-1 flex-col items-center justify-end gap-[5px] text-2xs font-medium"
        style={{ color: active ? 'var(--s-accent-text)' : 'var(--s-tab-idle)' }}
      >
        <tab.Icon size={20} />
        {tab.label}
      </Link>
    )
  }

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex items-end pt-[9px] pb-[26px] lg:hidden"
      style={{ background: 'var(--s-chrome)', borderTop: '1px solid var(--s-hairline)' }}
    >
      <div className="mx-auto flex w-full max-w-lg items-end">
        {item(today)}
        {item(tasks)}
        <span className="flex w-14 shrink-0 justify-center">
          <button
            type="button"
            onClick={onCreate}
            aria-label="Новая задача"
            className="mb-1.5 flex h-[50px] w-[50px] items-center justify-center rounded-full text-2xl leading-none"
            style={{
              background: 'var(--s-accent)',
              color: 'var(--s-on-accent)',
              boxShadow: '0 8px 20px -6px var(--s-accent-glow)',
            }}
          >
            +
          </button>
        </span>
        {item(summary)}
        {item(more)}
      </div>
    </nav>
  )
}
