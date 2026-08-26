import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'

interface Orderable {
  id: string
  sort_order: number
}

/**
 * sections/projects/statuses are all "user-managed named list, reorderable" —
 * this factory builds the CRUD+reorder hooks once per table/name-column pair.
 */
export function createPicklistQueries<T extends Orderable>(table: string, nameColumn: string) {
  const queryKey = [table]

  function useList() {
    return useQuery({
      queryKey,
      queryFn: async () => {
        const { data, error } = await supabase.from(table).select('*').order('sort_order')
        if (error) throw error
        return data as T[]
      },
    })
  }

  function useCreate() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (name: string) => {
        const { data: existing } = await supabase
          .from(table)
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1)
        const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0
        const { error } = await supabase.from(table).insert({ [nameColumn]: name, sort_order: nextOrder })
        if (error) throw error
      },
      onSuccess: () => qc.invalidateQueries({ queryKey }),
    })
  }

  function useUpdate() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async ({ id, name }: { id: string; name: string }) => {
        const { error } = await supabase.from(table).update({ [nameColumn]: name }).eq('id', id)
        if (error) throw error
      },
      onSuccess: () => qc.invalidateQueries({ queryKey }),
    })
  }

  function useDelete() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from(table).delete().eq('id', id)
        if (error) throw error
      },
      onSuccess: () => qc.invalidateQueries({ queryKey }),
    })
  }

  function useReorder() {
    const qc = useQueryClient()
    return useMutation({
      mutationFn: async (ordered: T[]) => {
        await Promise.all(
          ordered.map((item, index) => supabase.from(table).update({ sort_order: index }).eq('id', item.id)),
        )
      },
      onSuccess: () => qc.invalidateQueries({ queryKey }),
    })
  }

  return { useList, useCreate, useUpdate, useDelete, useReorder }
}
