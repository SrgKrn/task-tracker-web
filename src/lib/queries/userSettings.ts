import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { PriorityMethod, UserSettings } from '../types'

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

/** Методика приоритизации — одна на всё приложение. До миграции 0021 поля нет — тогда «без методики». */
export function usePriorityMethod(): PriorityMethod {
  const { data } = useUserSettings()
  return data?.priority_method ?? 'none'
}

export function useSavePriorityMethod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (method: PriorityMethod) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, priority_method: method })
      if (error) throw error
    },
    onMutate: (method) =>
      qc.setQueryData<UserSettings | null>(['user_settings'], (s) => (s ? { ...s, priority_method: method } : s)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['user_settings'] }),
  })
}

/** Сохранить часть настроек: имя, фото, режим и длительности фокуса. Экран меняется сразу. */
export function useSaveSettingsPatch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (
      patch: Partial<Pick<UserSettings, 'display_name' | 'avatar_path' | 'focus_mode' | 'focus_settings'>>,
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')
      const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, ...patch })
      if (error) throw error
    },
    onMutate: (patch) => qc.setQueryData<UserSettings | null>(['user_settings'], (s) => (s ? { ...s, ...patch } : s)),
    onSettled: () => qc.invalidateQueries({ queryKey: ['user_settings'] }),
  })
}

/**
 * Применить пресет: группы, значения, этапы, норма, методика, фокус, примеры — одной
 * функцией базы. После неё меняется почти всё, поэтому перечитываем всё.
 */
export function useApplyPreset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      preset,
      options,
    }: {
      preset: unknown
      options: { examples?: boolean; settings?: boolean; stages?: boolean; onboard?: boolean }
    }) => {
      const { data, error } = await supabase.rpc('apply_preset', { p_preset: preset, p_options: options })
      if (error) throw error
      return data as { groups: number; values: number; stages: number; tasks: number }
    },
    onSettled: () => qc.invalidateQueries(),
  })
}
