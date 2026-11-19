import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useFocusRun } from '../lib/queries/focus'
import { useActiveTimer } from '../lib/queries/timer'
import { useScrollCompact } from '../lib/scrollCompact'
import { useKeyboardOpen } from '../lib/viewport'
import { Plus } from './Icon'
import { NAV_TABS, type NavTab } from './navTabs'

/**
 * Нижняя панель телефона — парящая «пилюля», как в Telegram: четыре вкладки, активная —
 * в мягкой подложке; «Новая задача» — отдельный кружок справа. Пока открыта клавиатура,
 * панель прячется: над клавиатурой она только закрывала поле.
 *
 * Панель уступает место содержимому (0.68): при прокрутке вниз сжимается до значков, а в
 * карточке задачи уходит совсем — там внизу поле комментария с кнопкой учёта, и три
 * плавающих слоя друг над другом закрывали пятую часть экрана.
 */
export function BottomTabBar({ onCreate }: { onCreate: () => void }) {
  const location = useLocation()
  const keyboard = useKeyboardOpen()
  // карточка задачи — экран второго уровня со своей нижней строкой и кнопкой «Назад»
  const away = /^\/tasks\/[^/]+$/.test(location.pathname)
  const compact = useScrollCompact(location.pathname)
  // пока идёт учёт, «+» связан с плашкой жидким перешейком — кружок не сжимаем, иначе
  // перешеек съезжает; плашка и «+» и так одна связка с главным действием «стоп»
  const { data: timer } = useActiveTimer()
  // идёт рабочий отрезок фокуса и он на экране — на экране только время, кнопки и задача
  // (0.71); панель возвращается на паузе и в перерыве
  const { data: run } = useFocusRun()
  const immersive = location.pathname === '/focus' && run?.state === 'running' && run.phase_kind === 'work'
  const activeIndex = NAV_TABS.findIndex((t) => t.match(location.pathname))
  // каждый переезд подложки — новая «капля»: анимация растяжения начинается заново
  const [prevIndex, setPrevIndex] = useState(activeIndex)
  const [moves, setMoves] = useState(0)
  if (prevIndex !== activeIndex) {
    setPrevIndex(activeIndex)
    if (prevIndex >= 0 && activeIndex >= 0) setMoves(moves + 1)
  }

  const item = (tab: NavTab) => {
    const active = tab.match(location.pathname)
    return (
      <Link
        key={tab.to}
        to={tab.to}
        data-tip={tab.tip}
        aria-current={active ? 'page' : undefined}
        className={`relative z-10 flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-full text-xs font-medium ${
          active ? 'text-accent-text' : 'text-text-secondary'
        }`}
      >
        <span className={`tab-icon ${active ? 'text-accent' : ''}`} data-active={active || undefined}>
          <tab.Icon size={20} />
        </span>
        <span className="tab-label truncate">{tab.label}</span>
      </Link>
    )
  }

  return (
    <nav
      className="tabbar fixed inset-x-0 z-40 px-3 lg:hidden"
      data-hidden={keyboard || undefined}
      data-away={away || undefined}
      data-immersive={immersive || undefined}
      data-compact={(compact && !away && !timer) || undefined}
    >
      <div className="mx-auto flex max-w-lg items-center gap-2">
        <div className="tabbar-pill relative flex h-[var(--tabbar-h)] min-w-0 flex-1 items-stretch rounded-full border border-[var(--float-border)] p-1 shadow-popover">
          {/* подложка активной вкладки переезжает к выбранной, а не появляется на месте */}
          <span
            className="tab-indicator absolute top-1 bottom-1"
            style={{
              width: `calc((100% - 8px) / ${NAV_TABS.length})`,
              left: `calc(4px + ${Math.max(activeIndex, 0)} * (100% - 8px) / ${NAV_TABS.length})`,
              opacity: activeIndex < 0 ? 0 : 1,
            }}
            aria-hidden
          >
            <span key={moves} className="tab-blob rounded-full bg-surface-selected" data-moved={moves > 0 || undefined} />
          </span>
          {NAV_TABS.map(item)}
        </div>
        <button
          type="button"
          onClick={onCreate}
          aria-label="Новая задача"
          data-tip="new-task"
          className="fab flex h-[var(--tabbar-h)] w-[var(--tabbar-h)] shrink-0 items-center justify-center rounded-full bg-accent text-on-accent shadow-popover"
        >
          <Plus size={24} />
        </button>
      </div>
    </nav>
  )
}
