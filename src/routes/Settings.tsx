import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { NotificationsCard, TelegramCard, ThemeCard } from '../components/AppPreferences'
import { DatePicker } from '../components/DatePicker'
import { ArrowLeft, Bell, Check, ChevronRight, Download, Send, Sparkle } from '../components/Icon'
import { Overline, fieldClass } from '../components/ui'
import { BUILD_TIME } from '../lib/appUpdate'
import { LATEST_RELEASE } from '../lib/changelog'
import { useGroupModel } from '../lib/groups'
import { usePush, type PushState } from '../lib/push'
import { useTelegramStatus } from '../lib/telegram'
import { useTheme, type ThemeChoice } from '../lib/theme'
import type { ReportOptions } from '../lib/report'
import { useGroupItems, useGroups } from '../lib/queries/groups'
import { loadReport } from '../lib/queries/report'
import { describeError, useToast } from '../lib/Toast'
import { useAuth } from '../lib/AuthContext'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useSaveUserSettings, useUserSettings } from '../lib/queries/userSettings'
import { supabase } from '../lib/supabaseClient'
import { todayStr } from '../lib/period'
import { formatHoursRu } from '../lib/time'

function firstOfMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/* ── меню «Ещё» ─────────────────────────────────────────────────── */

/** Плитка со значком слева от строки меню: тон отличает статусы от групп и прочего. */
function Glyph({ children, tone = 'accent' }: { children: React.ReactNode; tone?: 'accent' | 'success' | 'neutral' }) {
  const bg = tone === 'success' ? 'var(--s-success-ghost)' : tone === 'neutral' ? 'var(--s-tag)' : 'var(--s-accent-ghost)'
  const fg = tone === 'success' ? 'var(--s-success-text)' : tone === 'neutral' ? 'var(--s-text-soft)' : 'var(--s-accent-text)'
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px]" style={{ background: bg, color: fg }}>
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

/** Группа строк меню — одна карточка, строки разделены линией, а не отдельными плашками. */
function MenuGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 flex flex-col gap-2">
      <Overline className="px-0.5">{title}</Overline>
      <div
        className="flex flex-col overflow-hidden rounded-2xl [&>*+*]:border-t [&>*+*]:border-[var(--s-hairline-2)]"
        style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
      >
        {children}
      </div>
    </section>
  )
}

function MenuRow({
  to,
  glyph,
  title,
  value,
}: {
  to: string
  glyph: React.ReactNode
  title: string
  value?: string
}) {
  return (
    <Link to={to} className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5 lg:hover:bg-[var(--s-surface-active)]">
      {glyph}
      <span className="min-w-0 flex-1 truncate text-sm text-slate-100">{title}</span>
      {value && <span className="max-w-[45%] truncate text-xs text-slate-500">{value}</span>}
      <ChevronRight size={15} className="shrink-0 text-slate-600" />
    </Link>
  )
}

/** Экран одного пункта «Ещё»: назад в меню, заголовок и сама настройка. */
function SettingsPage({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate()
  // меню могли прокрутить вниз — экран пункта открываем с начала
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <div className="safe-top mx-auto flex max-w-lg flex-col gap-[9px] px-5 pt-3.5 pb-8 lg:mx-0 lg:max-w-2xl">
      <button
        type="button"
        onClick={() => navigate('/settings')}
        className="-my-2.5 mb-1 flex items-center gap-2 self-start py-2.5 text-sm text-slate-400"
      >
        <ArrowLeft size={15} />
        Ещё
      </button>
      <h1 className="mb-2 text-2xl font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">{title}</h1>
      {children}
    </div>
  )
}

function BudgetForm() {
  const { data: settings } = useUserSettings()
  const saveSettings = useSaveUserSettings()
  const { showError, showSuccess } = useToast()

  const [perDay, setPerDay] = useState('')
  const [perMonth, setPerMonth] = useState('')

  useEffect(() => {
    setPerDay(settings?.planned_hours_per_day != null ? String(settings.planned_hours_per_day) : '')
    setPerMonth(settings?.planned_hours_per_month != null ? String(settings.planned_hours_per_month) : '')
  }, [settings])

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-3.5"
      style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-2xs leading-[1.5] text-slate-500">
          Норма дня для кольца на «Сегодня» и сравнение с фактом в сводке. Приоритет у дневной цели.
        </span>
      </div>
      <div className="flex gap-[9px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="font-mono text-2xs uppercase tracking-[.12em] text-slate-500">В день</span>
          <input
            type="number"
            min="0"
            step="0.5"
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            className={`${fieldClass} tabular font-mono`}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="font-mono text-2xs uppercase tracking-[.12em] text-slate-500">В месяц</span>
          <input
            type="number"
            min="0"
            step="1"
            value={perMonth}
            onChange={(e) => setPerMonth(e.target.value)}
            className={`${fieldClass} tabular font-mono`}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          saveSettings.mutate(
            {
              planned_hours_per_day: perDay.trim() ? Number(perDay) : null,
              planned_hours_per_month: perMonth.trim() ? Number(perMonth) : null,
            },
            { onError: (e) => showError(describeError(e)), onSuccess: () => showSuccess('Сохранено') },
          )
        }
        className="h-11 rounded-[14px] text-sm font-semibold"
        style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
      >
        Сохранить
      </button>
    </div>
  )
}

const EXPORT_RANGE_KEY = 'semternity.exportRange'

/** последний диапазон экспорта — локальная привычка устройства, синхронизировать нечего */
function loadExportRange(): { from: string; to: string } {
  try {
    const raw = localStorage.getItem(EXPORT_RANGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { from?: unknown; to?: unknown }
      if (typeof parsed.from === 'string' && typeof parsed.to === 'string') {
        return { from: parsed.from, to: parsed.to }
      }
    }
  } catch {
    // приватный режим или испорченное значение — просто берём период по умолчанию
  }
  return { from: firstOfMonthStr(), to: todayStr() }
}

const EXPORT_OPTIONS_KEY = 'semternity.exportOptions'

/** галочки выгрузки по умолчанию выключены: проверка и комментарии — для себя, не для отчёта наружу */
function loadExportOptions(): ReportOptions {
  try {
    const raw = localStorage.getItem(EXPORT_OPTIONS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReportOptions>
      return { includeChecks: parsed.includeChecks === true, includeComments: parsed.includeComments === true }
    }
  } catch {
    // приватный режим или испорченное значение — берём значения по умолчанию
  }
  return { includeChecks: false, includeComments: false }
}

function ExportSection() {
  const [range, setRange] = useState(loadExportRange)
  const [options, setOptions] = useState(loadExportOptions)
  const { from, to } = range
  const [generating, setGenerating] = useState<'excel' | 'pdf' | null>(null)
  const { showError } = useToast()

  function setFrom(value: string) {
    setRange((prev) => {
      const next = { ...prev, from: value }
      try {
        localStorage.setItem(EXPORT_RANGE_KEY, JSON.stringify(next))
      } catch {
        // не смогли запомнить — не повод ломать экспорт
      }
      return next
    })
  }

  function setTo(value: string) {
    setRange((prev) => {
      const next = { ...prev, to: value }
      try {
        localStorage.setItem(EXPORT_RANGE_KEY, JSON.stringify(next))
      } catch {
        // не смогли запомнить — не повод ломать экспорт
      }
      return next
    })
  }

  const { data: tasks = [] } = useTasks()
  const { data: groups = [] } = useGroups()
  const { data: items = [] } = useGroupItems()
  const { data: statuses = [] } = useStatuses()

  function setOption(key: keyof ReportOptions, value: boolean) {
    setOptions((prev) => {
      const next = { ...prev, [key]: value }
      try {
        localStorage.setItem(EXPORT_OPTIONS_KEY, JSON.stringify(next))
      } catch {
        // не смогли запомнить — галочки просто сбросятся при следующем открытии
      }
      return next
    })
  }

  async function handleExport(format: 'excel' | 'pdf') {
    if (from > to) {
      showError('Начало периода позже конца — поменяйте даты местами')
      return
    }
    setGenerating(format)
    try {
      // записи, комментарии и закрытия грузятся в момент выгрузки: отчёту нужен ещё
      // и прошлый период для сравнения, держать всё это на экране «Ещё» незачем
      const data = await loadReport({ from, to, tasks, groups, items, statuses, options })
      if (format === 'excel') {
        const { exportExcel } = await import('../lib/exportExcel')
        await exportExcel(data)
      } else {
        const { exportPdf } = await import('../lib/exportPdf')
        await exportPdf(data)
      }
    } catch (e) {
      showError(describeError(e))
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-3.5"
      style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-2xs leading-[1.5] text-slate-500">
          Итоги и ритм, разрезы по группам, спринты против плана, журнал по дням. PDF — чтобы
          читать и отправлять, Excel — чтобы разбирать самому.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <DatePicker
          small
          className="flex-1"
          ariaLabel="Отчёт с"
          value={from}
          onChange={(v) => setFrom(v ?? todayStr())}
        />
        <span className="font-mono text-xs text-slate-600">—</span>
        <DatePicker
          small
          className="flex-1"
          ariaLabel="Отчёт до"
          value={to}
          onChange={(v) => setTo(v ?? todayStr())}
        />
      </div>
      <div className="-my-1 flex flex-col">
        {/* вся строка — цель нажатия, как у «Ежедневной» в карточке задачи */}
        {(
          [
            {
              key: 'includeComments',
              title: 'Комментарии в журнале',
              hint: 'к задачам и к сессиям учёта; пишутся для себя — включайте, если отчёт не уходит дальше',
            },
            {
              key: 'includeChecks',
              title: 'Проверка учёта',
              hint: 'ночные таймеры, дни в минусе, будни без записей — только в PDF',
            },
          ] as const
        ).map((o) => (
          <label key={o.key} className="flex min-h-11 items-center gap-2.5 py-1">
            <input
              type="checkbox"
              checked={options[o.key]}
              onChange={(e) => setOption(o.key, e.target.checked)}
              className="h-[18px] w-[18px] shrink-0 accent-sky-600"
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm text-slate-300">{o.title}</span>
              <span className="text-2xs leading-[1.4] text-slate-500">{o.hint}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex gap-[9px]">
        {(['excel', 'pdf'] as const).map((format) => (
          <button
            key={format}
            type="button"
            onClick={() => handleExport(format)}
            disabled={generating !== null}
            className="h-11 flex-1 rounded-[14px] text-sm font-medium text-slate-300 disabled:opacity-50"
            style={{ border: '1px solid var(--s-border-strong-2)' }}
          >
            {generating === format ? 'Готовим…' : format === 'excel' ? 'Скачать Excel' : 'Скачать PDF'}
          </button>
        ))}
      </div>
    </div>
  )
}

const THEME_LABEL: Record<ThemeChoice, string> = { dark: 'Тёмная', light: 'Светлая', system: 'Как в системе' }
const PUSH_LABEL: Record<PushState, string> = {
  on: 'Включены',
  off: 'Выключены',
  denied: 'Запрещены',
  'needs-install': 'Нужна установка',
  unsupported: 'Недоступны',
}

/**
 * «Ещё» — меню: раньше все настройки лежали на одной странице, и она была перегружена.
 * Справа у пунктов — текущее значение, чтобы не открывать каждый ради проверки.
 */
export function Settings() {
  const { session } = useAuth()
  const model = useGroupModel()
  const { data: statuses = [] } = useStatuses()
  const theme = useTheme()
  const push = usePush()
  const { data: telegram } = useTelegramStatus()
  const { data: userSettings } = useUserSettings()

  const plan = userSettings?.planned_hours_per_day
    ? `${formatHoursRu(Number(userSettings.planned_hours_per_day))} ч в день`
    : userSettings?.planned_hours_per_month
      ? `${formatHoursRu(Number(userSettings.planned_hours_per_month))} ч в месяц`
      : 'Не задан'
  const tg = telegram?.linked
    ? telegram.linked.username
      ? `@${telegram.linked.username}`
      : 'Подключён'
    : telegram?.configured
      ? 'Не подключён'
      : undefined

  return (
    <div className="safe-top mx-auto flex max-w-lg flex-col px-5 pt-3.5 pb-4 lg:mx-0 lg:max-w-2xl">
      <h1 className="text-2xl font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">Ещё</h1>

      <MenuGroup title="Группы">
        <MenuRow
          to="/groups"
          glyph={<Glyph>{GroupsGlyph}</Glyph>}
          title="Группы"
          value={model.groups.map((g) => g.name).join(', ') || 'Нет групп'}
        />
      </MenuGroup>

      {/* статусы — не группа, а этап задачи: отдельным блоком и другим цветом */}
      <MenuGroup title="Этапы задач">
        <MenuRow to="/statuses" glyph={<Glyph tone="success">{StatusGlyph}</Glyph>} title="Статусы" value={String(statuses.length)} />
      </MenuGroup>

      <MenuGroup title="Настройки">
        <MenuRow to="/settings/appearance" glyph={<Glyph>{ThemeGlyph}</Glyph>} title="Оформление" value={THEME_LABEL[theme]} />
        <MenuRow
          to="/settings/notifications"
          glyph={<Glyph><Bell size={15} /></Glyph>}
          title="Уведомления"
          value={push.state ? PUSH_LABEL[push.state] : undefined}
        />
      </MenuGroup>

      <MenuGroup title="Интеграции">
        <MenuRow to="/settings/telegram" glyph={<Glyph><Send size={15} /></Glyph>} title="Telegram" value={tg} />
      </MenuGroup>

      <MenuGroup title="Планы и аналитика">
        <MenuRow to="/settings/plan" glyph={<Glyph>{PlanGlyph}</Glyph>} title="План часов" value={plan} />
        <MenuRow to="/settings/export" glyph={<Glyph><Download size={15} /></Glyph>} title="Экспорт отчёта" value="PDF и Excel" />
      </MenuGroup>

      <MenuGroup title="О приложении">
        <MenuRow
          to="/changelog"
          glyph={<Glyph tone="neutral"><Sparkle size={15} /></Glyph>}
          title="История изменений"
          value={`Версия ${LATEST_RELEASE.version}`}
        />
      </MenuGroup>

      <MenuGroup title="Аккаунт">
        <div className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5">
          <span
            className="h-[30px] w-[30px] shrink-0 rounded-full"
            style={{ background: 'var(--s-avatar)', border: '1px solid var(--s-avatar-border)' }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-slate-100">{session?.user.email}</span>
            <span className="block font-mono text-2xs text-slate-500">синхронизация включена</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="flex min-h-[52px] items-center px-3.5 text-left text-sm text-red-400"
        >
          Выйти
        </button>
      </MenuGroup>

      <span className="mt-4 pb-1 text-center font-mono text-2xs text-slate-600">
        Версия {LATEST_RELEASE.version} · сборка от{' '}
        {new Date(BUILD_TIME).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}

export function AppearanceSettings() {
  return (
    <SettingsPage title="Оформление">
      <ThemeCard />
    </SettingsPage>
  )
}

export function NotificationSettings() {
  return (
    <SettingsPage title="Уведомления">
      <NotificationsCard />
    </SettingsPage>
  )
}

export function TelegramSettings() {
  return (
    <SettingsPage title="Telegram">
      <TelegramCard />
    </SettingsPage>
  )
}

export function PlanSettings() {
  return (
    <SettingsPage title="План часов">
      <BudgetForm />
    </SettingsPage>
  )
}

export function ExportSettings() {
  return (
    <SettingsPage title="Экспорт отчёта">
      <ExportSection />
    </SettingsPage>
  )
}
