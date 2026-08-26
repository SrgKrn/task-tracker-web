import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { buildReportData } from '../lib/report'
import { describeError, useToast } from '../lib/Toast'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useTimeEntriesInRange } from '../lib/queries/dashboard'
import { useSaveUserSettings, useUserSettings } from '../lib/queries/userSettings'
import { supabase } from '../lib/supabaseClient'

const links = [
  { to: '/sections', label: 'Разделы', hint: 'Категории для аналитики план/факт' },
  { to: '/projects', label: 'Проекты', hint: 'Клиенты или направления работы' },
  { to: '/statuses', label: 'Статусы', hint: 'Свой список статусов задач' },
]

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function firstOfMonthStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
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

  function handleSave() {
    saveSettings.mutate(
      {
        planned_hours_per_day: perDay.trim() ? Number(perDay) : null,
        planned_hours_per_month: perMonth.trim() ? Number(perMonth) : null,
      },
      {
        onError: (e) => showError(describeError(e)),
        onSuccess: () => showSuccess('Сохранено'),
      },
    )
  }

  const fieldClass =
    'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none'

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
      <p className="mb-1 text-slate-100">Общий план часов</p>
      <p className="mb-3 text-xs text-slate-500">
        Личная цель по загрузке — используется на дашборде для сравнения с фактом. Можно задать одно
        значение или оба сразу; при расчёте на произвольный период приоритет у дневного.
      </p>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-400">Часов в день</label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={perDay}
            onChange={(e) => setPerDay(e.target.value)}
            className={fieldClass}
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-400">Часов в месяц</label>
          <input
            type="number"
            min="0"
            step="1"
            value={perMonth}
            onChange={(e) => setPerMonth(e.target.value)}
            className={fieldClass}
          />
        </div>
      </div>
      <button
        onClick={handleSave}
        className="mt-3 w-full rounded-lg bg-sky-600 px-4 py-2 font-medium text-slate-900 active:bg-sky-700"
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

  const fieldClass =
    'min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none'

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
      <p className="mb-1 text-slate-100">Экспорт отчёта</p>
      <p className="mb-3 text-xs text-slate-500">
        Все задачи и время за выбранный период — в Excel или PDF.
      </p>
      <div className="mb-3 flex gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => handleExport('excel')}
          disabled={generating !== null}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-300 disabled:opacity-50 active:bg-slate-700"
        >
          {generating === 'excel' ? 'Готовим…' : 'Скачать Excel'}
        </button>
        <button
          onClick={() => handleExport('pdf')}
          disabled={generating !== null}
          className="flex-1 rounded-lg border border-slate-700 px-4 py-2 font-medium text-slate-300 disabled:opacity-50 active:bg-slate-700"
        >
          {generating === 'pdf' ? 'Готовим…' : 'Скачать PDF'}
        </button>
      </div>
    </div>
  )
}

export function Settings() {
  return (
    <div className="mx-auto max-w-lg px-4 py-6 safe-top">
      <h1 className="mb-4 text-xl font-semibold text-slate-100">Настройки</h1>

      <div className="mb-4 space-y-2">
        {links.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/60 px-4 py-3"
          >
            <div>
              <p className="text-slate-100">{link.label}</p>
              <p className="text-xs text-slate-500">{link.hint}</p>
            </div>
            <span className="text-slate-500">→</span>
          </Link>
        ))}
      </div>

      <div className="mb-4">
        <BudgetForm />
      </div>

      <div className="mb-4">
        <ExportSection />
      </div>

      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-6 w-full rounded-lg border border-red-800 px-4 py-2.5 font-medium text-red-400 active:bg-red-950"
      >
        Выйти
      </button>
    </div>
  )
}
