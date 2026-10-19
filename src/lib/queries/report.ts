import { buildReport, previousPeriod, type ReportData, type ReportOptions } from '../report'
import { supabase } from '../supabaseClient'
import { activeWorkspaceId } from '../workspace'
import type { Comment, Group, GroupItem, Status, Task, TimeEntry } from '../types'
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

/** Всё, что нужно отчёту за период, — одним заходом при нажатии «Скачать». */
export async function loadReport(args: {
  from: string
  to: string
  tasks: Task[]
  groups: Group[]
  items: GroupItem[]
  statuses: Status[]
  options: ReportOptions
}): Promise<ReportData> {
  const { from, to, options } = args
  const prev = previousPeriod(from, to)
  const ws = activeWorkspaceId()
  const start = localMidnightIso(from)
  const end = localMidnightIso(to, 1)

  const [entries, comments, closed, first, settings] = await Promise.all([
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
    options.includeComments
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
    supabase.from('workspaces').select('planned_hours_per_day, planned_hours_per_month, work_days_per_week').eq('id', ws).maybeSingle(),
  ])
  if (first.error) throw first.error
  if (settings.error) throw settings.error

  return buildReport({
    from,
    to,
    tasks: args.tasks,
    groups: args.groups,
    items: args.items,
    statuses: args.statuses,
    entries,
    comments,
    closedTaskIds: [...new Set(closed.map((c) => c.task_id))],
    firstEntryDate: (first.data as { effective_date: string } | null)?.effective_date ?? null,
    perDay: settings.data?.planned_hours_per_day != null ? Number(settings.data.planned_hours_per_day) : null,
    perMonth: settings.data?.planned_hours_per_month != null ? Number(settings.data.planned_hours_per_month) : null,
    workDays: normSettingsOf(settings.data).workDays,
    generatedAt: new Date(),
    options,
  })
}
