import { useMemo, useState } from 'react'
import { DatePicker } from '../components/DatePicker'
import { Ring } from '../components/Ring'
import { Chip, EmptyState, FieldLabel, Overline, Segmented } from '../components/ui'
import {
  daysBetweenInclusive,
  daysInCalendarMonth,
  overlapsPeriod,
  PERIOD_PRESETS,
  rangeForPreset,
  toDateString,
  todayStr,
  type PeriodPreset,
} from '../lib/period'
import { useClosedTaskCount, useTimeEntriesInRange } from '../lib/queries/dashboard'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
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
  const { data: userSettings } = useUserSettings()
  const { data: entries = [] } = useTimeEntriesInRange(from, to)
  const { data: closedCount = 0 } = useClosedTaskCount(`${from}T00:00:00`, `${to}T23:59:59.999`)

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

  /* «13,3 ч» само по себе не отвечает на вопрос «это много или мало» —
     сравниваем с предыдущим отрезком той же длины */
  const prevRange = useMemo(() => {
    const days = daysBetweenInclusive(from, to)
    const end = new Date(`${from}T00:00:00`)
    end.setDate(end.getDate() - 1)
    const start = new Date(end)
    start.setDate(start.getDate() - (days - 1))
    return { from: toDateString(start), to: toDateString(end) }
  }, [from, to])

  const { data: prevEntries = [] } = useTimeEntriesInRange(prevRange.from, prevRange.to)
  const prevFactHours = useMemo(
    () => prevEntries.reduce((sum, e) => sum + e.duration_minutes, 0) / 60,
    [prevEntries],
  )
  const deltaHours = totalFactHours - prevFactHours

  return (
    <div className="mx-auto flex max-w-lg flex-col lg:mx-0 lg:max-w-3xl">
      <div className="safe-top flex flex-col gap-3 px-5 pt-3.5 pb-3">
        <div className="flex flex-col gap-0.5">
          <Overline className="tracking-[.14em]">
            {shortDate(from)} — {shortDate(to)}
          </Overline>
          <h1 className="text-2xl font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">Сводка</h1>
        </div>
        {/* прокрутка, а не перенос: на узком экране «Свой диапазон» уезжал на вторую
            строку и ряд выглядел сломанным */}
        <div className="sc -mx-5 flex gap-2 overflow-x-auto px-5">
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
            <DatePicker
              small
              className="flex-1"
              ariaLabel="Начало периода"
              value={customFrom}
              onChange={(v) => setCustomFrom(v ?? todayStr())}
            />
            <span className="font-mono text-xs text-slate-600">—</span>
            <DatePicker
              small
              className="flex-1"
              ariaLabel="Конец периода"
              value={customTo}
              onChange={(v) => setCustomTo(v ?? todayStr())}
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
            <span className="tabular font-mono text-xl font-semibold text-slate-50">{sumPct}%</span>
            <span className="font-mono text-2xs uppercase tracking-[.12em] text-slate-500">плана</span>
          </span>
        </Ring>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex flex-col gap-px">
            <FieldLabel>Часов затрачено</FieldLabel>
            <span className="tabular font-mono text-xl font-semibold leading-[1.1] text-slate-50">
              {formatHoursRu(totalFactHours)}{' '}
              <span className="text-sm text-[#83838c]">/ {formatHoursRu(totalPlanHours)} ч</span>
            </span>
            {prevFactHours > 0 && (
              <span className="tabular font-mono text-2xs text-slate-500">
                {deltaHours >= 0 ? '+' : '−'}
                {formatHoursRu(Math.abs(deltaHours))} ч к прошлому периоду
              </span>
            )}
          </div>
          {/* пока история переходов не накопилась, метрика структурно нулевая —
              не занимаем ею место и не оправдываемся сноской на четыре строки */}
          {closedCount > 0 && (
            <div className="flex flex-col gap-px">
              <FieldLabel>Задач закрыто</FieldLabel>
              <span className="tabular font-mono text-xl font-semibold leading-[1.1] text-slate-50">
                {closedCount}
              </span>
            </div>
          )}
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
                <span className="tabular font-mono text-base font-semibold text-slate-100">
                  {formatHoursRu(budgetForPeriod)}
                </span>
              </div>
              <div className="flex flex-col gap-px">
                <FieldLabel>Факт</FieldLabel>
                <span className="tabular font-mono text-base font-semibold text-slate-100">
                  {formatHoursRu(totalFactHours)}
                </span>
              </div>
              <div className="flex flex-col gap-px">
                <FieldLabel>Сверх</FieldLabel>
                <span
                  className={`tabular font-mono text-base font-semibold ${
                    totalOverHours > 0 ? 'text-red-400' : 'text-slate-100'
                  }`}
                >
                  {formatHoursRu(totalOverHours)}
                </span>
              </div>
            </div>
            {isProrated && (
              <p className="font-mono text-2xs leading-[1.5] text-slate-600">
                План рассчитан из месячной цели пропорционально числу дней в периоде.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex px-5 pt-3.5 pb-2.5">
        <Segmented
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: 'project', label: 'По проектам' },
            { value: 'section', label: 'По разделам' },
          ]}
        />
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
                  className={`tabular font-mono text-2xs font-medium ${
                    over ? 'text-red-400' : pct >= 50 ? 'text-sky-600' : 'text-slate-400'
                  }`}
                >
                  {pct}%
                </span>
              </Ring>
              <div className="min-w-0 flex-1">
                <p
                  title={row.name}
                  className="truncate text-sm font-medium leading-[1.3] text-slate-100"
                >
                  {row.name}
                </p>
                {/* счётчик задач больше не вытесняется словом «переработка»: о ней
                    уже говорят терракотовое кольцо и процент больше ста */}
                <span className="block truncate font-mono text-2xs leading-[1.4] text-slate-500">
                  {formatHoursRu(row.factHours)} / {formatHoursRu(row.planHours)} ч · {row.counted} задач
                </span>
              </div>
            </div>
          )
        })}
        {rows.length === 0 && <EmptyState>За этот период нет плана или трекинга.</EmptyState>}
      </div>
    </div>
  )
}
