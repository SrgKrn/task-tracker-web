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

export function useUpdateComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ comment, body }: { comment: Comment; body: string }) => {
      const { error } = await supabase.from('comments').update({ body }).eq('id', comment.id)
      if (error) throw error
    },
    onMutate: ({ comment, body }) =>
      qc.setQueryData<Comment[]>(['comments', comment.task_id], (list) =>
        list?.map((c) => (c.id === comment.id ? { ...c, body } : c)),
      ),
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['comments', v.comment.task_id] })
      qc.invalidateQueries({ queryKey: ['item_activity'] })
    },
  })
}

/** Удалить комментарий; «Вернуть» кладёт его обратно с прежним временем. */
export function useDeleteComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (comment: Comment) => {
      const { error } = await supabase.from('comments').delete().eq('id', comment.id)
      if (error) throw error
    },
    onMutate: (comment) =>
      qc.setQueryData<Comment[]>(['comments', comment.task_id], (list) => list?.filter((c) => c.id !== comment.id)),
    onSettled: (_d, _e, comment) => {
      qc.invalidateQueries({ queryKey: ['comments', comment.task_id] })
      qc.invalidateQueries({ queryKey: ['item_activity'] })
    },
  })
}

export function useRestoreComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (comment: Comment) => {
      const { error } = await supabase
        .from('comments')
        .insert({ id: comment.id, task_id: comment.task_id, body: comment.body, created_at: comment.created_at })
      if (error) throw error
    },
    onSettled: (_d, _e, comment) => {
      qc.invalidateQueries({ queryKey: ['comments', comment.task_id] })
      qc.invalidateQueries({ queryKey: ['item_activity'] })
    },
  })
}
