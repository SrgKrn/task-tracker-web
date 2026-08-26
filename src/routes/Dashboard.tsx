import { useMemo, useState } from 'react'
import {
  daysBetweenInclusive,
  daysInCalendarMonth,
  overlapsPeriod,
  PERIOD_PRESETS,
  rangeForPreset,
  type PeriodPreset,
} from '../lib/period'
import { useTimeEntriesInRange } from '../lib/queries/dashboard'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useUserSettings } from '../lib/queries/userSettings'
import { formatHours } from '../lib/time'

type GroupBy = 'project' | 'section'
type PresetKey = PeriodPreset['key'] | 'custom'

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Dashboard() {
  const [preset, setPreset] = useState<PresetKey>('this_month')
  const [customFrom, setCustomFrom] = useState(todayStr())
  const [customTo, setCustomTo] = useState(todayStr())
  const [groupBy, setGroupBy] = useState<GroupBy>('project')

  const { from, to } = preset === 'custom' ? { from: customFrom, to: customTo } : rangeForPreset(preset)

  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: sections = [] } = useSections()
  const { data: statuses = [] } = useStatuses()
  const { data: userSettings } = useUserSettings()
  // time_entries.created_at is a timestamp — widen the date-only range to a half-open instant range
  const { data: entries = [] } = useTimeEntriesInRange(`${from}T00:00:00`, `${to}T23:59:59.999`)

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])

  const factByTask = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) map.set(e.task_id, (map.get(e.task_id) ?? 0) + e.duration_minutes)
    return map
  }, [entries])

  const totalFactHours = useMemo(
    () => entries.reduce((sum, e) => sum + e.duration_minutes, 0) / 60,
    [entries],
  )

  const totalOverHours = useMemo(() => {
    let sum = 0
    for (const t of tasks) {
      const minutes = factByTask.get(t.id)
      if (!minutes) continue
      const factH = minutes / 60
      if (t.planned_hours > 0 && factH > t.planned_hours) sum += factH - t.planned_hours
    }
    return sum
  }, [tasks, factByTask])

  const closedCount = useMemo(
    () =>
      tasks.filter((t) => {
        if (!t.status_id || !statusById.get(t.status_id)?.is_final) return false
        return t.updated_at >= `${from}T00:00:00` && t.updated_at <= `${to}T23:59:59.999`
      }).length,
    [tasks, statusById, from, to],
  )

  const daysInPeriod = daysBetweenInclusive(from, to)
  const dailyTarget = userSettings?.planned_hours_per_day ?? null
  const monthlyTarget = userSettings?.planned_hours_per_month ?? null
  const isProrated = !dailyTarget && !!monthlyTarget
  const planForPeriod = dailyTarget
    ? dailyTarget * daysInPeriod
    : monthlyTarget
      ? monthlyTarget * (daysInPeriod / daysInCalendarMonth(from))
      : null

  const rows = useMemo(() => {
    const buckets = groupBy === 'project' ? projects : sections
    const key = groupBy === 'project' ? 'project_id' : 'section_id'
    return buckets
      .map((bucket) => {
        const bucketTasks = tasks.filter((t) => t[key as 'project_id' | 'section_id'] === bucket.id)
        const planHours = bucketTasks
          .filter((t) => overlapsPeriod(t, from, to))
          .reduce((sum, t) => sum + t.planned_hours, 0)
        let factHours = 0
        let overHours = 0
        for (const t of bucketTasks) {
          const minutes = factByTask.get(t.id)
          if (!minutes) continue
          const factH = minutes / 60
          factHours += factH
          if (t.planned_hours > 0 && factH > t.planned_hours) overHours += factH - t.planned_hours
        }
        return { id: bucket.id, name: bucket.name, planHours, factHours, overHours }
      })
      .filter((r) => r.planHours > 0 || r.factHours > 0)
      .sort((a, b) => b.factHours - a.factHours)
  }, [groupBy, projects, sections, tasks, factByTask, from, to])

  return (
    <div className="mx-auto max-w-lg px-4 py-4 safe-top lg:max-w-3xl">
      <h1 className="mb-3 text-xl font-semibold text-slate-100">Дашборд</h1>

      <div className="mb-3 flex gap-1 rounded-lg bg-slate-800 p-1 text-sm lg:max-w-md">
        {[...PERIOD_PRESETS, { key: 'custom' as const, label: 'Свой диапазон' }].map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`flex-1 rounded-md py-1.5 ${
              preset === p.key ? 'bg-sky-600 text-slate-900' : 'text-slate-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="mb-4 flex gap-2 lg:max-w-xs">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          />
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <p className="text-xs text-slate-500">Часов затрачено</p>
          <p className="text-lg font-semibold tabular-nums text-slate-100">{formatHours(totalFactHours)}</p>
        </div>
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <p className="text-xs text-slate-500">Задач закрыто</p>
          <p className="text-lg font-semibold tabular-nums text-slate-100">{closedCount}</p>
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        «Задач закрыто» — по дате последнего изменения задачи, а не по учёту истории смены статусов.
      </p>

      {planForPeriod !== null && (
        <div className="mb-4 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <p className="mb-2 text-sm font-medium text-slate-100">Общий план</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs text-slate-500">План</p>
              <p className="tabular-nums text-slate-100">{formatHours(planForPeriod)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Факт</p>
              <p className="tabular-nums text-slate-100">{formatHours(totalFactHours)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Незапланировано</p>
              <p className={`tabular-nums ${totalOverHours > 0 ? 'text-red-400' : 'text-slate-100'}`}>
                {formatHours(totalOverHours)}
              </p>
            </div>
          </div>
          {isProrated && (
            <p className="mt-2 text-xs text-slate-500">
              План рассчитан из месячной цели пропорционально числу дней в выбранном периоде.
            </p>
          )}
        </div>
      )}

      <div className="mb-3 flex gap-1 rounded-lg bg-slate-800 p-1 text-sm lg:max-w-xs">
        {(
          [
            ['project', 'По проектам'],
            ['section', 'По разделам'],
          ] as [GroupBy, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setGroupBy(value)}
            className={`flex-1 rounded-md py-1.5 ${
              groupBy === value ? 'bg-sky-600 text-slate-900' : 'text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
        {rows.map((row) => {
          const isOverrun = row.overHours > 0
          const ratio = row.planHours > 0 ? Math.min(1, row.factHours / row.planHours) : row.factHours > 0 ? 1 : 0
          return (
            <div key={row.id} className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="text-slate-100">{row.name}</span>
                <span className={`tabular-nums ${isOverrun ? 'text-red-400' : 'text-slate-400'}`}>
                  {formatHours(row.factHours)} / {formatHours(row.planHours)} ч
                  {isOverrun && ` (+${formatHours(row.overHours)})`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
                <div
                  className={`h-full rounded-full ${isOverrun ? 'bg-red-500' : 'bg-sky-600'}`}
                  style={{ width: `${Math.max(ratio, isOverrun ? 1 : 0) * 100}%`, opacity: ratio >= 1 ? 1 : 0.6 }}
                />
              </div>
            </div>
          )
        })}
        {rows.length === 0 && <p className="text-slate-500">За этот период нет плана или трекинга.</p>}
      </div>
    </div>
  )
}
