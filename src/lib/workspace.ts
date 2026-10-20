import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { supabase } from './supabaseClient'
import type { Workspace } from './types'

/**
 * Рабочие пространства. Активное — своё на каждом устройстве (на телефоне «Спорт», на
 * ноутбуке «Работа»): хранится в localStorage, а запросы задач, групп, этапов и учёта
 * читают его прямо в момент запроса. Смена пространства сбрасывает эти запросы — ключи
 * кэша остались прежними (['tasks'] и т.д.), и вся логика мгновенных правок работает как была.
 */

const KEY = 'semternity.workspace'
let active: string | null = load()
const listeners = new Set<() => void>()

function load(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** id активного пространства. До выбора (первый запуск) — пустая строка: запрос вернёт пусто. */
export function activeWorkspaceId(): string {
  return active ?? ''
}

function setActive(id: string) {
  active = id
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // приватный режим — пространство просто не запомнится на этом устройстве
  }
  for (const l of listeners) l()
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useActiveWorkspaceId(): string {
  return useSyncExternalStore(subscribe, activeWorkspaceId, activeWorkspaceId)
}

/** запросы, которые от пространства не зависят: их при смене не сбрасываем */
const GLOBAL_KEYS = new Set([
  'workspaces',
  'user_settings',
  'active_timer',
  'focus_run',
  'focus_sessions',
  'avatar_url',
  'telegram',
  'telegram_status',
  'google_status',
  'calendar_sources',
  'telegram_link',
  'push',
])

/** Перейти в пространство: всё, что зависит от него, перечитается. */
export function switchWorkspace(id: string, qc: QueryClient) {
  if (id === active) return
  setActive(id)
  void qc.resetQueries({ predicate: (q) => !GLOBAL_KEYS.has(String(q.queryKey[0])) })
}

/** Выбрать стартовое пространство: запомненное, если оно ещё есть, иначе основное. */
export function pickInitialWorkspace(list: Workspace[]): string | null {
  if (list.length === 0) return null
  const saved = active && list.find((w) => w.id === active)
  const id = saved ? saved.id : (list.find((w) => w.is_default) ?? list[0]).id
  if (id !== active) setActive(id)
  return id
}

export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase.from('workspaces').select('*').order('sort_order').order('created_at')
      if (error) throw error
      return data as Workspace[]
    },
  })
}

/** Активное пространство целиком: норма, методика, фокус — отсюда. */
export function useActiveWorkspace(): Workspace | undefined {
  const id = useActiveWorkspaceId()
  const { data } = useWorkspaces()
  return data?.find((w) => w.id === id) ?? data?.find((w) => w.is_default)
}

export type WorkspaceFields = Partial<
  Pick<
    Workspace,
    | 'name'
    | 'color'
    | 'sort_order'
    | 'planned_hours_per_day'
    | 'planned_hours_per_month'
    | 'work_days_per_week'
    | 'priority_method'
    | 'focus_mode'
    | 'focus_settings'
  >
>

/** Правка пространства: экран меняется сразу, отказ возвращает прежнее. */
export function useUpdateWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: WorkspaceFields }) => {
      const { error } = await supabase.from('workspaces').update(fields).eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, fields }) => {
      await qc.cancelQueries({ queryKey: ['workspaces'] })
      const list = qc.getQueryData<Workspace[]>(['workspaces'])
      if (list) qc.setQueryData<Workspace[]>(['workspaces'], list.map((w) => (w.id === id ? { ...w, ...fields } : w)))
      return { list }
    },
    onError: (_e, _v, snapshot) => {
      if (snapshot?.list) qc.setQueryData(['workspaces'], snapshot.list)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['workspaces'] })
      // настройки основного копируются в профиль — их читают и экраны профиля
      qc.invalidateQueries({ queryKey: ['user_settings'] })
    },
  })
}

/** Правка активного пространства — для экранов нормы, методики и фокуса. */
export function useUpdateActiveWorkspace() {
  const update = useUpdateWorkspace()
  return {
    isPending: update.isPending,
    mutate: (fields: WorkspaceFields, options?: { onError?: (e: unknown) => void; onSuccess?: () => void }) =>
      update.mutate({ id: activeWorkspaceId(), fields }, options),
  }
}

/**
 * Удалить пространство: файлы из хранилища — здесь (база их не удалит), остальное —
 * функцией базы по порядку. Основное удалить нельзя.
 */
export function useDeleteWorkspace() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ws: Workspace) => {
      const { data: files, error: filesError } = await supabase.from('attachments').select('path').eq('workspace_id', ws.id)
      if (filesError) throw filesError
      const paths = (files ?? []).map((f: { path: string | null }) => f.path).filter((p): p is string => !!p)
      for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('attachments').remove(paths.slice(i, i + 100))
      const { error } = await supabase.rpc('delete_workspace', { p_workspace: ws.id })
      if (error) throw error
    },
    onSuccess: async (_d, ws) => {
      const list = (qc.getQueryData<Workspace[]>(['workspaces']) ?? []).filter((w) => w.id !== ws.id)
      qc.setQueryData(['workspaces'], list)
      if (active === ws.id) {
        const next = list.find((w) => w.is_default) ?? list[0]
        if (next) switchWorkspace(next.id, qc)
      }
      await qc.invalidateQueries({ queryKey: ['workspaces'] })
    },
  })
}

/** Название пространства задачи, если она не из текущего — для плашки учёта. */
export function useOtherWorkspace(workspaceId: string | undefined): Workspace | undefined {
  const activeId = useActiveWorkspaceId()
  const { data: list = [] } = useWorkspaces()
  if (!workspaceId || workspaceId === activeId) return undefined
  return list.find((w) => w.id === workspaceId)
}
