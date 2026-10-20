import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { TabFocus } from './Icon'
import { Bell, Calendar as CalendarIcon, Check, ChevronRight, Download, Drive as DriveIcon, History, Mosaic as MosaicIcon, Send, Sparkle } from './Icon'
import { ClientDot, ListGroup, Overline } from './ui'
import { LATEST_RELEASE } from '../lib/changelog'
import { useGroupModel } from '../lib/groups'
import { useGoogleStatus } from '../lib/google'
import { usePush, type PushState } from '../lib/push'
import { useCalendarSources } from '../lib/queries/calendar'
import { useStatuses } from '../lib/queries/statuses'
import { METHODS } from '../lib/priority'
import { useActiveWorkspace } from '../lib/workspace'
import { useTelegramStatus } from '../lib/telegram'
import { useTheme, type ThemeChoice } from '../lib/theme'
import { formatHoursRu } from '../lib/time'
import { PLAN_NAME } from '../lib/plans'
import { useUserPlan } from '../lib/queries/plan'

/* ── меню «Ещё» ─────────────────────────────────────────────────── */

/**
 * Плитка со значком слева от строки меню — одинаковая нейтральная у всех: разноцветные
 * плитки (зелёная у статусов, латунные у остальных) спорили с цветами этапов и акцентом.
 */
function Glyph({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-sm text-text-secondary ${
        small ? 'h-6 w-6' : 'h-[30px] w-[30px] bg-surface-sunken'
      }`}
    >
      {children}
    </span>
  )
}

const GroupsGlyph = (
  <span className="relative h-3.5 w-3.5">
    <span className="absolute top-0 left-0 h-2 w-2 rounded-[2px]" style={{ border: '1.5px solid currentColor' }} />
    <span className="absolute right-0 bottom-0 h-2 w-2 rounded-[2px]" style={{ border: '1.5px solid currentColor' }} />
  </span>
)
const StatusGlyph = <Check size={15} />
const ThemeGlyph = (
  <span
    className="h-3.5 w-3.5 rounded-full"
    style={{ border: '1.5px solid currentColor', background: 'linear-gradient(90deg, currentColor 50%, transparent 50%)' }}
  />
)
const PlanGlyph = (
  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full" style={{ border: '1.5px solid currentColor' }}>
    <span className="h-1 w-1 rounded-full bg-current" />
  </span>
)

/** Тариф — ромб: ступень, а не деньги */
const TariffGlyph = (
  <span className="h-2.5 w-2.5 rotate-45 rounded-[2px]" style={{ border: '1.5px solid currentColor' }} aria-hidden />
)

const MethodGlyph = (
  <span className="grid h-3.5 w-3.5 grid-cols-2 gap-px" aria-hidden>
    <span className="rounded-[1px] bg-current" />
    <span className="rounded-[1px] border border-current" />
    <span className="rounded-[1px] border border-current" />
    <span className="rounded-[1px] border border-current opacity-50" />
  </span>
)

const THEME_LABEL: Record<ThemeChoice, string> = { dark: 'Тёмная', light: 'Светлая', system: 'Как в системе' }
const PUSH_LABEL: Record<PushState, string> = {
  on: 'Включены',
  off: 'Выключены',
  denied: 'Запрещены',
  'needs-install': 'Нужна установка',
  unsupported: 'Недоступны',
}

interface MenuItem {
  to: string
  glyph: ReactNode
  title: string
  value?: string
  /** пункт подсвечен и на вложенных экранах: «Группы» — и на /groups/…, и на /items/… */
  match?: string[]
}

/** Пункты меню со значениями справа — одна конфигурация для телефона и для колонки десктопа. */
function useMenu(): { title: string; items: MenuItem[] }[] {
  const model = useGroupModel()
  const { data: statuses = [] } = useStatuses()
  const theme = useTheme()
  const push = usePush()
  const { data: telegram } = useTelegramStatus()
  const { data: calendars = [] } = useCalendarSources()
  const { data: google } = useGoogleStatus()
  const { data: userPlan } = useUserPlan()

  // норма, методика и фокус — активного пространства
  const ws = useActiveWorkspace()
  const plan = ws?.planned_hours_per_day
    ? `${formatHoursRu(Number(ws.planned_hours_per_day))} ч в день`
    : ws?.planned_hours_per_month
      ? `${formatHoursRu(Number(ws.planned_hours_per_month))} ч в месяц`
      : 'Не задан'
  const tg = telegram?.linked
    ? telegram.linked.username
      ? `@${telegram.linked.username}`
      : 'Подключён'
    : telegram?.configured
      ? 'Не подключён'
      : undefined

  return [
    {
      // раньше «Группы → Группы» и «Этапы задач → Статусы» — по разделу на пункт
      title: 'Структура',
      items: [
        {
          to: '/settings/workspaces',
          glyph: <ClientDot color={ws?.color ?? 'label-1'} size={10} />,
          title: 'Пространства',
          value: ws?.name,
        },
        {
          to: '/groups',
          glyph: GroupsGlyph,
          title: 'Группы',
          value: model.groups.map((g) => g.name).join(', ') || 'Нет групп',
          match: ['/groups', '/items', '/sections', '/projects'],
        },
        { to: '/statuses', glyph: StatusGlyph, title: 'Этапы', value: String(statuses.length) },
        {
          to: '/settings/method',
          glyph: MethodGlyph,
          title: 'Методика',
          value: ws?.priority_method && ws.priority_method !== 'none' ? METHODS[ws.priority_method].name : 'Без методики',
        },
        {
          to: '/settings/focus',
          glyph: <TabFocus size={15} />,
          title: 'Фокус',
          value: ws?.focus_mode === '9030' ? '90/30' : 'Pomodoro',
        },
      ],
    },
    {
      title: 'Настройки',
      items: [
        { to: '/settings/appearance', glyph: ThemeGlyph, title: 'Оформление', value: THEME_LABEL[theme] },
        {
          to: '/settings/notifications',
          glyph: <Bell size={15} />,
          title: 'Уведомления',
          value: push.state ? PUSH_LABEL[push.state] : undefined,
        },
      ],
    },
    {
      title: 'Интеграции',
      items: [
        { to: '/settings/telegram', glyph: <Send size={15} />, title: 'Telegram', value: tg },
        {
          to: '/settings/calendar',
          glyph: <CalendarIcon size={15} />,
          title: 'Google Календарь',
          value: calendars.length
            ? calendars.some((c) => c.last_error)
              ? 'Ошибка'
              : calendars.find((c) => c.kind === 'google')?.name || 'Подключён'
            : 'Не подключён',
        },
        {
          to: '/settings/drive',
          glyph: <DriveIcon size={15} />,
          title: 'Google Диск',
          value: google?.linked?.drive ? google.linked.email || 'Подключён' : google?.configured ? 'Не подключён' : undefined,
        },
      ],
    },
    {
      title: 'Учёт',
      items: [
        { to: '/history', glyph: <History size={15} />, title: 'Хронология', value: 'по дням' },
        { to: '/mosaic', glyph: <MosaicIcon size={15} />, title: 'Мозаика', value: 'плитки дней' },
        { to: '/settings/plan', glyph: PlanGlyph, title: 'План часов', value: plan },
        { to: '/settings/export', glyph: <Download size={15} />, title: 'Экспорт отчёта', value: 'PDF и Excel' },
      ],
    },
    {
      title: 'О приложении',
      items: [
        {
          to: '/settings/tariff',
          glyph: TariffGlyph,
          title: 'Тариф',
          value: userPlan ? (userPlan.plan === 'lifetime' ? 'Пожизненный' : PLAN_NAME[userPlan.effective]) : undefined,
        },
        { to: '/changelog', glyph: <Sparkle size={15} />, title: 'История изменений', value: `Версия ${LATEST_RELEASE.version}` },
      ],
    },
  ]
}

/** Меню «Ещё» на телефоне: карточки групп, справа у пунктов — текущее значение. */
export function SettingsMenu() {
  const groups = useMenu()
  return (
    <>
      {groups.map((g) => (
        <section key={g.title} className="mt-5 flex flex-col gap-2">
          <Overline className="px-0.5">{g.title}</Overline>
          <ListGroup>
            {g.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5 active:bg-surface-sunken lg:hover:bg-surface-hover"
              >
                <Glyph>{item.glyph}</Glyph>
                <span className="min-w-0 flex-1 truncate text-base text-text">{item.title}</span>
                {item.value && <span className="max-w-[45%] truncate text-sm text-text-secondary">{item.value}</span>}
                <ChevronRight size={15} className="shrink-0 text-text-secondary" />
              </Link>
            ))}
          </ListGroup>
        </section>
      ))}
    </>
  )
}

/**
 * Колонка «Ещё» слева на десктопе: пункты без значений, открытый подсвечен — как настройки
 * в Linear. Ходить между пунктами можно, не возвращаясь в меню.
 */
function SettingsNav() {
  const groups = useMenu()
  const { pathname } = useLocation()
  return (
    <nav className="flex flex-col gap-4" aria-label="Разделы профиля">
      <Link
        to="/settings"
        className={`flex h-8 items-center rounded-sm px-2 text-sm font-medium ${
          pathname === '/settings' ? 'bg-surface-selected text-accent-text' : 'text-text-secondary hover:bg-surface-sunken hover:text-text'
        }`}
      >
        Профиль
      </Link>
      {groups.map((g) => (
        <section key={g.title} className="flex flex-col gap-0.5">
          <span className="px-2 pb-1 text-xs font-medium text-text-tertiary">{g.title}</span>
          {g.items.map((item) => {
            const active = (item.match ?? [item.to]).some((p) => pathname.startsWith(p))
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex h-8 items-center gap-2 rounded-sm px-2 text-sm font-medium ${
                  active ? 'bg-surface-selected text-accent-text' : 'text-text-secondary hover:bg-surface-sunken hover:text-text'
                }`}
              >
                <Glyph small>{item.glyph}</Glyph>
                <span className="truncate">{item.title}</span>
              </Link>
            )
          })}
        </section>
      ))}
    </nav>
  )
}

/**
 * Обёртка экранов «Ещё». На телефоне — только сам экран, как раньше. На десктопе слева
 * колонка меню (settings-shell в index.css), справа экран пункта.
 */
export function SettingsShell({ children }: { children: ReactNode }) {
  return (
    <div className="settings-shell">
      <aside className="hidden pt-3.5 lg:sticky lg:top-6 lg:block">
        <SettingsNav />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
