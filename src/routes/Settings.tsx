import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NotificationsCard, TelegramCard, ThemeCard } from '../components/AppPreferences'
import { CalendarCard, DriveCard } from '../components/IntegrationCards'
import { DatePicker } from '../components/DatePicker'
import { SettingsMenu, SettingsShell } from '../components/SettingsMenu'
import {
  ArrowLeft,
  Drive,
} from '../components/Icon'
import { Button, ListGroup, Overline, Segmented, fieldClass } from '../components/ui'
import { BUILD_TIME } from '../lib/appUpdate'
import { LATEST_RELEASE } from '../lib/changelog'
import { pickFromDrive, uploadToDrive, useGoogleStatus } from '../lib/google'
import type { ReportOptions } from '../lib/report'
import { useGroupItems, useGroups } from '../lib/queries/groups'
import { loadReport } from '../lib/queries/report'
import { describeError, useToast } from '../lib/Toast'
import { useAuth } from '../lib/AuthContext'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useSaveDriveReportsFolder, useSaveUserSettings, useUserSettings } from '../lib/queries/userSettings'
import { supabase } from '../lib/supabaseClient'
import { todayStr } from '../lib/period'
import { DEFAULT_WORK_DAYS, normSettingsOf } from '../lib/norm'

function firstOfMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/** Экран одного пункта «Ещё»: назад в меню, заголовок и сама настройка. */
function SettingsPage({ title, children }: { title: string; children: React.ReactNode }) {
  const navigate = useNavigate()
  // меню могли прокрутить вниз — экран пункта открываем с начала
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])
  return (
    <SettingsShell>
      <div className="safe-top-page page mx-auto flex max-w-lg flex-col gap-[9px] px-5 pt-3.5 pb-8">
        {/* на десктопе меню и так слева — кнопка «назад» не нужна */}
        <Button variant="ghost" className="-ml-3 self-start lg:hidden" onClick={() => navigate('/settings')}>
          <ArrowLeft size={16} />
          Ещё
        </Button>
        <h1 className="mb-2 text-xl font-semibold tracking-[-0.01em] text-text">{title}</h1>
        {children}
      </div>
    </SettingsShell>
  )
}

const WORK_DAY_OPTIONS = [3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: String(n) }))
const WORK_DAY_HINT: Record<number, string> = {
  3: 'Пн–ср',
  4: 'Пн–чт',
  5: 'Пн–пт, суббота и воскресенье — выходные',
  6: 'Пн–сб, воскресенье — выходной',
  7: 'Без выходных',
}

function BudgetForm() {
  const { data: settings } = useUserSettings()
  const saveSettings = useSaveUserSettings()
  const { showError, showSuccess } = useToast()

  const [perDay, setPerDay] = useState('')
  const [perMonth, setPerMonth] = useState('')
  const [workDays, setWorkDays] = useState(DEFAULT_WORK_DAYS)

  useEffect(() => {
    setWorkDays(normSettingsOf(settings).workDays)
    setPerDay(settings?.planned_hours_per_day != null ? String(settings.planned_hours_per_day) : '')
    setPerMonth(settings?.planned_hours_per_month != null ? String(settings.planned_hours_per_month) : '')
  }, [settings])

  return (
    <div
      className="flex flex-col gap-3 rounded-md p-3.5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs leading-[1.5] text-text-secondary">
          День — для кольца на «Сегодня». Месяц — норма периода в сводке и отчёте; без него норма — день × рабочие дни.
        </span>
      </div>
      <div className="flex gap-[9px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary">В день</span>
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
          <span className="text-sm font-medium text-text-secondary">В месяц</span>
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
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Рабочих дней в неделе</span>
        <Segmented
          value={String(workDays)}
          onChange={(v) => setWorkDays(Number(v))}
          options={WORK_DAY_OPTIONS}
          stretch
        />
        <span className="text-xs text-text-secondary">{WORK_DAY_HINT[workDays] ?? ''}</span>
      </div>
      <button
        type="button"
        onClick={() =>
          saveSettings.mutate(
            {
              planned_hours_per_day: perDay.trim() ? Number(perDay) : null,
              planned_hours_per_month: perMonth.trim() ? Number(perMonth) : null,
              work_days_per_week: workDays,
            },
            { onError: (e) => showError(describeError(e)), onSuccess: () => showSuccess('Сохранено') },
          )
        }
        className="h-11 rounded-sm text-base font-semibold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
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
  const [generating, setGenerating] = useState<'excel' | 'pdf' | 'drive-excel' | 'drive-pdf' | null>(null)
  const { data: google } = useGoogleStatus()
  const { data: settings } = useUserSettings()
  const saveFolder = useSaveDriveReportsFolder()
  const { showError, showSuccess } = useToast()

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

  /** отчёт — сразу на Google Диск, в папку для отчётов (её выбирают один раз) */
  async function saveToDrive(format: 'excel' | 'pdf') {
    if (!google) return
    if (from > to) {
      showError('Начало периода позже конца — поменяйте даты местами')
      return
    }
    try {
      let folder = settings?.drive_reports_folder_id
        ? { id: settings.drive_reports_folder_id, name: settings.drive_reports_folder_name ?? '' }
        : null
      if (!folder) {
        const [picked] = await pickFromDrive(google, { folders: true })
        if (!picked) return
        folder = { id: picked.id, name: picked.name }
        saveFolder.mutate(folder)
      }
      setGenerating(format === 'excel' ? 'drive-excel' : 'drive-pdf')
      const data = await loadReport({ from, to, tasks, groups, items, statuses, options })
      let blob: Blob
      let name: string
      if (format === 'excel') {
        const { buildWorkbook } = await import('../lib/exportExcel')
        const buffer = await buildWorkbook(data).xlsx.writeBuffer()
        blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        name = `Отчёт_${from}_${to}.xlsx`
      } else {
        const { renderPdf } = await import('../lib/exportPdf')
        blob = renderPdf(data).output('blob')
        name = `Отчёт_${from}_${to}.pdf`
      }
      const link = await uploadToDrive(blob, name, folder.id)
      showSuccess(`Отчёт на Диске${folder.name ? ` в «${folder.name}»` : ''}`, {
        label: 'Открыть',
        onAction: () => window.open(link, '_blank', 'noopener'),
      })
    } catch (e) {
      showError(describeError(e))
    } finally {
      setGenerating(null)
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-md p-3.5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-xs leading-[1.5] text-text-secondary">
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
        <span className="font-mono text-sm text-text-secondary">—</span>
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
              className="h-[18px] w-[18px] shrink-0 accent-accent"
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-base text-text-secondary">{o.title}</span>
              <span className="text-xs leading-[1.4] text-text-secondary">{o.hint}</span>
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
            className="h-11 flex-1 rounded-sm text-base font-medium text-text-secondary disabled:opacity-50"
            style={{ border: '1px solid var(--border-strong)' }}
          >
            {generating === format ? 'Готовим…' : format === 'excel' ? 'Скачать Excel' : 'Скачать PDF'}
          </button>
        ))}
      </div>
      {google?.linked?.drive && (
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-[9px]">
            {(['excel', 'pdf'] as const).map((format) => (
              <button
                key={format}
                type="button"
                onClick={() => saveToDrive(format)}
                disabled={generating !== null}
                className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-sm text-base font-medium text-text-secondary disabled:opacity-50"
                style={{ border: '1px solid var(--border-strong)' }}
              >
                <Drive size={14} />
                {generating === `drive-${format}` ? 'Кладём на Диск…' : format === 'excel' ? 'Excel на Диск' : 'PDF на Диск'}
              </button>
            ))}
          </div>
          <span className="text-center text-xs text-text-secondary">
            {settings?.drive_reports_folder_name
              ? `в папку «${settings.drive_reports_folder_name}» · сменить — в «Google Диск»`
              : 'папку выберете при первой выгрузке'}
          </span>
        </div>
      )}
    </div>
  )
}

/**
 * «Ещё» — меню: раньше все настройки лежали на одной странице, и она была перегружена.
 * Справа у пунктов — текущее значение, чтобы не открывать каждый ради проверки.
 */
export function Settings() {
  const { session } = useAuth()

  const account = (
    <section className="mt-5 flex flex-col gap-2">
      <Overline className="px-0.5 lg:hidden">Аккаунт</Overline>
      <ListGroup>
        <div className="flex min-h-[52px] items-center gap-3 px-3.5 py-2.5">
          {/* инициал вместо пустого серого круга */}
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-text uppercase"
            aria-hidden
          >
            {session?.user.email?.[0] ?? '?'}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base text-text">{session?.user.email}</span>
            <span className="block text-sm text-text-secondary">Синхронизация включена</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="flex min-h-[52px] items-center px-3.5 text-left text-base font-medium text-danger-text active:bg-surface-sunken lg:hover:bg-surface-hover"
        >
          Выйти
        </button>
      </ListGroup>
    </section>
  )

  return (
    <SettingsShell>
      <div className="safe-top-page page mx-auto flex max-w-lg flex-col px-5 pt-3.5 pb-4">
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">
          <span className="lg:hidden">Ещё</span>
          <span className="hidden lg:inline">Аккаунт</span>
        </h1>
        {/* на десктопе пункты — в колонке слева, здесь только аккаунт */}
        <div className="flex flex-col lg:hidden">
          <SettingsMenu />
        </div>
        {account}

        <span className="mt-4 pb-1 text-center font-mono text-xs text-text-secondary lg:text-left">
          Версия {LATEST_RELEASE.version} · сборка от{' '}
          {new Date(BUILD_TIME).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </SettingsShell>
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

export function CalendarSettings() {
  return (
    <SettingsPage title="Google Календарь">
      <CalendarCard />
    </SettingsPage>
  )
}

export function DriveSettings() {
  return (
    <SettingsPage title="Google Диск">
      <DriveCard />
    </SettingsPage>
  )
}
