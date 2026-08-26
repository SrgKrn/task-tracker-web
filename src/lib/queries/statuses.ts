import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { Status } from '../types'
import { createPicklistQueries } from './picklist'

const statuses = createPicklistQueries<Status>('statuses', 'label')

export const useStatuses = statuses.useList
export const useCreateStatus = statuses.useCreate
export const useUpdateStatus = statuses.useUpdate
export const useDeleteStatus = statuses.useDelete
export const useReorderStatuses = statuses.useReorder

export function useSetStatusFinal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, isFinal }: { id: string; isFinal: boolean }) => {
      const { error } = await supabase.from('statuses').update({ is_final: isFinal }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['statuses'] }),
  })
}
