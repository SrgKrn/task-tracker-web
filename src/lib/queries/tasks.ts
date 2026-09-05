import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { Task } from '../types'

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tasks').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Task[]
    },
  })
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: ['tasks', id],
    enabled: !!id,
    queryFn: async () => {
      // maybeSingle: удалённая задача возвращает null, а не ошибку — карточке нужно
      // отличать «ещё грузится» от «больше не существует», чтобы увести на список
      const { data, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return (data as Task | null) ?? null
    },
  })
}

export interface NewTaskInput {
  name: string
  project_id: string
  section_id: string
  status_id: string | null
  planned_hours: number
  start_date: string | null
  end_date: string | null
  is_daily?: boolean
  duplicated_from?: string | null
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewTaskInput) => {
      const { data, error } = await supabase.from('tasks').insert(input).select().single()
      if (error) throw error
      return data as Task
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export type TaskFieldsInput = Partial<
  Pick<
    Task,
    | 'name'
    | 'project_id'
    | 'section_id'
    | 'status_id'
    | 'planned_hours'
    | 'start_date'
    | 'end_date'
    | 'is_daily'
  >
>

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: TaskFieldsInput }) => {
      const { error } = await supabase.from('tasks').update(fields).eq('id', id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks', variables.id] })
      // смена статуса пишет событие триггером — сводка должна пересчитать «задач закрыто»
      qc.invalidateQueries({ queryKey: ['task_status_events_closed'] })
    },
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

/**
 * Копия задачи со ссылкой на оригинал: план и привязки переносятся, факт и история — нет.
 * Живёт здесь, а не в карточке, потому что дублировать можно и свайпом из списка.
 */
export function useDuplicateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (task: Task) => {
      const input: NewTaskInput = {
        name: `${task.name} (копия)`,
        project_id: task.project_id,
        section_id: task.section_id,
        status_id: task.status_id,
        planned_hours: task.planned_hours,
        start_date: task.start_date,
        end_date: task.end_date,
        is_daily: task.is_daily,
        duplicated_from: task.id,
      }
      const { data, error } = await supabase.from('tasks').insert(input).select().single()
      if (error) throw error
      return data as Task
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
