import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toDateString } from '../period'
import { supabase } from '../supabaseClient'
import { UserError } from '../Toast'
import type { CalendarEvent, CalendarSource } from '../types'

async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('calendar', { body: { action, ...extra } })
  if (error) {
    const ctx = (error as { context?: Response }).context
    const body = ctx ? await ctx.json().catch(() => null) : null
    throw body?.error ? new UserError(body.error) : error
  }
  return data as T
}

export function useCalendarSources() {
  return useQuery({
    queryKey: ['calendar_sources'],
    queryFn: async () => {
      const { data, error } = await supabase.from('calendar_sources').select('*').order('created_at')
      if (error) throw error
      return data as CalendarSource[]
    },
  })
}

/** Встречи дня — по местной дате. */
export function useCalendarEvents(date: string) {
  return useQuery({
    queryKey: ['calendar_events', date],
    queryFn: async () => {
      const from = new Date(`${date}T00:00:00`)
      const to = new Date(from)
      to.setDate(to.getDate() + 1)
      const { data, error } = await supabase
        .from('calendar_events')
        .select('*')
        .gte('starts_at', from.toISOString())
        .lt('starts_at', to.toISOString())
        .order('starts_at')
      if (error) throw error
      return data as CalendarEvent[]
    },
    // встреча закончилась — пора предложить её засчитать
    refetchInterval: 5 * 60_000,
  })
}

function useInvalidateCalendar() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['calendar_sources'] })
    qc.invalidateQueries({ queryKey: ['calendar_events'] })
  }
}

export function useCalendarActions() {
  const invalidate = useInvalidateCalendar()
  return {
    add: useMutation({
      mutationFn: (url: string) => call<{ ok: boolean; events: number; error: string | null }>('add', { url }),
      onSuccess: invalidate,
    }),
    /** вход в Google с разрешением на календарь уже есть — снова показывать встречи */
    addGoogle: useMutation({
      mutationFn: () => call<{ ok: boolean; events: number; error: string | null }>('add_google'),
      onSuccess: invalidate,
    }),
    sync: useMutation({
      mutationFn: () => call<{ ok: boolean; events: number; errors: string[] }>('sync'),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => call('remove', { id }),
      onSuccess: invalidate,
    }),
    feed: useMutation({
      mutationFn: (reset: boolean) => call<{ url: string }>('feed', { reset }),
    }),
  }
}

/** «Планёрка 12.10 — Ромашка!» → «планерка ромашка» — так же, как на сервере */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Засчитать встречу в задачу: запись с её временем и названием в комментарии, встреча —
 * «учтена», а выбор запоминается: следующая такая же встреча предложит ту же задачу.
 */
export function useLogMeeting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ event, taskId }: { event: CalendarEvent; taskId: string }) => {
      // сначала помечаем встречу: двойное нажатие не запишет её дважды
      const { data: claimed, error: claimError } = await supabase
        .from('calendar_events')
        .update({ status: 'logged', task_id: taskId })
        .eq('id', event.id)
        .eq('status', 'new')
        .select('id')
      if (claimError) throw claimError
      if (!claimed?.length) throw new UserError('Эта встреча уже засчитана')
      const minutes = Math.round((new Date(event.ends_at).getTime() - new Date(event.starts_at).getTime()) / 60_000)
      const { data: entry, error } = await supabase
        .from('time_entries')
        .insert({
          task_id: taskId,
          entry_type: 'timer',
          started_at: event.starts_at,
          ended_at: event.ends_at,
          duration_minutes: minutes,
          note: event.title,
          effective_date: toDateString(new Date(event.starts_at)),
        })
        .select('id')
        .single()
      if (error) {
        await supabase.from('calendar_events').update({ status: 'new', task_id: null }).eq('id', event.id)
        throw error
      }
      await supabase.from('calendar_events').update({ entry_id: entry.id }).eq('id', event.id)
      const key = titleKey(event.title)
      if (key) {
        await supabase.from('calendar_rules').upsert({ title_key: key, task_id: taskId, updated_at: new Date().toISOString() })
      }
      return minutes
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar_events'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['time_entries'] })
      qc.invalidateQueries({ queryKey: ['time_entries_range'] })
    },
  })
}

/** «Не учитывать» — встреча больше не предлагается; «Вернуть» отменяет. */
export function useSetMeetingStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: 'new' | 'dismissed' }) => {
      const { error } = await supabase.from('calendar_events').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calendar_events'] }),
  })
}

export function useSetMeetingReminders() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (on: boolean) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Нужно войти заново')
      const { error } = await supabase.from('user_settings').upsert({ user_id: user.id, meeting_reminders: on })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_settings'] }),
  })
}
