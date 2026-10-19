import { useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { activeWorkspaceId } from '../workspace'
import { addDays, todayStr } from '../period'
import {
  buildChronology,
  type ChronoDay,
  type ChronoEntry,
  type CommentRow,
  type FileRow,
  type StatusEventRow,
  type TaskChangeRow,
} from '../chronology'

/** неделя за заход: дни приходят по мере прокрутки */
const PAGE_DAYS = 7

/** местная полночь дня YYYY-MM-DD в ISO — граница для полей timestamptz */
function localMidnightIso(date: string, plusDays = 0): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d + plusDays).toISOString()
}

/** PostgREST отдаёт не больше 1000 строк за запрос — забираем постранично */
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await page(offset, offset + 999)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) return out
  }
}

export interface ChronoPage {
  from: string
  to: string
  days: ChronoDay[]
  /** раньше этой даты действий нет — дальше не листаем */
  firstDay: string | null
}

async function loadPage(to: string, firstDayKnown: string | null | undefined): Promise<ChronoPage> {
  const from = addDays(to, -(PAGE_DAYS - 1))
  const ws = activeWorkspaceId()
  const start = localMidnightIso(from)
  const end = localMidnightIso(to, 1)

  const [entries, events, changes, comments, files, meetings, first] = await Promise.all([
    fetchAll<ChronoEntry>((a, b) =>
      supabase
        .from('time_entries')
        .select('id, task_id, entry_type, started_at, ended_at, duration_seconds, duration_minutes, note, effective_date, created_at')
        .eq('workspace_id', ws)
        .gte('effective_date', from)
        .lte('effective_date', to)
        .order('id')
        .range(a, b),
    ),
    fetchAll<StatusEventRow>((a, b) =>
      supabase
        .from('task_status_events')
        .select('id, task_id, status_id, is_final, created_at')
        .eq('workspace_id', ws)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('id')
        .range(a, b),
    ),
    fetchAll<TaskChangeRow>((a, b) =>
      supabase
        .from('task_changes')
        .select('id, task_id, task_name, field, old_value, new_value, created_at')
        .eq('workspace_id', ws)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('id')
        .range(a, b),
    ),
    fetchAll<CommentRow>((a, b) =>
      supabase.from('comments').select('id, task_id, body, created_at').eq('workspace_id', ws).gte('created_at', start).lt('created_at', end).order('id').range(a, b),
    ),
    fetchAll<FileRow>((a, b) =>
      supabase
        .from('attachments')
        .select('id, task_id, name, created_at')
        .eq('workspace_id', ws)
        .not('task_id', 'is', null)
        .gte('created_at', start)
        .lt('created_at', end)
        .order('id')
        .range(a, b),
    ),
    fetchAll<{ entry_id: string }>((a, b) =>
      supabase
        .from('calendar_events')
        .select('entry_id')
        .not('entry_id', 'is', null)
        .gte('starts_at', localMidnightIso(from, -1))
        .lt('starts_at', localMidnightIso(to, 2))
        .order('id')
        .range(a, b),
    ),
    firstDayKnown !== undefined
      ? Promise.resolve(firstDayKnown)
      : supabase
          .from('time_entries')
          .select('effective_date')
          .eq('workspace_id', ws)
          .order('effective_date')
          .limit(1)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) throw error
            return (data as { effective_date: string } | null)?.effective_date ?? null
          }),
  ])

  // «было» у первой смены этапа в периоде — последнее событие той же задачи до него
  const taskIds = [...new Set(events.map((e) => e.task_id))]
  const earlier = taskIds.length
    ? await fetchAll<StatusEventRow>((a, b) =>
        supabase
          .from('task_status_events')
          .select('id, task_id, status_id, is_final, created_at')
          .in('task_id', taskIds)
          .lt('created_at', start)
          .order('id')
          .range(a, b),
      )
    : []

  const days = buildChronology({
    entries,
    statusEvents: [...earlier, ...events],
    changes,
    comments,
    files,
    meetingEntryIds: new Set(meetings.map((m) => m.entry_id)),
    from,
    to,
  })
  return { from, to, days, firstDay: first }
}

/**
 * Хронология неделями от даты anchor (по умолчанию — сегодня) назад; следующая неделя —
 * при прокрутке к концу.
 */
export function useChronology(anchor: string = todayStr()) {
  return useInfiniteQuery({
    queryKey: ['chronology', anchor],
    initialPageParam: anchor,
    queryFn: ({ pageParam, client }) => {
      const pages = client.getQueryData<{ pages: ChronoPage[] }>(['chronology', anchor])?.pages
      return loadPage(pageParam, pages?.[0]?.firstDay)
    },
    getNextPageParam: (last) => {
      const next = addDays(last.from, -1)
      // учёта раньше нет — но изменения задач могли быть до первой записи: ещё неделя запаса
      if (!last.firstDay || next < addDays(last.firstDay, -PAGE_DAYS)) return undefined
      return next
    },
    staleTime: 30 * 1000,
  })
}
