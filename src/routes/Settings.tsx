import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Overline, Tag, fieldClass } from '../components/ui'
import { buildReportData } from '../lib/report'
import { describeError, useToast } from '../lib/Toast'
import { useAuth } from '../lib/AuthContext'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useSetStatusFinal, useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useTimeEntriesInRange } from '../lib/queries/dashboard'
import { useSaveUserSettings, useUserSettings } from '../lib/queries/userSettings'
import { supabase } from '../lib/supabaseClient'
import { todayStr } from '../lib/period'

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
        style={{ background: 'rgba(232,163,61,.12)' }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium leading-[1.3] text-slate-100">{title}</span>
        <span className="block text-[11px] leading-[1.4] text-slate-500">{hint}</span>
      </span>
      <span className="shrink-0 text-slate-600">→</span>
    </Link>
  )
}

function StatusEditor() {
  const { data: statuses = [] } = useStatuses()
  const setStatusFinal = useSetStatusFinal()
  const { showError } = useToast()

  if (statuses.length === 0) return null

  return (
    <div
      className="flex flex-col gap-2.5 pt-4"
      style={{ borderTop: '1px solid var(--s-hairline-2)' }}
    >
      <Overline>Статусы · финальность</Overline>
      <div className="flex flex-col">
        {statuses.map((s) => (
          <div
            key={s.id}
            className="flex items-center gap-3 py-3"
            style={{ borderBottom: '1px solid var(--s-hairline-3)' }}
          >
            <span className="flex-1 text-sm text-slate-100">{s.label}</span>
            <button
              type="button"
              onClick={() =>
                setStatusFinal.mutate(
                  { id: s.id, isFinal: !s.is_final },
                  { onError: (e) => showError(describeError(e)) },
                )
              }
            >
              <Tag tone={s.is_final ? 'success' : 'neutral'}>{s.is_final ? 'финальный' : 'активный'}</Tag>
            </button>
          </div>
        ))}
        <Link to="/statuses" className="flex items-center gap-3 py-3 text-sm text-slate-500">
          <span className="font-mono text-xs text-sky-600">+</span>
          Новый статус
        </Link>
      </div>
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
        <span className="text-[14.5px] font-medium text-slate-100">Общий план часов</span>
        <span className="text-[11px] leading-[1.5] text-slate-500">
          Норма дня для кольца на «Сегодня» и сравнение с фактом в сводке. Приоритет у дневной цели.
        </span>
      </div>
      <div className="flex gap-[9px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="font-mono text-[10.5px] uppercase tracking-[.12em] text-slate-500">В день</span>
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
          <span className="font-mono text-[10.5px] uppercase tracking-[.12em] text-slate-500">В месяц</span>
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

function ExportSection() {
  const [from, setFrom] = useState(firstOfMonthStr())
  const [to, setTo] = useState(todayStr())
  const [generating, setGenerating] = useState<'excel' | 'pdf' | null>(null)
  const { showError } = useToast()

  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: sections = [] } = useSections()
  const { data: statuses = [] } = useStatuses()
  const { data: entries = [] } = useTimeEntriesInRange(`${from}T00:00:00`, `${to}T23:59:59.999`)

  async function handleExport(format: 'excel' | 'pdf') {
    setGenerating(format)
    try {
      const data = buildReportData(tasks, projects, sections, statuses, entries, from, to)
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

  const dateClass =
    'h-[34px] min-w-0 flex-1 rounded-[10px] px-2.5 font-mono text-[12.5px] text-slate-300 outline-none'
  const dateStyle = { background: '#0f0f13', border: '1px solid var(--s-border-strong)' }

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-3.5"
      style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
    >
      <div className="flex flex-col gap-1">
        <span className="text-[14.5px] font-medium text-slate-100">Экспорт отчёта</span>
        <span className="text-[11px] leading-[1.5] text-slate-500">
          Задачи и время за период — в Excel или PDF.
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateClass} style={dateStyle} />
        <span className="font-mono text-xs text-slate-600">—</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateClass} style={dateStyle} />
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

export function Settings() {
  const { session } = useAuth()
  const { data: sections = [] } = useSections()
  const { data: projects = [] } = useProjects()
  const { data: statuses = [] } = useStatuses()

  return (
    <div className="safe-top mx-auto flex max-w-lg flex-col gap-[9px] px-5 pt-3.5 pb-2 lg:mx-0 lg:max-w-2xl">
      <h1 className="mb-2 text-[26px] font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">Ещё</h1>

      <NavCard
        to="/sections"
        icon={SectionIcon}
        title="Разделы"
        hint={`Категории для аналитики план/факт · ${sections.length}`}
      />
      <NavCard
        to="/projects"
        icon={ProjectIcon}
        title="Проекты"
        hint={`Клиенты или направления работы · ${projects.length}`}
      />
      <NavCard
        to="/statuses"
        icon={StatusIcon}
        title="Статусы"
        hint={`Свой список статусов задач · ${statuses.length}`}
      />

      <div className="mt-3.5">
        <StatusEditor />
      </div>

      <div className="mt-3.5 flex flex-col gap-[9px]">
        <BudgetForm />
        <ExportSection />
      </div>

      <div className="mt-3.5 flex flex-col gap-3">
        <div
          className="flex items-center gap-3 rounded-2xl px-3.5 py-3.5"
          style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-border)' }}
        >
          <span
            className="h-[34px] w-[34px] shrink-0 rounded-full"
            style={{ background: '#1c1c22', border: '1px solid #2a2a30' }}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-100">{session?.user.email}</span>
            <span className="block font-mono text-[11px] text-slate-500">синхронизация включена</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="h-11 rounded-[14px] text-sm font-medium text-red-400"
          style={{ border: '1px solid rgba(217,114,86,.45)' }}
        >
          Выйти
        </button>
      </div>
    </div>
  )
}
