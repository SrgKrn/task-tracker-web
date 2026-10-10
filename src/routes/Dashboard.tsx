import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DatePicker } from '../components/DatePicker'
import { Ring } from '../components/Ring'
import { Chip, EmptyState, FieldLabel, Overline, Segmented, Skeleton } from '../components/ui'
import {
  addDays,
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
import { useGroupModel } from '../lib/groups'
import { useTasks } from '../lib/queries/tasks'
import { useUserSettings } from '../lib/queries/userSettings'
import { TASKS, entryMinutes, formatHoursRu, plural } from '../lib/time'
import { headIdOf } from '../lib/tree'

type PresetKey = PeriodPreset['key'] | 'custom'

const GROUP_KEY = 'semternity.dashboardGroup'
const WORKDAYS: [string, string, string] = ['рабочий день', 'рабочих дня', 'рабочих дней']

function loadGroupChoice(): string | null {
  try {
    return localStorage.getItem(GROUP_KEY)
  } catch {
    return null
  }
}

function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`
}

/** рабочие дни (пн–пт) в [from, to] включительно; пустой отрезок — 0 */
function workingDays(from: string, to: string): number {
  if (from > to) return 0
  let n = 0
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const dow = new Date(`${d}T00:00:00`).getDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

export function Dashboard() {
  const [preset, setPreset] = useState<PresetKey>('this_month')
  const [customFrom, setCustomFrom] = useState(todayStr())
  const [customTo, setCustomTo] = useState(todayStr())
  const [groupChoice, setGroupChoice] = useState<string | null>(loadGroupChoice)

  const { from, to } = preset === 'custom' ? { from: customFrom, to: customTo } : rangeForPreset(preset)

  const { data: tasks = [], isLoading: tasksLoading } = useTasks()
  const model = useGroupModel()
  // разрез: выбранный раньше, иначе группа «в строке задачи» (обычно проекты), иначе первая
  const groupBy =
    (groupChoice && model.groupById.has(groupChoice) ? groupChoice : null) ??
    model.groups.find((g) => g.show_in_list)?.id ??
    model.groups[0]?.id ??
    null
  function chooseGroup(id: string) {
    setGroupChoice(id)
    try {
      localStorage.setItem(GROUP_KEY, id)
    } catch {
      // не запомнили — в следующий раз откроется разрез по умолчанию
    }
  }
  const { data: userSettings } = useUserSettings()
  const { data: entries = [], isLoading: entriesLoading } = useTimeEntriesInRange(from, to)
  // пока данные грузятся, нули — неправда: «0 % плана, нет трекинга» висело 2–3 с
  const loading = tasksLoading || entriesLoading
  const { data: closedCount = 0 } = useClosedTaskCount(`${from}T00:00:00`, `${to}T23:59:59.999`)

  /*
   * Всё считается по головным задачам. План подзадач — раскладка плана спринта, и сложи мы
   * их вместе, план удвоился бы. Минуты подзадачи засчитываются её спринту: переработка
   * — это факт спринта сверх его плана, а не часы отдельной строки сверх её раскладки.
   */
  const heads = useMemo(() => tasks.filter((t) => !t.parent_id), [tasks])

  const factByTask = useMemo(() => {
    const headOf = new Map(tasks.map((t) => [t.id, headIdOf(t)]))
    const map = new Map<string, number>()
    for (const e of entries) {
      const head = headOf.get(e.task_id) ?? e.task_id
      map.set(head, (map.get(head) ?? 0) + entryMinutes(e))
    }
    return map
  }, [entries, tasks])

  const totalFactHours = useMemo(
    () => entries.reduce((sum, e) => sum + entryMinutes(e), 0) / 60,
    [entries],
  )

  const totalPlanHours = useMemo(
    () => heads.filter((t) => overlapsPeriod(t, from, to)).reduce((sum, t) => sum + t.planned_hours, 0),
    [heads, from, to],
  )

  const totalOverHours = useMemo(() => {
    let sum = 0
    for (const t of heads) {
      const minutes = factByTask.get(t.id)
      if (!minutes) continue
      const factH = minutes / 60
      if (t.planned_hours > 0 && factH > t.planned_hours) sum += factH - t.planned_hours
    }
    return sum
  }, [heads, factByTask])

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
    if (!groupBy) return []
    const buckets = [...model.itemsOf(groupBy).map((i) => ({ id: i.id, name: i.name })), { id: '', name: 'Не указано' }]
    return buckets
      .map((bucket) => {
        const bucketTasks = heads.filter((t) => (model.valueOf(t, groupBy)?.id ?? '') === bucket.id)
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
  }, [groupBy, model, heads, factByTask, from, to])

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
    () => prevEntries.reduce((sum, e) => sum + entryMinutes(e), 0) / 60,
    [prevEntries],
  )
  const deltaHours = totalFactHours - prevFactHours

  /** факт по дням периода — ряд столбиков: видно, где был провал, а где переработка */
  const today = todayStr()
  const days = useMemo(() => {
    const list: string[] = []
    for (let d = from; d <= to && list.length < 62; d = addDays(d, 1)) list.push(d)
    return list
  }, [from, to])
  const factByDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of entries) map.set(e.effective_date, (map.get(e.effective_date) ?? 0) + entryMinutes(e) / 60)
    return map
  }, [entries])
  const maxDay = Math.max(1, ...days.map((d) => factByDay.get(d) ?? 0))

  /*
   * Темп: куда период выйдет, если работать дальше так же. Считаем по рабочим дням:
   * выходные не тянут средний темп вниз и не обещают часов, которых не будет.
   * Только для периода, который идёт сейчас, — у прошедшего прогнозировать нечего.
   */
  const pacePlan = totalPlanHours > 0 ? totalPlanHours : (budgetForPeriod ?? 0)
  const pace = useMemo(() => {
    if (today < from || today > to || pacePlan <= 0) return null
    const passed = workingDays(from, today)
    const left = workingDays(addDays(today, 1), to)
    if (passed === 0) return null
    const perDay = totalFactHours / passed
    const forecast = totalFactHours + perDay * left
    const remaining = Math.max(0, pacePlan - totalFactHours)
    return {
      perDay,
      forecastPct: Math.round((forecast / pacePlan) * 100),
      remaining,
      left,
      needPerDay: left > 0 ? remaining / left : null,
    }
  }, [today, from, to, pacePlan, totalFactHours])

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

      {loading && (
        <div className="flex flex-col gap-3 px-5 pb-4" aria-busy="true" aria-label="Сводка загружается">
          <div className="flex items-center gap-[18px]">
            <Skeleton className="h-[104px] w-[104px]" rounded="9999px" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-24" rounded="6px" />
              <Skeleton className="h-6 w-32" rounded="8px" />
              <Skeleton className="h-3 w-40" rounded="6px" />
            </div>
          </div>
          <Skeleton className="h-14 w-full" rounded="12px" />
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[62px] w-full" />
          ))}
        </div>
      )}

      {!loading && (
        <>
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
                  <span className="text-sm text-[var(--s-placeholder)]">/ {formatHoursRu(totalPlanHours)} ч</span>
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

          {/* по дням периода: выходные бледнее, сегодня — акцентом, будущее пустое */}
          {days.length > 1 && (
            <div className="px-5 pt-3.5">
              <div className="flex h-14 items-end gap-[2px]" aria-label="Часы по дням периода">
                {days.map((d) => {
                  const fact = factByDay.get(d) ?? 0
                  const dow = new Date(`${d}T00:00:00`).getDay()
                  const weekend = dow === 0 || dow === 6
                  return (
                    <span
                      key={d}
                      title={`${shortDate(d)}: ${formatHoursRu(fact)} ч`}
                      className="min-w-0 flex-1 rounded-[2px]"
                      style={{
                        height: fact > 0 ? `${Math.max(8, (fact / maxDay) * 100)}%` : '3px',
                        background:
                          d === today
                            ? 'var(--s-accent)'
                            : fact > 0
                              ? weekend
                                ? 'var(--s-accent-muted)'
                                : 'var(--s-bar-past)'
                              : d > today
                                ? 'var(--s-bar-future)'
                                : 'var(--s-bar-empty)',
                      }}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between pt-1 font-mono text-2xs text-slate-600">
                <span>{shortDate(days[0])}</span>
                <span>{shortDate(days[days.length - 1])}</span>
              </div>
            </div>
          )}

          {/* темп: прогноз выхода периода, остаток часов и рабочих дней */}
          {pace && (
            <div className="px-5 pt-3">
              <div
                className="flex flex-col gap-1.5 rounded-2xl p-3.5"
                style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
              >
                <Overline>Темп</Overline>
                <p className="text-sm leading-[1.45] text-slate-100">
                  {formatHoursRu(pace.perDay)} ч в рабочий день — к {shortDate(to)} выйдет{' '}
                  <span className={`tabular font-mono font-semibold ${pace.forecastPct > 100 ? 'text-terra-400' : 'text-brass-600'}`}>
                    ≈{pace.forecastPct}%
                  </span>{' '}
                  плана
                </p>
                <p className="font-mono text-2xs leading-[1.5] text-slate-500">
                  {pace.remaining > 0
                    ? `осталось ${formatHoursRu(pace.remaining)} ч и ${plural(pace.left, WORKDAYS)}${
                        pace.needPerDay !== null ? ` — по ${formatHoursRu(pace.needPerDay)} ч в день` : ''
                      }`
                    : `план выполнен, рабочих дней впереди: ${pace.left}`}
                </p>
              </div>
            </div>
          )}

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
                        totalOverHours > 0 ? 'text-terra-400' : 'text-slate-100'
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

          {groupBy && model.groups.length > 1 && (
            <div className="sc flex overflow-x-auto px-5 pt-3.5 pb-2.5">
              <Segmented
                value={groupBy}
                onChange={chooseGroup}
                options={model.groups.map((g) => ({ value: g.id, label: g.name }))}
              />
            </div>
          )}
          {groupBy && model.groups.length === 1 && (
            <div className="px-5 pt-3.5 pb-2.5">
              <Overline>{model.groupById.get(groupBy)?.name}</Overline>
            </div>
          )}

          <div className="flex flex-col gap-[9px] px-5 pb-2 lg:grid lg:grid-cols-2 lg:gap-3">
            {rows.map((row) => {
              // процента от нулевого плана не существует: раньше проект без плана
              // показывал ровно «100%», что просто неправда
              const hasPlan = row.planHours > 0
              const pct = hasPlan ? Math.round((row.factHours / row.planHours) * 100) : 0
              const over = pct > 100
              // строка ведёт в карточку значения: задачи, файлы, хронология
              return (
                <Link
                  key={row.id || 'none'}
                  to={row.id ? `/items/${row.id}` : '/tasks'}
                  className="flex items-center gap-3.5 rounded-2xl px-3.5 py-3"
                  style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
                >
                  <Ring
                    size={38}
                    pct={pct}
                    color={over ? 'var(--s-danger)' : pct >= 50 ? 'var(--s-accent)' : 'var(--s-accent-muted)'}
                  >
                    <span
                      className={`tabular font-mono text-2xs font-medium ${
                        over ? 'text-terra-400' : pct >= 50 ? 'text-brass-600' : 'text-slate-400'
                      }`}
                    >
                      {hasPlan ? `${pct}%` : '—'}
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
                      {hasPlan
                        ? `${formatHoursRu(row.factHours)} / ${formatHoursRu(row.planHours)} ч`
                        : `${formatHoursRu(row.factHours)} ч · без плана`}{' · '}
                      {plural(row.counted, TASKS)}
                    </span>
                  </div>
                </Link>
              )
            })}
            {rows.length === 0 && <EmptyState>За этот период нет плана или трекинга.</EmptyState>}
          </div>
        </>
      )}
    </div>
  )
}
