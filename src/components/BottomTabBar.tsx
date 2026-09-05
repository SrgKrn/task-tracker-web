import { Link, useLocation } from 'react-router-dom'

const tabs = [
  {
    to: '/',
    label: 'Сегодня',
    match: (p: string) => p === '/',
    icon: (
      <span className="relative block h-[19px] w-[19px] rounded-full border-2 border-current">
        <span
          className="absolute h-1 w-1 rounded-full bg-current"
          style={{ top: -2, left: '50%', marginLeft: -2 }}
        />
      </span>
    ),
  },
  {
    to: '/tasks',
    label: 'Задачи',
    match: (p: string) => p.startsWith('/tasks'),
    icon: (
      <span className="flex h-[19px] w-[19px] flex-col justify-center gap-1">
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
      <span className="flex h-[19px] w-[19px] items-end gap-[3px]">
        <span className="h-[9px] flex-1 rounded-[1px] bg-current" />
        <span className="h-[15px] flex-1 rounded-[1px] bg-current" />
        <span className="h-[12px] flex-1 rounded-[1px] bg-current" />
      </span>
    ),
  },
  {
    to: '/settings',
    label: 'Ещё',
    match: (p: string) =>
      p.startsWith('/settings') || p.startsWith('/sections') || p.startsWith('/projects') || p.startsWith('/statuses'),
    icon: (
      <span className="flex h-[19px] w-[19px] items-center justify-center gap-[3px]">
        <span className="h-[3px] w-[3px] rounded-full bg-current" />
        <span className="h-[3px] w-[3px] rounded-full bg-current" />
        <span className="h-[3px] w-[3px] rounded-full bg-current" />
      </span>
    ),
  },
]

export function BottomTabBar({ onCreate }: { onCreate: () => void }) {
  const location = useLocation()
  const [today, tasks, summary, more] = tabs

  const item = (tab: (typeof tabs)[number]) => {
    const active = tab.match(location.pathname)
    return (
      <Link
        key={tab.to}
        to={tab.to}
        className="flex min-h-11 flex-1 flex-col items-center justify-end gap-[5px] text-2xs font-medium"
        style={{ color: active ? 'var(--s-accent)' : 'var(--s-tab-idle)' }}
      >
        {tab.icon}
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
              boxShadow: '0 8px 20px -6px rgba(232,163,61,.6)',
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
