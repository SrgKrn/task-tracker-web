import { ProfileButton } from '../components/Avatar'
import { WorkspaceTag } from '../components/Workspaces'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { DatePicker } from '../components/DatePicker'
import { Ring } from '../components/Ring'
import { ClientDot, EmptyState, FieldLabel, ListGroup, Overline, Segmented, Skeleton } from '../components/ui'
import { Download } from '../components/Icon'
import {
  addDays,
  daysBetweenInclusive,
  daysInCalendarMonth,
  formatDayMonth,
  formatShortDate,
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
import { useActiveWorkspace } from '../lib/workspace'
import { dayNormFor, normSettingsOf, periodNorm, workdaysBetween } from '../lib/norm'
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

/** «1 окт» — границы периода и подписи столбиков */
function shortDate(iso: string): string {
  return formatDayMonth(iso)
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
  const workspace = useActiveWorkspace()
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

  // норма — по рабочим дням из «Ещё → План часов», а не по всем дням периода
  const norm = normSettingsOf(workspace)
  const workDays = norm.workDays
  const workdaysInPeriod = workdaysBetween(from, to, workDays)
  const budgetForPeriod = periodNorm(from, to, norm)
  const dailyTarget = dayNormFor(from, norm)

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
    // целый календарный месяц сравниваем с прошлым календарным месяцем: 1–15 октября — с 1–15
    // сентября, а не с 31 августа – 14 сентября
    if (from.endsWith('-01') && daysBetweenInclusive(from, to) === daysInCalendarMonth(from)) {
      const prevFrom = toDateString(new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 2, 1))
      return { from: prevFrom, to: addDays(from, -1) }
    }
    const days = daysBetweenInclusive(from, to)
    const end = new Date(`${from}T00:00:00`)
    end.setDate(end.getDate() - 1)
    const start = new Date(end)
    start.setDate(start.getDate() - (days - 1))
    return { from: toDateString(start), to: toDateString(end) }
  }, [from, to])

  /*
   * Идущий период сравниваем с тем же числом дней прошлого: середина месяца против целого
   * прошлого месяца всегда давала минус — «−101,9 ч к прошлому периоду» 14 октября.
   */
  const todayIso = todayStr()
  const elapsed = todayIso >= from && todayIso < to ? daysBetweenInclusive(from, todayIso) : null
  const prevTo =
    elapsed !== null
      ? [addDays(prevRange.from, elapsed - 1), prevRange.to].sort()[0] // в коротком прошлом месяце — не дальше его конца
      : prevRange.to
  const { data: prevEntries = [] } = useTimeEntriesInRange(prevRange.from, prevTo)
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
  const maxDay = Math.max(1, dailyTarget ?? 0, ...days.map((d) => factByDay.get(d) ?? 0))
  const [pickedDay, setPickedDay] = useState<string | null>(null)

  /*
   * Темп: куда период выйдет, если работать дальше так же. Считаем по рабочим дням:
   * выходные не тянут средний темп вниз и не обещают часов, которых не будет.
   * Только для периода, который идёт сейчас, — у прошедшего прогнозировать нечего.
   */
  const pacePlan = totalPlanHours > 0 ? totalPlanHours : (budgetForPeriod ?? 0)
  // расчёт копеечный — без useMemo, иначе React Compiler пропускает весь компонент
  const pace = (() => {
    if (today < from || today > to || pacePlan <= 0) return null
    const passed = workdaysBetween(from, today, workDays)
    const left = workdaysBetween(addDays(today, 1), to, workDays)
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
  })()

  return (
    <div className="page page-wide mx-auto flex max-w-lg flex-col">
      {/* отступ под «чёлку» — на обёртке: safe-top перебивает собственный отступ блока */}
      <div className="safe-top">
      <div className="flex flex-col gap-3 px-5 pt-3.5 pb-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:pb-5">
        <div className="flex items-end justify-between gap-3 lg:order-1">
          <div className="flex flex-col gap-0.5">
            <WorkspaceTag className="mb-1 self-start" />
            <Overline>
              {shortDate(from)} — {shortDate(to)}
            </Overline>
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">Сводка</h1>
          </div>
          {/* отчёт — там, где смотрят цифры, а не в «Ещё» */}
          <Link
            to="/settings/export"
            className="-mr-2 inline-flex h-[var(--tap)] items-center gap-1.5 rounded-sm px-3 font-medium text-text-secondary hover:bg-surface-sunken hover:text-text"
          >
            <Download size={16} />
            Отчёт
          </Link>
          <ProfileButton className="ml-1" />
        </div>
        {/* период — выбор одного из трёх, поэтому сегменты, а не чипы фильтра. Подписи
            короткие: на 375 px три сегмента делят ширину поровну и не уезжают за край */}
        <Segmented<PresetKey>
          stretch
          className="lg:order-2 lg:w-96"
          value={preset}
          onChange={setPreset}
          options={[
            ...PERIOD_PRESETS.map((p) => ({ value: p.key, label: p.key === 'last_month' ? 'Прошлый' : p.label })),
            { value: 'custom', label: 'Свой период' },
          ]}
        />
        {preset === 'custom' && (
          <div className="flex items-center gap-2 lg:order-3 lg:basis-full lg:justify-end">
            <DatePicker
              small
              className="flex-1"
              ariaLabel="Начало периода"
              value={customFrom}
              onChange={(v) => setCustomFrom(v ?? todayStr())}
            />
            <span className="text-sm text-text-secondary">—</span>
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
        // десктоп: слева кольцо, дни и разрезы, справа темп и норма (dash-grid в index.css)
        <div className="dash-grid">
          {/* кольцо периода */}
          <div className="flex items-center gap-[18px] border-b border-divider px-5 pb-[18px]">
            <Ring
              size={104}
              pct={sumPct}
              state={sumPct > 100 ? 'over' : 'idle'}
              centerBg="var(--bg)"
            >
              <span className="flex flex-col items-center gap-px">
                <span className="tabular font-mono text-xl font-medium text-text">{sumPct}%</span>
                <span className="text-xs text-text-secondary">плана</span>
              </span>
            </Ring>

            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="flex flex-col gap-px">
                <FieldLabel>Факт / план по задачам</FieldLabel>
                <span className="tabular font-mono text-xl font-medium text-text">
                  {formatHoursRu(totalFactHours)}{' '}
                  <span className="text-base text-text-secondary">/ {formatHoursRu(totalPlanHours)} ч</span>
                </span>
                {prevFactHours > 0 && (
                  <span className="text-sm text-text-secondary">
                    <span className="tabular font-mono">
                      {deltaHours >= 0 ? '+' : '−'}
                      {formatHoursRu(Math.abs(deltaHours))} ч
                    </span>{' '}
                    {elapsed !== null ? `к ${shortDate(prevTo)}` : 'к прошлому периоду'}
                  </span>
                )}
              </div>
              {/* пока история переходов не накопилась, метрика структурно нулевая —
                  не занимаем ею место и не оправдываемся сноской на четыре строки */}
              {closedCount > 0 && (
                <div className="flex flex-col gap-px">
                  <FieldLabel>Задач закрыто</FieldLabel>
                  <span className="tabular font-mono text-xl font-medium text-text">{closedCount}</span>
                </div>
              )}
            </div>
          </div>

          {/* по дням периода: выходные бледнее, сегодня — акцентом, будущее пустое */}
          {days.length > 1 && (
            <div className="px-5 pt-3.5">
              <div className="relative flex h-14 items-end gap-[2px] lg:h-28" aria-label="Часы по дням периода">
                {/* пунктир нормы дня: видно, где был провал, а где переработка */}
                {dailyTarget && (
                  <span
                    className="pointer-events-none absolute inset-x-0 border-t border-dashed border-border-strong"
                    style={{ bottom: `${(dailyTarget / maxDay) * 100}%` }}
                    aria-hidden
                  />
                )}
                {days.map((d) => {
                  const fact = factByDay.get(d) ?? 0
                  const picked = d === pickedDay
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setPickedDay(picked ? null : d)}
                      aria-label={`${shortDate(d)}: ${formatHoursRu(fact)} ч`}
                      aria-pressed={picked}
                      className="flex h-full min-w-0 flex-1 items-end"
                    >
                      <span
                        className="w-full rounded-t-xs"
                        style={{
                          height: fact > 0 ? `${Math.max(8, (fact / maxDay) * 100)}%` : '3px',
                          background: picked
                            ? 'var(--text)'
                            : d === today
                              ? 'var(--accent)'
                              : fact > 0
                                ? 'var(--bar-past)'
                                : d > today
                                  ? 'var(--bar-future)'
                                  : 'var(--bar-empty)',
                        }}
                      />
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-between pt-1 text-xs text-text-secondary">
                <span>{shortDate(days[0])}</span>
                {pickedDay ? (
                  <span className="text-text">
                    {formatShortDate(pickedDay)} · <span className="tabular font-mono">{formatHoursRu(factByDay.get(pickedDay) ?? 0)} ч</span>
                  </span>
                ) : (
                  <span>Нажмите на день</span>
                )}
                <span>{shortDate(days[days.length - 1])}</span>
              </div>
            </div>
          )}

          <div className="dash-aside">
          {/* темп: прогноз выхода периода, остаток часов и рабочих дней */}
          {pace && (
            <div className="px-5 pt-3">
              <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3.5">
                <Overline>Темп</Overline>
                <p className="text-base leading-[1.45] text-text">
                  {formatHoursRu(pace.perDay)} ч в рабочий день — к {shortDate(to)} выйдет{' '}
                  <span className={`tabular font-mono font-medium ${pace.forecastPct > 100 ? 'text-danger-text' : 'text-text'}`}>
                    ≈{pace.forecastPct}%
                  </span>{' '}
                  плана
                </p>
                <p className="text-sm leading-[1.5] text-text-secondary first-letter:uppercase">
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
              <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3.5">
                <div className="flex flex-col">
                  <Overline>Норма периода</Overline>
                  <span className="text-sm text-text-secondary">
                    {norm.perMonth
                      ? `${formatHoursRu(norm.perMonth)} ч в месяц · в периоде ${plural(workdaysInPeriod, WORKDAYS)}`
                      : `${formatHoursRu(norm.perDay ?? 0)} ч в день × ${plural(workdaysInPeriod, WORKDAYS)}`}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="flex flex-col gap-px">
                    <FieldLabel>Норма</FieldLabel>
                    <span className="tabular font-mono text-md font-medium text-text">
                      {formatHoursRu(budgetForPeriod)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-px">
                    <FieldLabel>Факт</FieldLabel>
                    <span className="tabular font-mono text-md font-medium text-text">
                      {formatHoursRu(totalFactHours)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-px">
                    <FieldLabel>Сверх плана</FieldLabel>
                    <span
                      className={`tabular font-mono text-md font-medium ${
                        totalOverHours > 0 ? 'text-danger-text' : 'text-text'
                      }`}
                    >
                      {formatHoursRu(totalOverHours)}
                    </span>
                  </div>
                </div>

              </div>
            </div>
          )}

          </div>

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

          <div className="px-5 pb-2">
          {rows.length > 0 && (
          <ListGroup>
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
                  className="flex min-h-[var(--row-task)] items-center gap-3 px-3 py-2.5 active:bg-surface-sunken"
                >
                  {/* кольцо без текста: «126%» в кольце 38 px было кеглем около 9 px */}
                  <Ring size={32} pct={pct} state={over ? 'over' : 'idle'} />
                  <div className="min-w-0 flex-1">
                    <p title={row.name} className="flex min-w-0 items-center gap-1.5 text-base font-medium text-text">
                      <ClientDot color={row.id ? model.itemById.get(row.id)?.color : null} />
                      <span className="truncate">{row.name}</span>
                    </p>
                    <span className="flex min-w-0 items-center gap-1.5 text-sm text-text-secondary">
                      <span className="tabular shrink-0 font-mono text-xs">
                        {hasPlan
                          ? `${formatHoursRu(row.factHours)} / ${formatHoursRu(row.planHours)} ч`
                          : `${formatHoursRu(row.factHours)} ч · без плана`}
                      </span>
                      <span aria-hidden>·</span>
                      <span className="truncate">{plural(row.counted, TASKS)}</span>
                    </span>
                  </div>
                  <span className={`tabular shrink-0 font-mono text-base ${over ? 'text-danger-text' : 'text-text-secondary'}`}>
                    {hasPlan ? `${pct}%` : '—'}
                  </span>
                </Link>
              )
            })}
          </ListGroup>
          )}
            {rows.length === 0 && <EmptyState title="Пока пусто">За этот период нет ни плана, ни учёта.</EmptyState>}
          </div>
        </div>
      )}
    </div>
  )
}
