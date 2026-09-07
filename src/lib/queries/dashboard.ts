import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { TaskStatusEvent, TimeEntry } from '../types'

/**
 * Записи за период [from, to] по дню, к которому они относятся (effective_date),
 * а не по моменту сохранения. Раньше фильтр шёл по created_at в UTC: работа после
 * полуночи уезжала во вчера, а правка старой задачи попадала в сегодняшний день.
 *
 * Границы — местные даты вида YYYY-MM-DD, включительно с обеих сторон.
 */
export function useTimeEntriesInRange(from: string, to: string) {
  return useQuery({
    queryKey: ['time_entries_range', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .gte('effective_date', from)
        .lte('effective_date', to)
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
