import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { UserSettings } from '../types'

export function useUserSettings() {
  return useQuery({
    queryKey: ['user_settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_settings').select('*').maybeSingle()
      if (error) throw error
      return data as UserSettings | null
    },
  })
}

export function useSaveUserSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { planned_hours_per_day: number | null; planned_hours_per_month: number | null }) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, ...input })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_settings'] }),
  })
}
