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
    mutationFn: async (input: {
      planned_hours_per_day: number | null
      planned_hours_per_month: number | null
      work_days_per_week: number
    }) => {
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

/** Отметить, что историю изменений этой версии пользователь видел — на всех его устройствах. */
export function useMarkReleaseSeen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (version: string) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, seen_release: version })
      if (error) throw error
    },
    onMutate: (version) =>
      qc.setQueryData<UserSettings | null>(['user_settings'], (s) => (s ? { ...s, seen_release: version } : s)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['user_settings'] }),
  })
}

/** Папка Google Диска, куда ложатся отчёты. */
export function useSaveDriveReportsFolder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (folder: { id: string; name: string } | null) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('user_settings').upsert({
        user_id: user.id,
        drive_reports_folder_id: folder?.id ?? null,
        drive_reports_folder_name: folder?.name ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_settings'] }),
  })
}

/** Блок «Время»: показывать ли его и в каком поясе считать дни. Блок дня пересчитается. */
export function useSaveTimeBlockSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: Partial<Pick<UserSettings, 'show_time_block' | 'timezone'>>) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, ...input })
      if (error) throw error
    },
    onMutate: (input) =>
      qc.setQueryData<UserSettings | null>(['user_settings'], (s) => (s ? { ...s, ...input } : s)),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['user_settings'] })
      qc.invalidateQueries({ queryKey: ['day_insight'] })
    },
  })
}
