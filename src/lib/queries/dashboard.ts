import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { TaskStatusEvent, TimeEntry } from '../types'

/** time_entries logged (created_at) within [fromISO, toISO) — the "fact" side of the dashboard. */
export function useTimeEntriesInRange(fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ['time_entries_range', fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .gte('created_at', fromISO)
        .lt('created_at', toISO)
      if (error) throw error
      return data as TimeEntry[]
    },
  })
}

/**
 * Переходы в финальный статус за период. Считаем по факту закрытия, а не по tasks.updated_at:
 * тот сдвигается любой правкой задачи и завышал метрику «задач закрыто».
 */
export function useClosedTaskCount(fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ['task_status_events_closed', fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_status_events')
        .select('task_id')
        .eq('is_final', true)
        .gte('created_at', fromISO)
        .lt('created_at', toISO)
      if (error) throw error
      // одну и ту же задачу могли закрыть, переоткрыть и закрыть снова — считаем задачи, не события
      return new Set((data as Pick<TaskStatusEvent, 'task_id'>[]).map((e) => e.task_id)).size
    },
  })
}
