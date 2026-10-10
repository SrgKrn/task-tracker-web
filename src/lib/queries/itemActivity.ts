import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { Comment, TaskStatusEvent, TimeEntry } from '../types'

export interface ItemActivity {
  entries: TimeEntry[]
  comments: Comment[]
  statusEvents: TaskStatusEvent[]
}

/**
 * Всё, что происходило в задачах значения группы начиная с `since`: записи времени, комментарии,
 * смены статуса. Файлы и создание задач карточка берёт из уже загруженных списков.
 */
export function useItemActivity(itemId: string | undefined, taskIds: string[], since: string) {
  return useQuery({
    queryKey: ['item_activity', itemId, since, taskIds.length],
    enabled: !!itemId && taskIds.length > 0,
    queryFn: async (): Promise<ItemActivity> => {
      const sinceIso = new Date(`${since}T00:00:00`).toISOString()
      const [entries, comments, events] = await Promise.all([
        supabase
          .from('time_entries')
          .select('*')
          .in('task_id', taskIds)
          .gte('effective_date', since)
          .order('effective_date', { ascending: false })
          .limit(2000),
        supabase
          .from('comments')
          .select('*')
          .in('task_id', taskIds)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false }),
        supabase
          .from('task_status_events')
          .select('*')
          .in('task_id', taskIds)
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false }),
      ])
      if (entries.error) throw entries.error
      if (comments.error) throw comments.error
      if (events.error) throw events.error
      return {
        entries: entries.data as TimeEntry[],
        comments: comments.data as Comment[],
        statusEvents: events.data as TaskStatusEvent[],
      }
    },
  })
}
