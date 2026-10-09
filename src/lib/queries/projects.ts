import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { Project } from '../types'
import { createPicklistQueries } from './picklist'

const projects = createPicklistQueries<Project>('projects', 'name')

export const useProjects = projects.useList
export const useCreateProject = projects.useCreate
export const useUpdateProject = projects.useUpdate
export const useDeleteProject = projects.useDelete
export const useReorderProjects = projects.useReorder
export const useSetProjectArchived = projects.useSetArchived

export function useUpdateProjectDescription() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, description }: { id: string; description: string }) => {
      const { error } = await supabase.from('projects').update({ description }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}
