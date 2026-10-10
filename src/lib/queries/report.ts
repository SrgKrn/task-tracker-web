import { buildReport, previousPeriod, type ReportData, type ReportOptions } from '../report'
import { supabase } from '../supabaseClient'
import type { Comment, Group, GroupItem, Status, Task, TimeEntry } from '../types'

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
  const start = localMidnightIso(from)
  const end = localMidnightIso(to, 1)

  const [entries, comments, closed, first, settings] = await Promise.all([
    fetchAll<TimeEntry>((a, b) =>
      supabase
        .from('time_entries')
        .select('*')
        .gte('effective_date', prev.from)
        .lte('effective_date', to)
        .order('id')
        .range(a, b),
    ),
    options.includeComments
      ? fetchAll<Comment>((a, b) =>
          supabase.from('comments').select('*').gte('created_at', start).lt('created_at', end).order('id').range(a, b),
        )
      : Promise.resolve([] as Comment[]),
    fetchAll<{ task_id: string }>((a, b) =>
      supabase
        .from('task_status_events')
        .select('task_id')
        .eq('is_final', true)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('id')
        .range(a, b),
    ),
    supabase.from('time_entries').select('effective_date').order('effective_date').limit(1).maybeSingle(),
    supabase.from('user_settings').select('planned_hours_per_day, planned_hours_per_month').maybeSingle(),
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
    generatedAt: new Date(),
    options,
  })
}
