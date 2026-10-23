import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { timeZone } from '../timerQueue'
import { addDays, todayStr } from '../period'
import type { FocusMode, FocusPhase, FocusRun, FocusSession } from '../types'
import { focusSettingsOf } from '../focus'
import { useActiveWorkspace } from '../workspace'

/** Идущая фокус-сессия; null — фокус не запущен. До миграции 0022 таблицы нет — тоже null. */
export function useFocusRun() {
  return useQuery({
    queryKey: ['focus_run'],
    queryFn: async () => {
      const { data, error } = await supabase.from('focus_runs').select('*').maybeSingle()
      if (error) return null
      return (data as FocusRun | null) ?? null
    },
    refetchOnWindowFocus: true,
  })
}

/** Рабочие отрезки за день — «pomodoro сегодня». */
export function useFocusSessions(day = todayStr()) {
  return useQuery({
    queryKey: ['focus_sessions', day],
    queryFn: async () => {
      const from = new Date(`${day}T00:00:00`).toISOString()
      const to = new Date(`${addDays(day, 1)}T00:00:00`).toISOString()
      const { data, error } = await supabase
        .from('focus_sessions')
        .select('id, task_id, mode, started_at, ended_at, completed')
        .gte('started_at', from)
        .lt('started_at', to)
        .order('started_at')
      if (error) return []
      return data as FocusSession[]
    },
  })
}

function invalidateFocus(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['focus_run'] })
  qc.invalidateQueries({ queryKey: ['focus_sessions'] })
  qc.invalidateQueries({ queryKey: ['active_timer'] })
  qc.invalidateQueries({ queryKey: ['tasks'] })
  qc.invalidateQueries({ queryKey: ['time_entries'] })
  qc.invalidateQueries({ queryKey: ['time_entries_range'] })
}

type FocusAction =
  | { kind: 'start'; taskId: string; mode: FocusMode; plan: FocusPhase[] }
  | { kind: 'pause' }
  | { kind: 'resume'; taskId?: string }
  | { kind: 'skip' }
  | { kind: 'stop' }
  /** сменить задачу фокуса, не трогая отрезок (на паузе, в перерыве, в ожидании) */
  | { kind: 'task'; taskId: string }

/** Кнопки фокуса — каждая одной функцией базы: учёт и отрезок меняются вместе. */
export function useFocusAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: FocusAction) => {
      const tz = timeZone()
      if (a.kind === 'task') {
        const { error } = await supabase.from('focus_runs').update({ task_id: a.taskId }).not('user_id', 'is', null)
        if (error) throw error
        return
      }
      const { error } =
        a.kind === 'start'
          ? await supabase.rpc('focus_start', { p_task_id: a.taskId, p_mode: a.mode, p_plan: a.plan, p_tz: tz })
          : a.kind === 'resume'
            ? await supabase.rpc('focus_resume', { p_tz: tz, p_task_id: a.taskId ?? null })
            : await supabase.rpc(`focus_${a.kind}`, { p_tz: tz })
      if (error) throw error
    },
    onSettled: () => invalidateFocus(qc),
  })
}

export interface FocusTransition {
  ended_kind: FocusPhase['kind']
  next_kind: FocusPhase['kind']
  next_seconds: number
}

/**
 * Довести свою сессию до текущего момента: отрезок кончился — база закрывает учёт ровно
 * в его конце и ставит следующий. Возвращает переход, чтобы приложение подало сигнал.
 */
export async function advanceFocus(qc: QueryClient): Promise<FocusTransition | null> {
  const { data, error } = await supabase.rpc('focus_advance')
  if (error) throw error
  invalidateFocus(qc)
  const rows = (data ?? []) as FocusTransition[]
  return rows[0] ?? null
}

/** Режим фокуса активного пространства; до миграции — Pomodoro. */
export function useFocusPrefs() {
  const ws = useActiveWorkspace()
  return { mode: (ws?.focus_mode ?? 'pomodoro') as FocusMode, settings: focusSettingsOf(ws?.focus_settings) }
}
