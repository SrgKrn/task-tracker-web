import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ProfileButton } from '../components/Avatar'
import { ArrowLeft, Download } from '../components/Icon'
import { Button, Segmented, Sheet, Skeleton } from '../components/ui'
import { UpgradeNote, useGate } from '../components/Upgrade'
import { WorkspaceTag } from '../components/Workspaces'
import { ClientReport } from '../components/report/ClientReport'
import { PeriodControl } from '../components/report/PeriodControl'
import { FilterButton, ReportFilters } from '../components/report/ReportFilters'
import { SELF_TABS, SelfReport, type SelfTab } from '../components/report/SelfReport'
import { useMediaQuery } from '../lib/device'
import { useGroupModel } from '../lib/groups'
import { addDays, todayStr } from '../lib/period'
import { useGroupItems, useGroups } from '../lib/queries/groups'
import { fetchReportLogo, reportFromRaw, useReportRaw } from '../lib/queries/report'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { ALL_SECTIONS, type ReportOptions, type ReportSections } from '../lib/report'
import {
  clampPeriod,
  customPeriod,
  loadPeriod,
  periodTitle,
  savePeriod,
  type ReportPeriod,
} from '../lib/reportPeriod'
import { EMPTY_FILTER, applyFilter, isFilterEmpty, type Bucket, type ReportFilter } from '../lib/reportViews'
import { useTip } from '../lib/tips'
import { describeError, useToast } from '../lib/Toast'
import { useActiveWorkspace, useClientWork } from '../lib/workspace'

type Mode = 'self' | 'client'

const EXPORT_OPTIONS_KEY = 'semternity.exportOptions'

/** галочки выгрузки — те же, что на экране «Экспорт отчёта» (один ключ в памяти устройства) */
function loadExportOptions(): ReportOptions {
  try {
    const raw = localStorage.getItem(EXPORT_OPTIONS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as Partial<ReportOptions>
      return {
        includeChecks: p.includeChecks === true,
        includeComments: p.includeComments === true,
        includeOvertime: p.includeOvertime === true,
        sections: { ...ALL_SECTIONS, ...(p.sections ?? {}) },
      }
    }
  } catch {
    // приватный режим — значения по умолчанию
  }
  return { includeChecks: false, includeComments: false, includeOvertime: false, sections: ALL_SECTIONS }
}

/**
 * «Сводка» (0.66) — отчёт за любой период. Для себя: показатели, график, «куда ушло время»
 * по любой группе, часы по каждой задаче, время суток и журнал; всё пересчитывается по срезу
 * и выгружается в PDF и Excel. Для клиента (в пространствах с «Работой с клиентами»):
 * задачи — часы — ставка — сумма, с реквизитами сторон.
 */
export function Dashboard() {
  const today = todayStr()
  const [searchParams, setSearchParams] = useSearchParams()
  const workspace = useActiveWorkspace()
  const clientWork = useClientWork()
  const gate = useGate()
  const limits = gate.plan?.limits
  // глубина истории по тарифу: на «Старте» — год; раньше начало периода не ставим
  const historyDays = limits?.history_days ?? null
  const minFrom = historyDays === null ? null : addDays(today, -historyDays)

  const [period, setPeriodState] = useState<ReportPeriod>(() => loadPeriod(today))
  const [historyCut, setHistoryCut] = useState(false)
  /** откуда провалились нажатием на столбик — чтобы вернуться одним нажатием */
  const [trail, setTrail] = useState<ReportPeriod[]>([])
  const [filter, setFilter] = useState<ReportFilter>(EMPTY_FILTER)
  const [exportOpen, setExportOpen] = useState(false)

  function setPeriod(next: ReportPeriod, keepTrail = false) {
    const { period: p, cut } = clampPeriod(next, minFrom)
    setHistoryCut(cut)
    setPeriodState(p)
    savePeriod(p, today)
    if (!keepTrail) setTrail([])
  }
  function drill(b: Bucket) {
    setTrail((t) => [...t, period])
    setPeriod(customPeriod(b.from, b.to), true)
  }
  function back() {
    const prev = trail[trail.length - 1]
    if (!prev) return
    setTrail((t) => t.slice(0, -1))
    setPeriod(prev, true)
  }

  // режим и вкладка — в адресе: ссылку на «для клиента» дают карточка клиента и поиск
  const canClientMode = clientWork || workspace?.preset_code === 'clients'
  const mode: Mode = canClientMode && searchParams.get('mode') === 'client' ? 'client' : 'self'
  const tabParam = searchParams.get('tab') as SelfTab | null
  const tab: SelfTab = SELF_TABS.some((t) => t.value === tabParam) ? tabParam! : 'overview'
  function setParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value === null) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  const { data: tasks = [], isLoading: tasksLoading } = useTasks()
  const { data: groups = [] } = useGroups()
  const { data: items = [] } = useGroupItems()
  const { data: statuses = [] } = useStatuses()
  const model = useGroupModel()
  const rawQuery = useReportRaw(period.from, period.to)
  const raw = rawQuery.data
  const loading = tasksLoading || (rawQuery.isLoading && !raw)

  // срез применяется до расчёта: все цифры экрана и обе выгрузки — по одним и тем же записям
  const slice = useMemo(() => {
    const itemGroup = (id: string) => model.itemById.get(id)?.group_id
    return applyFilter(tasks, raw?.entries ?? [], itemGroup, filter)
  }, [tasks, raw, filter, model])

  const [exportOptions, setExportOptions] = useState(loadExportOptions)
  const report = useMemo(() => {
    if (!raw) return null
    return reportFromRaw(raw, {
      tasks: slice.tasks,
      entries: slice.entries,
      groups,
      items,
      statuses,
      // экран — для себя: комментарии и проверки всегда; в выгрузке — по галочкам
      options: { includeChecks: true, includeComments: true, includeOvertime: exportOptions.includeOvertime },
    })
  }, [raw, slice, groups, items, statuses, exportOptions.includeOvertime])

  useTip('summary', true)
  useTip('export', (report?.total ?? 0) > 0)

  const filterLabel = [
    ...filter.items.map((id) => model.itemById.get(id)?.name),
    ...filter.tasks.map((id) => tasks.find((t) => t.id === id)?.name.trim()),
  ]
    .filter(Boolean)
    .join(', ')

  const wide = useMediaQuery('(min-width: 1024px)')
  const taskName = (id: string) => tasks.find((t) => t.id === id)?.name.trim() ?? 'Задача'
  const drillBack = trail.length > 0 && (
    <button
      type="button"
      onClick={back}
      className="inline-flex items-center gap-1.5 self-start rounded-sm text-sm font-medium text-accent-text hover:underline"
    >
      <ArrowLeft size={14} />
      Назад: {periodTitle(trail[trail.length - 1], today)}
    </button>
  )
  const historyNote = historyCut && historyDays !== null && (
    <UpgradeNote need="plus" what={`История старше ${historyDays === 365 ? 'года' : historyDays + ' дней'}`} />
  )

  return (
    <div className="page page-wide mx-auto flex max-w-lg flex-col">
      <div className="safe-top">
        {wide ? (
          <div className="flex flex-col gap-4 px-5 pt-3.5 pb-4">
            <div className="flex flex-col gap-1">
              <WorkspaceTag full className="self-start" />
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">Сводка</h1>
                <div className="flex items-center gap-2">
                  {canClientMode && (
                    <Segmented<Mode>
                      value={mode}
                      onChange={(m) => setParam('mode', m === 'client' ? 'client' : null)}
                      options={[
                        { value: 'self', label: 'Для себя' },
                        { value: 'client', label: 'Для клиента' },
                      ]}
                    />
                  )}
                  {mode === 'self' && (
                    <Button data-tip="export" onClick={() => setExportOpen(true)}>
                      <Download size={15} />
                      Выгрузить
                    </Button>
                  )}
                  <ProfileButton />
                </div>
              </div>
            </div>
            <PeriodControl period={period} onChange={(p) => setPeriod(p)} today={today} tip="summary" />
            {drillBack}
            {historyNote}
            {mode === 'self' && (
              <>
                <ReportFilters model={model} filter={filter} onChange={setFilter} taskName={taskName} />
                <Segmented<SelfTab> className="self-start" value={tab} onChange={(t) => setParam('tab', t === 'overview' ? null : t)} options={SELF_TABS} />
              </>
            )}
          </div>
        ) : (
          /*
           * Телефон: три строки разного вида, чтобы не сливались, — заголовок с действиями,
           * период рамкой во всю ширину, вкладки подчёркиванием. Готовые периоды — в окне по
           * названию периода, срез — за кнопкой-воронкой, «Для клиента» — пятой вкладкой.
           */
          <div className="flex flex-col gap-2 px-5 pt-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">Сводка</h1>
                <WorkspaceTag />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {mode === 'self' && (
                  <button
                    type="button"
                    data-tip="export"
                    aria-label="Выгрузить отчёт"
                    onClick={() => setExportOpen(true)}
                    className="inline-flex h-[var(--tap)] w-10 items-center justify-center rounded-sm text-text-secondary active:bg-surface-sunken"
                  >
                    <Download size={18} />
                  </button>
                )}
                <ProfileButton />
              </div>
            </div>
            <PeriodControl
              compact
              period={period}
              onChange={(p) => setPeriod(p)}
              today={today}
              tip="summary"
              trailing={mode === 'self' ? <FilterButton model={model} filter={filter} onChange={setFilter} /> : undefined}
            />
            {drillBack}
            {historyNote}
            {mode === 'self' && <ReportFilters compact model={model} filter={filter} onChange={setFilter} taskName={taskName} />}
            <div className="-mx-5 flex border-b border-divider px-3" role="tablist">
              {[...SELF_TABS, ...(canClientMode ? [{ value: 'client' as const, label: 'Клиенту' }] : [])].map((o) => {
                const active = o.value === 'client' ? mode === 'client' : mode === 'self' && tab === o.value
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      if (o.value === 'client') setParam('mode', 'client')
                      else
                        setSearchParams(
                          (prev) => {
                            const next = new URLSearchParams(prev)
                            next.delete('mode')
                            if (o.value === 'overview') next.delete('tab')
                            else next.set('tab', o.value)
                            return next
                          },
                          { replace: true },
                        )
                    }}
                    className={`-mb-px h-10 min-w-0 flex-1 border-b-2 text-base ${
                      active ? 'border-accent font-medium text-text' : 'border-transparent text-text-secondary'
                    }`}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div
        className="px-5 pt-2.5 pb-6 transition-opacity duration-200 lg:pt-0"
        style={{ opacity: rawQuery.isPlaceholderData ? 0.55 : 1 }}
        aria-busy={loading || rawQuery.isPlaceholderData}
      >
        {rawQuery.isError && !raw ? (
          <p className="py-8 text-center text-sm text-danger-text">Не получилось загрузить данные: {describeError(rawQuery.error)}</p>
        ) : loading || !raw || !report ? (
          <div className="flex flex-col gap-3" aria-label="Сводка загружается">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : mode === 'client' ? (
          clientWork ? (
            <ClientReport
              raw={raw}
              tasks={tasks}
              groups={groups}
              items={items}
              statuses={statuses}
              model={model}
              limits={limits}
              initialClient={searchParams.get('client')}
            />
          ) : (
            <UpgradeNote need="pro" what="Отчёт для клиента: ставка, сумма к оплате и реквизиты" />
          )
        ) : (
          <SelfReport
            tab={tab}
            onTab={(t) => setParam('tab', t === 'overview' ? null : t)}
            report={report}
            model={model}
            statuses={statuses}
            tasks={tasks}
            entries={raw.entries}
            filter={filter}
            setFilter={setFilter}
            onDrill={drill}
            today={today}
          />
        )}
      </div>

      <ExportSheet
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        options={exportOptions}
        onOptions={(next) => {
          setExportOptions(next)
          try {
            localStorage.setItem(EXPORT_OPTIONS_KEY, JSON.stringify(next))
          } catch {
            // не запомнили — галочки сбросятся при следующем открытии
          }
        }}
        clientWork={clientWork}
        canExport={!limits || limits.export}
        canExtras={!limits || limits.export_extras}
        scope={`${periodTitle(period, today)}${isFilterEmpty(filter) ? '' : ` · ${filterLabel}`}`}
        build={async (options) => {
          if (!raw) throw new Error('Данные ещё грузятся')
          const data = reportFromRaw(raw, { tasks: slice.tasks, entries: slice.entries, groups, items, statuses, options })
          const logo = limits?.logo ? await fetchReportLogo() : null
          // срез — в заголовке отчёта: по файлу видно, что это не все часы
          return { ...data, logo, label: isFilterEmpty(filter) ? data.label : `${data.label} · ${filterLabel}` }
        }}
      />
    </div>
  )
}

const SECTION_TITLES: [keyof ReportSections, string][] = [
  ['clients', 'Клиенты и спринты'],
  ['work', 'Как шла работа'],
  ['billing', 'К оплате'],
  ['journal', 'Журнал'],
]

function ExportSheet({
  open,
  onClose,
  options,
  onOptions,
  clientWork,
  canExport,
  canExtras,
  scope,
  build,
}: {
  open: boolean
  onClose: () => void
  options: ReportOptions
  onOptions: (o: ReportOptions) => void
  clientWork: boolean
  canExport: boolean
  canExtras: boolean
  /** что выгружается: период и срез */
  scope: string
  build: (options: ReportOptions) => Promise<import('../lib/report').ReportData>
}) {
  const [busy, setBusy] = useState<'pdf' | 'excel' | null>(null)
  const { showError } = useToast()
  const sections = { ...ALL_SECTIONS, ...(options.sections ?? {}) }

  async function run(format: 'pdf' | 'excel') {
    setBusy(format)
    try {
      const data = await build(canExtras ? options : { ...options, includeChecks: false, includeComments: false })
      if (format === 'excel') {
        const { exportExcel } = await import('../lib/exportExcel')
        await exportExcel(data)
      } else {
        const { exportPdf } = await import('../lib/exportPdf')
        await exportPdf(data)
      }
      onClose()
    } catch (e) {
      showError(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  const checks: { key: 'includeComments' | 'includeChecks' | 'includeOvertime'; title: string; hint: string; show: boolean }[] = [
    { key: 'includeComments', title: 'Комментарии в журнале', hint: 'пишутся для себя — включайте, если отчёт не уходит дальше', show: canExtras },
    { key: 'includeChecks', title: '«Что проверить»', hint: 'забытый таймер, дни в минусе, будни без записей', show: canExtras },
    { key: 'includeOvertime', title: 'Переработку — в сумму к оплате', hint: 'по умолчанию план — потолок оплаты', show: clientWork },
  ]

  return (
    <Sheet open={open} onClose={onClose} title="Выгрузить отчёт" anchored>
      {!canExport ? (
        <UpgradeNote need="plus" what="Отчёт PDF и Excel" />
      ) : (
        <div className="flex flex-col gap-3 lg:w-80">
          <p className="text-sm leading-[1.5] text-text-secondary">
            <span className="font-medium text-text">{scope}</span> — в файл попадёт то же, что на экране, с учётом среза.
          </p>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-text-secondary">Листы в PDF</span>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex h-8 items-center rounded-full bg-surface-sunken px-3 text-sm text-text-secondary">Сводка</span>
              {SECTION_TITLES.filter(([key]) => key !== 'billing' || clientWork).map(([key, title]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={sections[key]}
                  onClick={() => onOptions({ ...options, sections: { ...sections, [key]: !sections[key] } })}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-sm ${
                    sections[key] ? 'border-accent bg-accent-soft text-accent-text' : 'border-border text-text-secondary'
                  }`}
                >
                  {title}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col">
            {checks
              .filter((c) => c.show)
              .map((c) => (
                <label key={c.key} className="flex min-h-11 cursor-pointer items-center gap-2.5 py-1">
                  <input
                    type="checkbox"
                    checked={options[c.key] === true}
                    onChange={(e) => onOptions({ ...options, [c.key]: e.target.checked })}
                    className="h-4.5 w-4.5 shrink-0 accent-accent"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-base text-text">{c.title}</span>
                    <span className="text-xs leading-[1.4] text-text-secondary">{c.hint}</span>
                  </span>
                </label>
              ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" loading={busy === 'pdf'} disabled={!!busy} onClick={() => run('pdf')}>
              <Download size={15} />
              PDF
            </Button>
            <Button loading={busy === 'excel'} disabled={!!busy} onClick={() => run('excel')}>
              <Download size={15} />
              Excel
            </Button>
          </div>
          <Link to="/settings/export" className="text-sm font-medium text-accent-text">
            На Google Диск, логотип и ссылки клиентам
          </Link>
        </div>
      )}
    </Sheet>
  )
}
