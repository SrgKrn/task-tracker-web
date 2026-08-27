import { useMemo, useState } from 'react'
import { Ring } from '../components/Ring'
import { Chip, FieldLabel, Overline } from '../components/ui'
import {
  daysBetweenInclusive,
  daysInCalendarMonth,
  overlapsPeriod,
  PERIOD_PRESETS,
  rangeForPreset,
  todayStr,
  type PeriodPreset,
} from '../lib/period'
import { useTimeEntriesInRange } from '../lib/queries/dashboard'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useUserSettings } from '../lib/queries/userSettings'
import { formatHoursRu } from '../lib/time'

type GroupBy = 'project' | 'section'
type PresetKey = PeriodPreset['key'] | 'custom'

function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
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

  const totalPlanHours = useMemo(
    () => tasks.filter((t) => overlapsPeriod(t, from, to)).reduce((sum, t) => sum + t.planned_hours, 0),
    [tasks, from, to],
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
  const budgetForPeriod = dailyTarget
    ? dailyTarget * daysInPeriod
    : monthlyTarget
      ? monthlyTarget * (daysInPeriod / daysInCalendarMonth(from))
      : null

  const sumPct = totalPlanHours > 0 ? Math.round((totalFactHours / totalPlanHours) * 100) : 0

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
        let counted = 0
        for (const t of bucketTasks) {
          const minutes = factByTask.get(t.id)
          if (!minutes) continue
          counted += 1
          const factH = minutes / 60
          factHours += factH
          if (t.planned_hours > 0 && factH > t.planned_hours) overHours += factH - t.planned_hours
        }
        return { id: bucket.id, name: bucket.name, planHours, factHours, overHours, counted }
      })
      .filter((r) => r.planHours > 0 || r.factHours > 0)
      .sort((a, b) => b.factHours - a.factHours)
  }, [groupBy, projects, sections, tasks, factByTask, from, to])

  return (
    <div className="mx-auto flex max-w-lg flex-col lg:mx-0 lg:max-w-3xl">
      <div className="safe-top flex flex-col gap-3 px-5 pt-3.5 pb-3">
        <div className="flex flex-col gap-0.5">
          <Overline className="tracking-[.14em]">
            {shortDate(from)} — {shortDate(to)}
          </Overline>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">Сводка</h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PERIOD_PRESETS.map((p) => (
            <Chip key={p.key} active={preset === p.key} onClick={() => setPreset(p.key)}>
              {p.label}
            </Chip>
          ))}
          <Chip active={preset === 'custom'} onClick={() => setPreset('custom')}>
            Свой диапазон
          </Chip>
        </div>
        {preset === 'custom' && (
          <div className="flex items-center gap-2 lg:max-w-xs">
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="h-[34px] min-w-0 flex-1 rounded-[10px] px-2.5 font-mono text-[12.5px] text-slate-300 outline-none"
              style={{ background: '#0f0f13', border: '1px solid var(--s-border-strong)' }}
            />
            <span className="font-mono text-xs text-slate-600">—</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="h-[34px] min-w-0 flex-1 rounded-[10px] px-2.5 font-mono text-[12.5px] text-slate-300 outline-none"
              style={{ background: '#0f0f13', border: '1px solid var(--s-border-strong)' }}
            />
          </div>
        )}
      </div>

      {/* кольцо периода */}
      <div
        className="flex items-center gap-[18px] px-5 pb-[18px]"
        style={{ borderBottom: '1px solid var(--s-hairline-2)' }}
      >
        <Ring
          size={104}
          pct={sumPct}
          state={sumPct > 100 ? 'over' : 'running'}
          centerBg="var(--s-bg)"
          marker
        >
          <span className="flex flex-col items-center gap-px">
            <span className="tabular font-mono text-[23px] font-semibold text-slate-50">{sumPct}%</span>
            <span className="font-mono text-[9.5px] uppercase tracking-[.12em] text-slate-500">плана</span>
          </span>
        </Ring>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-col gap-px">
            <FieldLabel>Часов затрачено</FieldLabel>
            <span className="tabular font-mono text-[21px] font-semibold leading-[1.1] text-slate-50">
              {formatHoursRu(totalFactHours)}{' '}
              <span className="text-[13px] text-[#6e6e77]">/ {formatHoursRu(totalPlanHours)} ч</span>
            </span>
          </div>
          <div className="flex flex-col gap-px">
            <FieldLabel>Задач закрыто</FieldLabel>
            <span className="tabular font-mono text-[21px] font-semibold leading-[1.1] text-slate-50">
              {closedCount}
            </span>
          </div>
        </div>
      </div>

      {/* личная цель по загрузке */}
      {budgetForPeriod !== null && (
        <div className="px-5 pt-3.5">
          <div
            className="flex flex-col gap-2 rounded-2xl p-3.5"
            style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
          >
            <Overline>Общий план</Overline>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="flex flex-col gap-px">
                <FieldLabel>План</FieldLabel>
                <span className="tabular font-mono text-[15px] font-semibold text-slate-100">
                  {formatHoursRu(budgetForPeriod)}
                </span>
              </div>
              <div className="flex flex-col gap-px">
                <FieldLabel>Факт</FieldLabel>
                <span className="tabular font-mono text-[15px] font-semibold text-slate-100">
                  {formatHoursRu(totalFactHours)}
                </span>
              </div>
              <div className="flex flex-col gap-px">
                <FieldLabel>Сверх</FieldLabel>
                <span
                  className={`tabular font-mono text-[15px] font-semibold ${
                    totalOverHours > 0 ? 'text-red-400' : 'text-slate-100'
                  }`}
                >
                  {formatHoursRu(totalOverHours)}
                </span>
              </div>
            </div>
            {isProrated && (
              <p className="font-mono text-[10.5px] leading-[1.5] text-slate-600">
                План рассчитан из месячной цели пропорционально числу дней в периоде.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 px-5 pt-3.5 pb-2.5">
        <Chip active={groupBy === 'project'} onClick={() => setGroupBy('project')}>
          По проектам
        </Chip>
        <Chip active={groupBy === 'section'} onClick={() => setGroupBy('section')}>
          По разделам
        </Chip>
      </div>

      <div className="flex flex-col gap-[9px] px-5 pb-2 lg:grid lg:grid-cols-2 lg:gap-3">
        {rows.map((row) => {
          const pct = row.planHours > 0 ? Math.round((row.factHours / row.planHours) * 100) : row.factHours > 0 ? 100 : 0
          const over = pct > 100
          return (
            <div
              key={row.id}
              className="flex items-center gap-3.5 rounded-2xl px-3.5 py-3"
              style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
            >
              <Ring
                size={38}
                pct={pct}
                color={over ? 'var(--s-danger)' : pct >= 50 ? 'var(--s-accent)' : 'rgba(232,163,61,.55)'}
              >
                <span
                  className={`tabular font-mono text-[9.5px] font-medium ${
                    over ? 'text-red-400' : pct >= 50 ? 'text-sky-600' : 'text-slate-400'
                  }`}
                >
                  {pct}%
                </span>
              </Ring>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-medium leading-[1.3] text-slate-100">{row.name}</p>
                <span className="font-mono text-[11px] leading-[1.4] text-slate-500">
                  {formatHoursRu(row.factHours)} / {formatHoursRu(row.planHours)} ч ·{' '}
                  {over ? 'переработка' : `${row.counted} задач`}
                </span>
              </div>
            </div>
          )
        })}
        {rows.length === 0 && (
          <p className="my-6 text-center text-[13px] text-slate-600">За этот период нет плана или трекинга.</p>
        )}
      </div>

      <p className="px-5 pb-2 font-mono text-[10.5px] leading-[1.5] text-slate-600" style={{ textWrap: 'pretty' }}>
        «Задач закрыто» считается по дате последнего изменения задачи, а не по истории смены статусов.
      </p>
    </div>
  )
}
