import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { NotificationsCard, TelegramCard, ThemeCard } from '../components/AppPreferences'
import { DatePicker } from '../components/DatePicker'
import { ArrowRight } from '../components/Icon'
import { Overline, fieldClass } from '../components/ui'
import { BUILD_TIME } from '../lib/appUpdate'
import { LATEST_RELEASE } from '../lib/changelog'
import { useGroupModel } from '../lib/groups'
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
import { plural } from '../lib/time'

function firstOfMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const SectionIcon = (
  <span className="h-3.5 w-3.5 rotate-45 rounded-[3px]" style={{ border: '1.5px solid var(--s-accent)' }} />
)
const ProjectIcon = (
  <span className="h-3 w-[15px] rounded-[3px]" style={{ border: '1.5px solid var(--s-accent)' }} />
)
const StatusIcon = (
  <span className="h-3.5 w-3.5 rounded-full" style={{ border: '1.5px solid var(--s-accent)' }} />
)
const BuilderIcon = (
  <span className="relative h-3.5 w-3.5">
    <span className="absolute top-0 left-0 h-2 w-2 rounded-[2px]" style={{ border: '1.5px solid var(--s-accent)' }} />
    <span className="absolute right-0 bottom-0 h-2 w-2 rounded-[2px]" style={{ border: '1.5px solid var(--s-accent)' }} />
  </span>
)
const HistoryIcon = (
  <span className="flex h-3.5 w-3.5 flex-col justify-between py-[1px]">
    <span className="h-[1.5px] w-full rounded-full" style={{ background: 'var(--s-accent)' }} />
    <span className="h-[1.5px] w-3/4 rounded-full" style={{ background: 'var(--s-accent)' }} />
    <span className="h-[1.5px] w-1/2 rounded-full" style={{ background: 'var(--s-accent)' }} />
  </span>
)

/** Заголовок блока на экране «Ещё»: раньше двенадцать карточек шли сплошной лентой. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 flex flex-col gap-[9px]">
      <Overline className="px-0.5">{title}</Overline>
      {children}
    </section>
  )
}

function NavCard({
  to,
  icon,
  title,
  hint,
}: {
  to: string
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3.5 rounded-2xl p-3.5"
      style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
    >
      <span
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: 'var(--s-accent-ghost)' }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-[1.3] text-slate-100">{title}</span>
        <span className="block text-2xs leading-[1.4] text-slate-500">{hint}</span>
      </span>
      <ArrowRight size={16} className="text-slate-600" />
    </Link>
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
        <span className="text-sm font-medium text-slate-100">Общий план часов</span>
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
        <span className="text-sm font-medium text-slate-100">Экспорт отчёта</span>
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

const VALUES: [string, string, string] = ['значение', 'значения', 'значений']

export function Settings() {
  const { session } = useAuth()
  const model = useGroupModel()
  const { data: statuses = [] } = useStatuses()

  return (
    <div className="safe-top mx-auto flex max-w-lg flex-col px-5 pt-3.5 pb-2 lg:mx-0 lg:max-w-2xl">
      <h1 className="text-2xl font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">Ещё</h1>

      <Block title="Группы">
        {model.groups.map((g, i) => {
          const parent = g.parent_group_id ? model.groupById.get(g.parent_group_id) : undefined
          const count = model.itemsOf(g.id).filter((x) => !x.archived).length
          return (
            <NavCard
              key={g.id}
              to={`/groups/${g.id}`}
              icon={i % 2 === 0 ? SectionIcon : ProjectIcon}
              title={g.name}
              hint={[plural(count, VALUES), parent ? `входит в «${parent.name}»` : null].filter(Boolean).join(' · ')}
            />
          )
        })}
        <NavCard to="/statuses" icon={StatusIcon} title="Статусы" hint={`Этапы задачи и что считается готовым · ${statuses.length}`} />
        <NavCard
          to="/groups"
          icon={BuilderIcon}
          title="Конструктор групп"
          hint="Добавить свою группу, связать группы, поменять порядок или удалить"
        />
      </Block>

      <Block title="Настройки">
        <ThemeCard />
        <NotificationsCard />
      </Block>

      <Block title="Интеграции">
        <TelegramCard />
      </Block>

      <Block title="Планы и аналитика">
        <BudgetForm />
        <ExportSection />
      </Block>

      <Block title="Аккаунт">
        <div
          className="flex items-center gap-3 rounded-2xl px-3.5 py-3.5"
          style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-border)' }}
        >
          <span
            className="h-[34px] w-[34px] shrink-0 rounded-full"
            style={{ background: 'var(--s-avatar)', border: '1px solid var(--s-avatar-border)' }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-100">{session?.user.email}</span>
            <span className="block font-mono text-2xs text-slate-500">синхронизация включена</span>
          </span>
        </div>
        <NavCard
          to="/changelog"
          icon={HistoryIcon}
          title="История изменений"
          hint={`Что нового в версии ${LATEST_RELEASE.version} и раньше`}
        />
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="h-11 rounded-[14px] text-sm font-medium text-red-400"
          style={{ border: '1px solid var(--s-danger-line)' }}
        >
          Выйти
        </button>
        <span className="pb-1 text-center font-mono text-2xs text-slate-600">
          Версия {LATEST_RELEASE.version} · сборка от{' '}
          {new Date(BUILD_TIME).toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </Block>
    </div>
  )
}
