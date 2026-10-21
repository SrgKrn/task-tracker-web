import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'

/**
 * «Написать нам» и админка (0.41). Обращения пользователь видит только свои (RLS), админ —
 * все. Данные всех пользователей админка берёт только через функции admin_* — каждая
 * проверяет роль в базе.
 */

export type FeedbackKind = 'idea' | 'bug' | 'review' | 'other'
export type FeedbackStatus = 'new' | 'in_progress' | 'done' | 'declined'

export interface Feedback {
  id: string
  user_id: string
  kind: FeedbackKind
  rating: number | null
  body: string
  screenshots: string[]
  app_version: string | null
  device: string | null
  plan: string | null
  status: FeedbackStatus
  reply: string | null
  replied_at: string | null
  reply_seen_at: string | null
  created_at: string
  updated_at: string
}

export const KIND_LABEL: Record<FeedbackKind, string> = {
  idea: 'Идея',
  bug: 'Ошибка',
  review: 'Отзыв',
  other: 'Другое',
}

export const STATUS_LABEL: Record<FeedbackStatus, string> = {
  new: 'Получено',
  in_progress: 'В работе',
  done: 'Сделано',
  declined: 'Не будем делать',
}

const BUCKET = 'feedback'

/** версия приложения из сборки; без неё (старый сервер разработки) — «dev», а не падение */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'
export const MAX_SCREENSHOTS = 3

/** «iPhone · приложение», «Windows · браузер» — без полной строки браузера */
export function deviceLabel(): string {
  const ua = navigator.userAgent
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad|Macintosh.*Mobile/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : 'Linux'
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
  return `${os} · ${standalone ? 'приложение' : 'браузер'}`
}

export function useIsAdmin() {
  return useQuery({
    queryKey: ['is_admin'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_admin')
      // до миграции функции нет — просто не админ
      if (error) return false
      return data === true
    },
  })
}

export function useMyFeedback() {
  return useQuery({
    queryKey: ['feedback', 'mine'],
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .eq('user_id', auth.user?.id ?? '')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Feedback[]
    },
  })
}

/** ответов, которые человек ещё не открыл, — для отметки в профиле */
export function useUnreadReplies(): number {
  const { data = [] } = useMyFeedback()
  return data.filter((f) => f.reply && !f.reply_seen_at).length
}

export function useSendFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { kind: FeedbackKind; rating: number | null; body: string; files: File[] }) => {
      const { data: auth } = await supabase.auth.getUser()
      const uid = auth.user?.id
      if (!uid) throw new Error('Войдите в аккаунт')
      const paths: string[] = []
      for (const file of input.files.slice(0, MAX_SCREENSHOTS)) {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png'
        const path = `${uid}/${crypto.randomUUID()}.${ext}`
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined })
        if (error) throw error
        paths.push(path)
      }
      const { data, error } = await supabase
        .from('feedback')
        .insert({
          kind: input.kind,
          rating: input.kind === 'review' ? input.rating : null,
          body: input.body.trim(),
          screenshots: paths,
          app_version: APP_VERSION,
          device: deviceLabel(),
        })
        .select()
        .single()
      if (error) throw error
      // уведомление админу — не повод считать отправку неудачной
      supabase.functions.invoke('feedback', { body: { action: 'submitted', id: data.id } }).catch(() => undefined)
      return data as Feedback
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

export function useMarkRepliesSeen() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) await supabase.rpc('feedback_seen', { p_id: id })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

/** временные ссылки на скриншоты из закрытого бакета */
export function useScreenshotUrls(paths: string[]) {
  return useQuery({
    queryKey: ['feedback-shots', paths],
    enabled: paths.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      if (error) throw error
      return (data ?? []).map((d) => d.signedUrl).filter(Boolean) as string[]
    },
  })
}

/* ── админка ─────────────────────────────────────────────────────────── */

export function useAllFeedback(enabled: boolean) {
  return useQuery({
    queryKey: ['feedback', 'all'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('feedback').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return data as Feedback[]
    },
  })
}

export function useUpdateFeedback() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status, reply }: { id: string; status?: FeedbackStatus; reply?: string | null }) => {
      const fields: Partial<Feedback> = {}
      if (status) fields.status = status
      if (reply !== undefined) fields.reply = reply
      const { error } = await supabase.from('feedback').update(fields).eq('id', id)
      if (error) throw error
      // новый ответ — автору пуш и Telegram; без них ответ всё равно виден в приложении
      if (reply) {
        const { data } = await supabase.functions.invoke('feedback', { body: { action: 'replied', id } })
        return data as { push?: number; telegram?: boolean } | null
      }
      return null
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  })
}

export interface AdminUser {
  id: string
  email: string
  name: string | null
  created_at: string
  last_active: string | null
  last_seen_version: string | null
  last_seen_device: string | null
  plan: string
  effective: string
  paid_until: string | null
  trial: boolean
  trial_used: boolean
  workspaces: number
  tasks: number
  hours: number
  hours_30d: number
  feedback: number
  telegram: boolean
  google: boolean
  push: boolean
}

export function useAdminUsers(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'users'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_users')
      if (error) throw error
      return (data ?? []) as AdminUser[]
    },
  })
}

export interface AdminStats {
  users: number
  new_7d: number
  new_30d: number
  active_1d: number
  active_7d: number
  active_30d: number
  hours_7d: number
  entries_7d: number
  tasks_7d: number
  feedback_new: number
  rating_avg: number | null
  plans: Record<string, number>
  presets: Record<string, number>
  features: Record<string, number>
  signups_by_week: { week: string; n: number }[]
}

export function useAdminStats(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'stats'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_stats')
      if (error) throw error
      return data as AdminStats
    },
  })
}

export interface AdminSystem {
  cron: { job: string; schedule: string; last_run: string | null; last_status: string | null; runs_24h: number; failed_24h: number }[]
  http_24h: { total: number; failed: number }
  versions: { version: string; users: number; last: string | null }[]
  storage_mb: Record<string, number> | null
}

export function useAdminSystem(enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'system'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_system')
      if (error) throw error
      return data as AdminSystem
    },
  })
}

export function useAdminSetPlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { user: string; plan: string; days: number | null }) => {
      const { error } = await supabase.rpc('admin_set_plan', { p_user: input.user, p_plan: input.plan, p_days: input.days })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

export function useAdminResetTrial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (user: string) => {
      const { error } = await supabase.rpc('admin_reset_trial', { p_user: user })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }),
  })
}

/** отметка «открывал приложение» — раз за запуск, ошибки не важны */
let seenSent = false
export function reportAppSeen() {
  if (seenSent) return
  seenSent = true
  // отметка — украшение для админки: её сбой никогда не должен ронять приложение
  try {
    supabase.rpc('app_seen', { p_version: APP_VERSION, p_device: deviceLabel() }).then(
      () => undefined,
      () => undefined,
    )
  } catch {
    // ничего: отметка просто не уйдёт
  }
}
