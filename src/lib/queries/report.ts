import { useQuery } from '@tanstack/react-query'
import { buildReport, previousPeriod, type FocusSessionInput, type ReportData, type ReportOptions } from '../report'
import { supabase } from '../supabaseClient'
import { activeWorkspaceId } from '../workspace'
import type { Comment, Group, GroupItem, PriorityMethod, Status, Task, TimeEntry } from '../types'
import { normSettingsOf } from '../norm'

/** местная полночь дня YYYY-MM-DD в ISO — граница для полей timestamptz */
function localMidnightIso(iso: string, addDays = 0): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d + addDays).toISOString()
}

/**
 * PostgREST отдаёт не больше 1000 строк за запрос. Отчёт за год легко набирает больше,
 * и без постраничной выборки хвост периода молча пропал бы из итогов.
 */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const size = 1000
  const out: T[] = []
  for (let offset = 0; ; offset += size) {
    const { data, error } = await page(offset, offset + size - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < size) return out
  }
}

/** Сырые данные отчёта за период — то, что лежит в базе; считает buildReport. */
export interface ReportRaw {
  from: string
  to: string
  /** записи за [начало прошлого периода, конец текущего] */
  entries: TimeEntry[]
  comments: Comment[]
  closedTaskIds: string[]
  firstEntryDate: string | null
  perDay: number | null
  perMonth: number | null
  workDays: number
  clientWork: boolean
  priorityMethod: PriorityMethod
  focusSessions: FocusSessionInput[]
  meetingEntryIds: string[]
}

export async function fetchReportRaw(from: string, to: string, withComments: boolean): Promise<ReportRaw> {
  const prev = previousPeriod(from, to)
  const ws = activeWorkspaceId()
  const start = localMidnightIso(from)
  const end = localMidnightIso(to, 1)

  const [entries, comments, closed, first, settings, focus, meetings] = await Promise.all([
    fetchAll<TimeEntry>((a, b) =>
      supabase
        .from('time_entries')
        .select('*')
        .eq('workspace_id', ws)
        .gte('effective_date', prev.from)
        .lte('effective_date', to)
        .order('id')
        .range(a, b),
    ),
    withComments
      ? fetchAll<Comment>((a, b) =>
          supabase.from('comments').select('*').eq('workspace_id', ws).gte('created_at', start).lt('created_at', end).order('id').range(a, b),
        )
      : Promise.resolve([] as Comment[]),
    fetchAll<{ task_id: string }>((a, b) =>
      supabase
        .from('task_status_events')
        .select('task_id')
        .eq('workspace_id', ws)
        .eq('is_final', true)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('id')
        .range(a, b),
    ),
    supabase.from('time_entries').select('effective_date').eq('workspace_id', ws).order('effective_date').limit(1).maybeSingle(),
    // норма — пространства, а не профиля
    supabase
      .from('workspaces')
      .select('planned_hours_per_day, planned_hours_per_month, work_days_per_week, client_work, priority_method')
      .eq('id', ws)
      .maybeSingle(),
    // отрезки фокуса за период — у журнала нет пространства, свои задачи отберёт отчёт
    fetchAll<FocusSessionInput>((a, b) =>
      supabase
        .from('focus_sessions')
        .select('task_id, mode, started_at, ended_at, completed')
        .gte('started_at', start)
        .lt('started_at', end)
        .order('id')
        .range(a, b),
    ),
    // встречи, засчитанные в учёт: их записи помечаются в журнале и считаются отдельно
    fetchAll<{ entry_id: string | null }>((a, b) =>
      supabase
        .from('calendar_events')
        .select('entry_id')
        .eq('status', 'logged')
        .not('entry_id', 'is', null)
        .gte('starts_at', localMidnightIso(from, -1))
        .lt('starts_at', localMidnightIso(to, 2))
        .order('id')
        .range(a, b),
    ),
  ])
  if (first.error) throw first.error
  if (settings.error) throw settings.error
  const s = settings.data as {
    planned_hours_per_day?: number | null
    planned_hours_per_month?: number | null
    client_work?: boolean
    priority_method?: PriorityMethod
  } | null
  return {
    from,
    to,
    entries,
    comments,
    closedTaskIds: [...new Set(closed.map((c) => c.task_id))],
    firstEntryDate: (first.data as { effective_date: string } | null)?.effective_date ?? null,
    perDay: s?.planned_hours_per_day != null ? Number(s.planned_hours_per_day) : null,
    perMonth: s?.planned_hours_per_month != null ? Number(s.planned_hours_per_month) : null,
    workDays: normSettingsOf(settings.data).workDays,
    clientWork: s?.client_work === true,
    priorityMethod: s?.priority_method ?? 'none',
    focusSessions: focus,
    meetingEntryIds: meetings.map((m) => m.entry_id).filter((id): id is string => !!id),
  }
}

/**
 * Отчёт из сырых данных. Без «Работы с клиентами» ставок в отчёте нет: ни «К оплате»,
 * ни колонок суммы. tasks/entries можно передать уже отфильтрованными (срез «Сводки»).
 */
export function reportFromRaw(
  raw: ReportRaw,
  args: { tasks: Task[]; groups: Group[]; items: GroupItem[]; statuses: Status[]; options: ReportOptions; entries?: TimeEntry[] },
): ReportData {
  const noRate = { hourly_rate: null, rate_currency: null }
  const cw = raw.clientWork
  return buildReport({
    from: raw.from,
    to: raw.to,
    tasks: cw ? args.tasks : args.tasks.map((t) => ({ ...t, ...noRate })),
    groups: args.groups,
    items: cw ? args.items : args.items.map((i) => ({ ...i, ...noRate })),
    statuses: args.statuses,
    entries: args.entries ?? raw.entries,
    comments: args.options.includeComments ? raw.comments : [],
    closedTaskIds: raw.closedTaskIds,
    firstEntryDate: raw.firstEntryDate,
    perDay: raw.perDay,
    perMonth: raw.perMonth,
    workDays: raw.workDays,
    generatedAt: new Date(),
    options: args.options,
    focusSessions: raw.focusSessions,
    meetingEntryIds: raw.meetingEntryIds,
    priorityMethod: raw.priorityMethod,
  })
}

/** свой логотип из настроек профиля; null — в шапке знак Semternity */
export async function fetchReportLogo(): Promise<string | null> {
  const { data } = await supabase.from('user_settings').select('report_logo').maybeSingle()
  return (data as { report_logo?: string | null } | null)?.report_logo ?? null
}

/** Всё, что нужно отчёту за период, — одним заходом при нажатии «Скачать». */
export async function loadReport(args: {
  from: string
  to: string
  tasks: Task[]
  groups: Group[]
  items: GroupItem[]
  statuses: Status[]
  options: ReportOptions
  /** свой логотип в шапке — только если тариф позволяет («Про») */
  withLogo?: boolean
}): Promise<ReportData> {
  const raw = await fetchReportRaw(args.from, args.to, args.options.includeComments)
  const report = reportFromRaw(raw, args)
  const logo = args.withLogo ? await fetchReportLogo() : null
  return { ...report, logo }
}

/**
 * Данные «Сводки» за период (0.66) — с комментариями: экран для себя. Держим прошлый
 * результат, пока грузится новый период, — графики не мигают.
 */
export function useReportRaw(from: string, to: string) {
  return useQuery({
    queryKey: ['report_raw', activeWorkspaceId(), from, to],
    queryFn: () => fetchReportRaw(from, to, true),
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  })
}
