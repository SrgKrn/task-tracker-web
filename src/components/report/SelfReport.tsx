import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, Search } from '../Icon'
import { Chip, EmptyState, Segmented, StageChip, fieldClass } from '../ui'
import { HBars, Heatmap, Kpi, Legend, Panel, SplitBar, TimeBars, seriesColor } from './charts'
import type { GroupModel } from '../../lib/groups'
import { formatDayMonth } from '../../lib/period'
import { formatMoney, type RateCurrency } from '../../lib/rate'
import { dayMonth, f1, fh, hm, type ReportData } from '../../lib/report'
import {
  applyFilter,
  breakdown,
  bucketize,
  searchTaskHours,
  sortTaskHours,
  taskHours,
  toggleIn,
  type Bucket,
  type BreakdownDim,
  type ReportFilter,
  type TaskHoursRow,
  type TaskSortKey,
} from '../../lib/reportViews'
import { stageTone } from '../../lib/stage'
import { plural } from '../../lib/time'
import type { Status, Task, TimeEntry } from '../../lib/types'

export type SelfTab = 'overview' | 'tasks' | 'time' | 'journal'

export const SELF_TABS: { value: SelfTab; label: string }[] = [
  { value: 'overview', label: 'Обзор' },
  { value: 'tasks', label: 'Задачи' },
  { value: 'time', label: 'Время' },
  { value: 'journal', label: 'Журнал' },
]

const DIM_KEY = 'semternity.dashboardGroup'
const WD_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье']
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const SPRINTS: [string, string, string] = ['спринт', 'спринта', 'спринтов']
const TASKS_F: [string, string, string] = ['задача', 'задачи', 'задач']

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return (new Date(y, m - 1, d).getDay() + 6) % 7
}

function loadDim(): string | null {
  try {
    return localStorage.getItem(DIM_KEY)
  } catch {
    return null
  }
}

export interface SelfReportProps {
  tab: SelfTab
  report: ReportData
  model: GroupModel
  statuses: Status[]
  /** все задачи и записи пространства (без среза) — для разрезов, где срез по этой же группе не применяется */
  tasks: Task[]
  entries: TimeEntry[]
  filter: ReportFilter
  setFilter: (f: ReportFilter) => void
  /** провалиться в отрезок графика */
  onDrill: (b: Bucket) => void
  today: string
  onTab: (t: SelfTab) => void
}

export function SelfReport(props: SelfReportProps) {
  const { tab, report } = props
  if (report.total === 0 && report.prevTotal === 0 && report.sprints.length === 0) {
    return (
      <EmptyState title="За этот период пусто">
        Нет ни записей учёта, ни задач со сроком в этих датах. Выберите другой период или сбросьте срез.
      </EmptyState>
    )
  }
  if (tab === 'tasks') return <TasksTable {...props} />
  if (tab === 'time') return <TimeView report={report} />
  if (tab === 'journal') return <JournalView report={report} />
  return <Overview {...props} />
}

/* ── обзор ───────────────────────────────────────────────────────── */

function Overview({ report: r, model, tasks, entries, filter, setFilter, onDrill, today, onTab }: SelfReportProps) {
  const filtered = filter.items.length > 0 || filter.tasks.length > 0
  const chart = useMemo(() => bucketize(r.days, r.clients, r.dayNorm !== null && !filtered), [r, filtered])
  const itemGroup = (id: string) => model.itemById.get(id)?.group_id

  // разрез: выбранный раньше, иначе группа «в строке задачи», иначе первая, иначе задачи
  const [dimChoice, setDimChoice] = useState<string | null>(loadDim)
  const dimKey =
    dimChoice === 'task' || (dimChoice && model.groupById.has(dimChoice))
      ? dimChoice
      : (model.groups.find((g) => g.show_in_list)?.id ?? model.groups[0]?.id ?? 'task')
  const dim: BreakdownDim = dimKey === 'task' ? { kind: 'task' } : { kind: 'group', groupId: dimKey }
  function chooseDim(key: string) {
    setDimChoice(key)
    try {
      localStorage.setItem(DIM_KEY, key)
    } catch {
      // не запомнили — в следующий раз откроется разрез по умолчанию
    }
  }

  /*
   * Строки разреза считаем по срезу БЕЗ выбора в этой же группе: иначе, выбрав одного
   * клиента, остальных уже не видно и не добавить к сравнению.
   */
  const rows = useMemo(() => {
    const own = dim.kind === 'task' ? filter.tasks : filter.items.filter((id) => itemGroup(id) === dim.groupId)
    const rest: ReportFilter =
      dim.kind === 'task'
        ? { items: filter.items, tasks: [] }
        : { items: filter.items.filter((id) => !own.includes(id)), tasks: filter.tasks }
    const slice = applyFilter(tasks, entries, itemGroup, rest)
    const cur = slice.entries.filter((e) => e.effective_date >= r.from && e.effective_date <= r.to)
    const prev = slice.entries.filter((e) => e.effective_date >= r.prevFrom && e.effective_date <= r.prevTo)
    return { own, list: breakdown(dim, cur, prev, slice.tasks, model) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimKey, filter, tasks, entries, r.from, r.to, r.prevFrom, r.prevTo, model])

  const delta = r.total - r.prevTotal
  const planned = r.sprints.filter((s) => s.plan > 0)
  const moneyDue = r.billing.map((b) => formatMoney(b.due, b.currency as RateCurrency)).join(' · ')
  const [allRows, setAllRows] = useState(false)
  const shownRows = allRows ? rows.list : rows.list.slice(0, 8)

  return (
    <div className="flex flex-col gap-3 lg:gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:gap-3 xl:grid-cols-6">
        <Kpi
          label="Часы"
          value={f1(r.total)}
          unit="ч"
          sub={
            r.prevTotal > 0
              ? `${delta >= 0 ? '+' : '−'}${f1(Math.abs(delta))} ч к ${r.prevDative}`
              : 'раньше записей нет'
          }
        />
        {r.target && !filtered ? (
          <Kpi
            label="Норма периода"
            value={`${Math.round((r.total / Math.max(r.target.hours, 0.001)) * 100)}`}
            unit="%"
            progress={r.total / Math.max(r.target.hours, 0.001)}
            sub={`${f1(r.total)} из ${fh(r.target.hours)} ч`}
          />
        ) : (
          <Kpi label="Дней с учётом" value={String(r.daysWithEntries)} sub={`из ${r.days.length} в периоде`} />
        )}
        <Kpi
          label="В рабочий день"
          value={r.avgPerWeekday !== null ? f1(r.avgPerWeekday) : '—'}
          unit="ч"
          sub={r.forecast ? `прогноз на месяц ≈ ${f1(r.forecast.hours)} ч` : `рабочих дней: ${r.weekdays}`}
        />
        <Kpi label="Закрыто задач" value={String(r.closedCount)} sub={`в работе: ${r.inWorkCount}`} />
        <Kpi
          label="Сверх плана"
          value={f1(r.overHours)}
          unit="ч"
          tone={r.overHours > 0.05 ? 'danger' : undefined}
          sub={r.overCount > 0 ? plural(r.overCount, SPRINTS) : 'все в плане'}
        />
        {r.billing.length > 0 ? (
          <Kpi label="К оплате" value={moneyDue} compact={r.billing.length > 1} sub={r.options.includeOvertime ? 'с переработкой' : 'в пределах плана'} />
        ) : (
          <Kpi label="Без плана" value={f1(r.unplannedHours)} unit="ч" sub="задачи без плана часов" />
        )}
      </div>

      <Panel
        title={chart.grain === 'day' ? 'Часы по дням' : chart.grain === 'week' ? 'Часы по неделям' : 'Часы по месяцам'}
        aside={
          <Legend
            series={chart.series}
            activeKeys={filter.items}
            onToggle={(key) => model.itemById.has(key) && setFilter({ ...filter, items: toggleIn(filter.items, key) })}
          />
        }
      >
        <TimeBars
          buckets={chart.buckets}
          series={chart.series}
          today={today}
          onPick={r.from === r.to ? undefined : onDrill}
          titleOf={(b) =>
            b.from === b.to
              ? `${dayMonth(b.from)}, ${WD_FULL[weekdayOf(b.from)]}`
              : `${formatDayMonth(b.from, today)} – ${formatDayMonth(b.to, today)}`
          }
        />
        {r.from !== r.to && (
          <span className="text-xs text-text-tertiary">
            Нажмите на столбик — откроется этот {chart.grain === 'day' ? 'день' : chart.grain === 'week' ? 'отрезок' : 'месяц'}.
          </span>
        )}
      </Panel>

      <div className="grid gap-3 lg:grid-cols-5 lg:gap-4">
        <Panel
          className="lg:col-span-3"
          title="Куда ушло время"
          aside={
            <div className="sc -mx-1 flex max-w-full overflow-x-auto px-1">
              <Segmented
                value={dimKey}
                onChange={chooseDim}
                options={[...model.groups.map((g) => ({ value: g.id, label: g.name })), { value: 'task', label: 'Задачи' }]}
              />
            </div>
          }
        >
          {rows.list.length === 0 ? (
            <p className="py-4 text-sm text-text-secondary">За период нет записей учёта.</p>
          ) : (
            <>
              <div className="-mx-2">
                <HBars
                  rows={shownRows.map((x) => ({
                    ...x,
                    note: dim.kind === 'group' && x.tasks > 0 ? plural(x.tasks, TASKS_F) : undefined,
                  }))}
                  selected={rows.own}
                  showPrev
                  identity={dim.kind === 'group' && rows.list.some((x) => x.color)}
                  onPick={(row) =>
                    dim.kind === 'task'
                      ? setFilter({ ...filter, tasks: toggleIn(filter.tasks, row.id) })
                      : setFilter({ ...filter, items: toggleIn(filter.items, row.id) })
                  }
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-tertiary">
                <span>Нажмите на строку — весь отчёт пересчитается по ней. Справа: часы и доля; «+/−» — к {r.prevDative}.</span>
                {rows.list.length > 8 && (
                  <button type="button" className="font-medium text-accent-text" onClick={() => setAllRows(!allRows)}>
                    {allRows ? 'Свернуть' : `Показать все ${rows.list.length}`}
                  </button>
                )}
              </div>
            </>
          )}
        </Panel>

        <div className="flex flex-col gap-3 lg:col-span-2 lg:gap-4">
          {r.insights.length > 0 && (
            <Panel title="Что видно в цифрах">
              <ul className="flex flex-col gap-2">
                {r.insights.map((s) => (
                  <li key={s} className="flex gap-2 text-base leading-[1.45] text-text">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                    {s}
                  </li>
                ))}
              </ul>
              {r.prevIncompleteSince && (
                <p className="text-xs text-text-tertiary">
                  Учёт начат {dayMonth(r.prevIncompleteSince)} — прошлый период записан не целиком, рост завышен.
                </p>
              )}
            </Panel>
          )}
          {r.forecast && !filtered && (
            <Panel title="Темп">
              <p className="text-base leading-[1.45] text-text">
                {f1(r.forecast.pace)} ч в рабочий день — к концу месяца выйдет{' '}
                <span className="tabular font-mono font-medium">≈{f1(r.forecast.hours)} ч</span>
                {r.forecast.monthNorm ? (
                  <>
                    {' '}
                    из {fh(r.forecast.monthNorm)} ч нормы ({Math.round((r.forecast.hours / r.forecast.monthNorm) * 100)}%)
                  </>
                ) : null}
                .
              </p>
            </Panel>
          )}
        </div>
      </div>

      {planned.length > 0 && (
        <Panel
          title="План и факт"
          aside={
            <button type="button" className="text-sm font-medium text-accent-text" onClick={() => onTab('tasks')}>
              Все задачи
            </button>
          }
        >
          <div className="flex flex-col divide-y divide-divider">
            {planned.slice(0, 8).map((s) => {
              const pctv = s.pct ?? 0
              const client = r.clients.find((c) => c.key === s.clientKey)
              return (
                <Link
                  key={s.id}
                  to={`/tasks/${s.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2.5 hover:bg-surface-hover lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_7rem_3.5rem]"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {client?.color && (
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seriesColor(client.color) }} aria-hidden />
                    )}
                    <span className="truncate text-base text-text">{s.name}</span>
                    <span className="hidden sm:inline-flex">
                      <StageChip tone={s.isFinal ? 'done' : s.stageTone} label={s.isFinal ? 'Готово' : s.status} />
                    </span>
                  </span>
                  <span className="order-3 col-span-2 block h-1.5 overflow-hidden rounded-full bg-surface-sunken lg:order-none lg:col-span-1">
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.min(100, pctv)}%`, background: s.over > 0.01 ? 'var(--danger)' : 'var(--accent)' }}
                    />
                  </span>
                  <span className="tabular text-right font-mono text-sm text-text">
                    {f1(s.factTotal)} / {fh(s.plan)} ч
                  </span>
                  <span
                    className={`tabular hidden text-right font-mono text-sm lg:block ${s.over > 0.01 ? 'text-danger-text' : 'text-text-secondary'}`}
                  >
                    {pctv}%
                  </span>
                </Link>
              )
            })}
          </div>
          {planned.length > 8 && <span className="text-xs text-text-tertiary">Показаны первые 8 из {planned.length}.</span>}
        </Panel>
      )}
    </div>
  )
}

/* ── задачи: часы по любой задаче за период ──────────────────────── */

const SORTS: { key: TaskSortKey; label: string }[] = [
  { key: 'hours', label: 'По часам' },
  { key: 'name', label: 'По названию' },
  { key: 'plan', label: 'По плану' },
  { key: 'last', label: 'Недавние' },
]

function TasksTable({ report: r, model, statuses, tasks, entries, filter, today }: SelfReportProps) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: TaskSortKey; desc: boolean }>({ key: 'hours', desc: true })
  const [closed, setClosed] = useState<Set<string>>(new Set())

  const base = useMemo(() => {
    const itemGroup = (id: string) => model.itemById.get(id)?.group_id
    const slice = applyFilter(tasks, entries, itemGroup, filter)
    const cur = slice.entries.filter((e) => e.effective_date >= r.from && e.effective_date <= r.to)
    return taskHours(cur, slice.tasks, statuses)
  }, [tasks, entries, filter, model, statuses, r.from, r.to])
  const rows = useMemo(() => sortTaskHours(searchTaskHours(base, query), sort.key, sort.desc), [base, query, sort])
  const total = rows.reduce((s, x) => s + x.hours, 0)
  const statusByLabel = useMemo(() => new Map(statuses.map((s) => [s.label, s])), [statuses])
  const bills = useMemo(() => new Map(r.sprints.filter((s) => s.bill).map((s) => [s.id, s.bill!])), [r.sprints])
  const withMoney = bills.size > 0
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  const grid = withMoney
    ? 'lg:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem_4rem_4rem_5.5rem_7rem]'
    : 'lg:grid-cols-[minmax(0,1fr)_5rem_7rem_6rem_4rem_4rem_5.5rem]'
  const head = (key: TaskSortKey, label: string, right = true) => (
    <button
      type="button"
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key !== 'name' }))}
      className={`flex items-center gap-1 text-sm font-medium hover:text-text ${right ? 'justify-end' : ''} ${
        sort.key === key ? 'text-text' : 'text-text-secondary'
      }`}
    >
      {label}
      {sort.key === key && <span aria-hidden>{sort.desc ? '↓' : '↑'}</span>}
    </button>
  )

  function row(x: TaskHoursRow, child: boolean) {
    const open = !closed.has(x.id)
    const status = x.stage ? statusByLabel.get(x.stage) : undefined
    const label = model.listLabel(taskById.get(x.id) ?? { item_ids: x.itemIds })
    const color = model.colorOf(taskById.get(x.id) ?? { item_ids: x.itemIds })
    const bill = bills.get(x.id)
    const pct = x.plan > 0 ? Math.round((x.factTotal / x.plan) * 100) : null
    return (
      <div
        key={x.id}
        className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2 hover:bg-surface-hover ${grid} ${child ? 'bg-surface-sunken/40' : ''}`}
      >
        <span className={`flex min-w-0 items-center gap-1.5 ${child ? 'pl-7' : ''}`}>
          {!child &&
            (x.children.length > 0 ? (
              <button
                type="button"
                aria-label={open ? 'Свернуть подзадачи' : 'Показать подзадачи'}
                aria-expanded={open}
                onClick={() => setClosed((s) => new Set(open ? [...s, x.id] : [...s].filter((id) => id !== x.id)))}
                className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-xs text-text-secondary hover:bg-surface-sunken"
              >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            ))}
          <button type="button" onClick={() => navigate(`/tasks/${x.id}`)} className="flex min-w-0 flex-col items-start text-left">
            <span className="flex max-w-full items-center gap-1.5">
              {!child && color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seriesColor(color) }} aria-hidden />}
              <span className={`truncate ${child ? 'text-sm text-text' : 'text-base font-medium text-text'} hover:underline`}>{x.name}</span>
            </span>
            {!child && (label || x.stage) && (
              <span className="max-w-full truncate text-xs text-text-secondary">
                {[label, x.stage, `${plural(x.sessions, ['запись', 'записи', 'записей'])} · ${plural(x.days, ['день', 'дня', 'дней'])}`]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            )}
          </button>
        </span>
        <span className="tabular text-right font-mono text-base font-medium text-text">{f1(x.hours)}</span>
        <span className="hidden items-center gap-2 lg:flex">
          <span className="block h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-sunken">
            <span className="block h-full rounded-full bg-accent" style={{ width: `${total > 0 ? Math.max(0, (x.hours / total) * 100) : 0}%` }} />
          </span>
          <span className="tabular w-8 text-right font-mono text-xs text-text-secondary">
            {total > 0 ? Math.round((x.hours / total) * 100) : 0}%
          </span>
        </span>
        <span className="tabular hidden text-right font-mono text-sm text-text-secondary lg:block">
          {x.plan > 0 ? `${f1(x.factTotal)} / ${fh(x.plan)}` : child ? '' : `${f1(x.factTotal)} / —`}
        </span>
        <span
          className={`tabular hidden text-right font-mono text-sm lg:block ${pct !== null && pct > 100 ? 'text-danger-text' : 'text-text-secondary'}`}
        >
          {pct !== null ? `${pct}%` : ''}
        </span>
        <span className="hidden justify-end lg:flex">
          {!child && status && <StageChip tone={stageTone(status, statuses)} label={x.stage ?? ''} />}
        </span>
        <span className="tabular hidden text-right font-mono text-sm text-text-secondary lg:block">
          {x.lastDate ? formatDayMonth(x.lastDate, today) : ''}
        </span>
        {withMoney && (
          <span className="tabular hidden text-right font-mono text-sm text-text lg:block">
            {bill ? formatMoney(bill.amount + (r.options.includeOvertime ? bill.overAmount : 0), bill.currency) : ''}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 lg:max-w-80">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-text-tertiary">
            <Search size={15} />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти задачу или подзадачу"
            aria-label="Найти задачу"
            className={`${fieldClass} pl-8`}
          />
        </label>
        <div className="sc -mx-5 flex gap-1.5 overflow-x-auto px-5 lg:hidden">
          {SORTS.map((s) => (
            <Chip key={s.key} active={sort.key === s.key} onClick={() => setSort({ key: s.key, desc: s.key !== 'name' })}>
              {s.label}
            </Chip>
          ))}
        </div>
        <span className="ml-auto hidden text-sm text-text-secondary lg:block">
          {plural(rows.length, TASKS_F)} · <span className="tabular font-mono text-text">{f1(total)} ч</span>
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={query ? 'Ничего не нашлось' : 'Нет часов за период'}>
          {query ? 'Проверьте запрос или сбросьте срез.' : 'В этих датах по задачам среза нет записей учёта.'}
        </EmptyState>
      ) : (
        <div className="flex flex-col divide-y divide-divider overflow-hidden rounded-md border border-border bg-surface">
          <div className={`hidden items-center gap-x-3 bg-surface-sunken px-3 py-2 lg:grid ${grid}`}>
            {head('name', 'Задача', false)}
            {head('hours', 'Часы')}
            <span className="text-sm font-medium text-text-secondary">Доля</span>
            {head('plan', 'Факт / план')}
            <span className="text-right text-sm font-medium text-text-secondary">%</span>
            <span className="text-right text-sm font-medium text-text-secondary">Этап</span>
            {head('last', 'Последняя')}
            {withMoney && <span className="text-right text-sm font-medium text-text-secondary">К оплате</span>}
          </div>
          {rows.map((x) => (
            <div key={x.id} className="flex flex-col divide-y divide-divider">
              {row(x, false)}
              {!closed.has(x.id) && x.children.map((c) => row(c, true))}
            </div>
          ))}
          <div className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 bg-surface-sunken px-3 py-2.5 ${grid}`}>
            <span className="text-base font-semibold text-text">Итого за период</span>
            <span className="tabular text-right font-mono text-base font-semibold text-text">{f1(total)}</span>
          </div>
        </div>
      )}
      <p className="text-xs text-text-tertiary">
        «Часы» — за выбранный период, у спринта вместе с подзадачами. «Факт / план» — за всё время задачи: план даётся на весь
        спринт. Нажмите на задачу, чтобы открыть её.
      </p>
    </div>
  )
}

/* ── время: как шла работа ───────────────────────────────────────── */

function TimeView({ report: r }: { report: ReportData }) {
  // среднее по дням недели — только по прошедшим дням периода
  const today = r.generatedAt
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const byWd = Array.from({ length: 7 }, () => ({ sum: 0, n: 0 }))
  for (const d of r.days) {
    if (d.date > todayIso) continue
    const w = weekdayOf(d.date)
    byWd[w].sum += d.hours
    byWd[w].n += 1
  }
  const avg = byWd.map((x) => (x.n > 0 ? x.sum / x.n : 0))
  const maxAvg = Math.max(...avg, 0.001)
  const heatTotal = r.heat.flat().reduce((s, v) => s + v, 0)
  const checks = r.checks
  const checkCount = checks ? checks.overnight.length + checks.negativeDays.length + checks.emptyWeekdays.length : 0

  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
      <Panel title="Когда идёт работа" className="lg:col-span-2">
        {heatTotal > 0.05 ? (
          <>
            <Heatmap heat={r.heat} />
            <span className="text-xs text-text-tertiary">
              Часы таймера по дням недели и времени суток: чем плотнее цвет, тем больше работы в этот час. У ручных правок времени суток нет.
            </span>
          </>
        ) : (
          <p className="py-4 text-sm text-text-secondary">За период нет записей таймера — показать время суток не из чего.</p>
        )}
      </Panel>

      <Panel title="В среднем по дням недели">
        <div className="flex h-36 items-end gap-2">
          {avg.map((v, i) => (
            <div key={i} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="tabular font-mono text-xs text-text-secondary">{v > 0.04 ? f1(v) : ''}</span>
              <span
                className="w-full rounded-t-xs"
                style={{
                  height: `${(v / maxAvg) * 72}%`,
                  minHeight: 2,
                  maxWidth: 36,
                  background: v > 0.04 ? 'var(--accent)' : 'var(--bar-empty)',
                  opacity: i >= 5 ? 0.6 : 1,
                }}
              />
              <span className="text-xs text-text-secondary">{WD[i]}</span>
            </div>
          ))}
        </div>
        {r.dayNorm !== null && <span className="text-xs text-text-tertiary">Норма рабочего дня — {fh(r.dayNorm)} ч.</span>}
      </Panel>

      <Panel title="Из чего сложился учёт">
        <SplitBar
          parts={[
            { key: 'timer', label: 'Таймер', hours: r.work.timer, color: 'var(--accent)' },
            { key: 'focus', label: 'Фокус', hours: r.work.focus, color: 'var(--info)' },
            { key: 'meet', label: 'Встречи', hours: r.work.meetings, color: 'var(--status-review)' },
            { key: 'manual', label: 'Вручную', hours: Math.max(0, r.work.manual), color: 'var(--text-tertiary)' },
          ]}
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-divider pt-3 text-sm">
          {(
            [
              ['Записей таймера', String(r.composition.sessions)],
              ['Самый длинный заход', hm(r.work.longest)],
              ['Ручных правок', String(r.composition.manualCount)],
              ['Убрано правками', r.composition.removed < -0.004 ? `${f1(r.composition.removed)} ч` : '—'],
              ['Pomodoro', String(r.work.pomodoro)],
              ['Глубоких отрезков', String(r.work.deep)],
              ['Встреч засчитано', String(r.work.meetingCount)],
              ['Часов без плана', `${f1(r.unplannedHours)} ч`],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2">
              <dt className="truncate text-text-secondary">{k}</dt>
              <dd className="tabular shrink-0 font-mono text-text">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      {r.method && (
        <Panel title={`По методике · ${r.method.title}`}>
          <div className="-mx-2">
            <HBars
              rows={r.method.rows.map((x) => ({ id: '', name: x.label, hours: x.hours, share: r.total > 0 ? x.hours / r.total : 0 }))}
            />
          </div>
        </Panel>
      )}

      {checks && (
        <Panel title="Что проверить" className={r.method ? '' : 'lg:col-span-2'}>
          {checkCount === 0 ? (
            <p className="text-sm text-text-secondary">Странностей в учёте за период не видно.</p>
          ) : (
            <ul className="flex flex-col gap-2 text-sm leading-[1.5] text-text">
              {checks.overnight.map((o) => (
                <li key={`${o.date}${o.task}`}>
                  <span className="font-medium">{dayMonth(o.date)}</span> — таймер шёл {hm(o.hours)} и остановлен в {o.endedAt}: «{o.task}».
                  Возможно, забыли выключить.
                </li>
              ))}
              {checks.negativeDays.map((d) => (
                <li key={d.date}>
                  <span className="font-medium">{dayMonth(d.date)}</span> — день в минусе: {f1(d.hours)} ч. Правка вычла больше, чем записано.
                </li>
              ))}
              {checks.emptyWeekdays.length > 0 && (
                <li>
                  Рабочие дни без записей ({checks.emptyWeekdays.length}):{' '}
                  {checks.emptyWeekdays.slice(0, 12).map(dayMonth).join(', ')}
                  {checks.emptyWeekdays.length > 12 ? '…' : ''}.
                </li>
              )}
            </ul>
          )}
        </Panel>
      )}
    </div>
  )
}

/* ── журнал: записи по дням ──────────────────────────────────────── */

const TAG: Record<string, string> = { meeting: 'встреча', pomodoro: 'pomodoro', deep: 'фокус', manual: 'вручную' }
const PAGE = 14

function JournalView({ report: r }: { report: ReportData }) {
  const days = useMemo(() => [...r.journal].reverse(), [r.journal])
  const [shown, setShown] = useState(PAGE)
  if (days.length === 0) {
    return <EmptyState title="Журнал пуст">За период нет записей учёта.</EmptyState>
  }
  return (
    <div className="flex flex-col gap-3">
      {days.slice(0, shown).map((day) => (
        <section key={day.date} className="overflow-hidden rounded-md border border-border bg-surface">
          <header className="flex items-baseline justify-between gap-3 bg-surface-sunken px-3.5 py-2">
            <h3 className="text-base font-semibold text-text first-letter:uppercase">{day.label}</h3>
            <span className="tabular font-mono text-sm font-medium text-text">{hm(day.total)}</span>
          </header>
          <div className="flex flex-col divide-y divide-divider">
            {day.entries.map((e, i) => {
              const client = r.clients.find((c) => c.key === e.clientKey)
              return (
                <div key={i} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-baseline gap-x-3 px-3.5 py-2">
                  <span className="tabular font-mono text-xs text-text-secondary">{e.start ? `${e.start}–${e.end}` : 'правка'}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {client?.color && (
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seriesColor(client.color) }} aria-hidden />
                      )}
                      <span className="truncate text-base text-text">{e.title}</span>
                      {e.tag && e.tag !== 'manual' && (
                        <span className="shrink-0 rounded-full bg-surface-sunken px-1.5 text-xs text-text-secondary">{TAG[e.tag]}</span>
                      )}
                    </span>
                    {e.note && <span className="text-sm leading-[1.45] text-text-secondary">{e.note}</span>}
                  </span>
                  <span className="tabular text-right font-mono text-sm text-text">{hm(e.hours)}</span>
                </div>
              )
            })}
            {day.rows
              .filter((x) => x.hours === 0 && x.comments.length > 0)
              .map((x) => (
                <div key={x.title} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 px-3.5 py-2">
                  <span className="text-xs text-text-secondary">заметка</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-base text-text">{x.title}</span>
                    <span className="text-sm leading-[1.45] text-text-secondary">{x.comments.join(' · ')}</span>
                  </span>
                </div>
              ))}
          </div>
        </section>
      ))}
      {shown < days.length && (
        <button
          type="button"
          onClick={() => setShown(shown + PAGE)}
          className="self-center rounded-sm px-3 py-2 text-sm font-medium text-accent-text hover:bg-surface-sunken"
        >
          Показать ещё {Math.min(PAGE, days.length - shown)} из {days.length - shown}
        </button>
      )}
    </div>
  )
}
