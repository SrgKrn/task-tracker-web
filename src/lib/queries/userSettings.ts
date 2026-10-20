import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { PriorityMethod, UserSettings } from '../types'
import { useActiveWorkspace, useUpdateActiveWorkspace } from '../workspace'

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

/** Плитка дня: показывать ли её (на «Сегодня» и в «Итогах дня») и в каком поясе считать дни. */
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
    onSettled: () => qc.invalidateQueries({ queryKey: ['user_settings'] }),
  })
}

/** Методика приоритизации — своя в каждом пространстве. До миграции — «без методики». */
export function usePriorityMethod(): PriorityMethod {
  return useActiveWorkspace()?.priority_method ?? 'none'
}

export function useSavePriorityMethod() {
  const update = useUpdateActiveWorkspace()
  return {
    isPending: update.isPending,
    mutate: (method: PriorityMethod, options?: { onError?: (e: unknown) => void; onSuccess?: () => void }) =>
      update.mutate({ priority_method: method }, options),
  }
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
      workspace,
    }: {
      preset: unknown
      options: { examples?: boolean; settings?: boolean; stages?: boolean; onboard?: boolean; name?: string; code?: string; color?: string }
      /** куда применить; null — создать новое пространство (название — options.name) */
      workspace: string | null
    }) => {
      const { data, error } = await supabase.rpc('apply_preset', { p_preset: preset, p_options: options, p_workspace: workspace })
      if (error) throw error
      return data as { workspace: string; groups: number; values: number; stages: number; tasks: number }
    },
    onSettled: () => qc.invalidateQueries(),
  })
}
