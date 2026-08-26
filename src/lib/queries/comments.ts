import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { Comment } from '../types'

export function useComments(taskId: string | undefined) {
  return useQuery({
    queryKey: ['comments', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at')
      if (error) throw error
      return data as Comment[]
    },
  })
}

export function useAddComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, body }: { taskId: string; body: string }) => {
      const { error } = await supabase.from('comments').insert({ task_id: taskId, body })
      if (error) throw error
    },
    onSuccess: (_data, variables) => qc.invalidateQueries({ queryKey: ['comments', variables.taskId] }),
  })
}
