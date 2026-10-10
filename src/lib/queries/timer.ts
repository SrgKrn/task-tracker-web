import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toDateString } from '../period'
import { supabase } from '../supabaseClient'
import type { ActiveTimer, TimeEntry } from '../types'

export function useTimeEntries(taskId: string | undefined) {
  return useQuery({
    queryKey: ['time_entries', taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at')
      if (error) throw error
      return data as TimeEntry[]
    },
  })
}

export function useActiveTimer() {
  return useQuery({
    queryKey: ['active_timer'],
    queryFn: async () => {
      const { data, error } = await supabase.from('active_timers').select('*').maybeSingle()
      if (error) throw error
      return data as ActiveTimer | null
    },
    // the display tick lives in the component; this just needs to stay fresh across screens
    refetchOnWindowFocus: true,
  })
}

/** Stops whatever timer is currently running (if any) by logging its elapsed time. */
async function stopRunningTimer(current: ActiveTimer) {
  const startedAt = new Date(current.started_at)
  const endedAt = new Date()
  const durationMinutes = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000))

  const { error: insertError } = await supabase.from('time_entries').insert({
    task_id: current.task_id,
    entry_type: 'timer',
    started_at: current.started_at,
    ended_at: endedAt.toISOString(),
    duration_minutes: durationMinutes,
    // сеанс относится к дню, когда его начали, в местном времени: смена, начатая
    // в 23:40 и остановленная в 00:20, целиком принадлежит вчерашнему дню
    effective_date: toDateString(startedAt),
  })
  if (insertError) throw insertError

  const { error: deleteError } = await supabase.from('active_timers').delete().eq('user_id', current.user_id)
  if (deleteError) throw deleteError
}

export function useStartTimer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (taskId: string) => {
      const { data: current, error } = await supabase.from('active_timers').select('*').maybeSingle()
      if (error) throw error
      if (current) {
        if (current.task_id === taskId) return // already tracking this task
        await stopRunningTimer(current as ActiveTimer)
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not signed in')

      const { error: upsertError } = await supabase
        .from('active_timers')
        .upsert({ user_id: user.id, task_id: taskId, started_at: new Date().toISOString(), reminded_hours: 0 })
      if (upsertError) throw upsertError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active_timer'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['time_entries'] })
    },
  })
}

export function useStopTimer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data: current, error } = await supabase.from('active_timers').select('*').maybeSingle()
      if (error) throw error
      if (!current) return
      await stopRunningTimer(current as ActiveTimer)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active_timer'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['time_entries'] })
    },
  })
}

export function useAdjustFactHours() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      taskId,
      currentFactHours,
      newFactHours,
      effectiveDate,
    }: {
      taskId: string
      currentFactHours: number
      newFactHours: number
      /** день, к которому относится правка; по умолчанию — сегодня */
      effectiveDate?: string
    }) => {
      const deltaMinutes = Math.round((newFactHours - currentFactHours) * 60)
      if (deltaMinutes === 0) return
      const { error } = await supabase.from('time_entries').insert({
        task_id: taskId,
        entry_type: 'manual_adjustment',
        duration_minutes: deltaMinutes,
        // комментарий к правке пишет сам пользователь — по нажатию на неё в таймлайне
        note: null,
        effective_date: effectiveDate ?? toDateString(new Date()),
      })
      if (error) throw error
    },
    // кольцо «Сегодня» и сводка считаются по записям за период — их тоже надо перечитать
    onSuccess: (_data, variables) => invalidateTime(qc, variables.taskId),
  })
}

/** всё, что зависит от записей времени: карточка, списки, кольцо «Сегодня», сводка */
function invalidateTime(qc: ReturnType<typeof useQueryClient>, taskId?: string) {
  qc.invalidateQueries({ queryKey: ['tasks'] })
  if (taskId) qc.invalidateQueries({ queryKey: ['tasks', taskId] })
  qc.invalidateQueries({ queryKey: ['time_entries'] })
  qc.invalidateQueries({ queryKey: ['time_entries_range'] })
}

/**
 * Укорачивает уже записанную сессию таймера — конец сдвигается раньше. Так исправляют
 * забытый таймер: минуты уходят из того дня, когда сессия шла, а не из дня правки.
 * `minutes` отрицательное — вернуть сессии длину (отмена).
 */
export function useTrimSession() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ entry, minutes }: { entry: TimeEntry; minutes: number }) => {
      const nextDuration = entry.duration_minutes - minutes
      if (nextDuration < 0) throw new Error('Сессия короче, чем нужно отнять')
      const endedAt = entry.ended_at
        ? new Date(new Date(entry.ended_at).getTime() - minutes * 60_000).toISOString()
        : null
      const { error } = await supabase
        .from('time_entries')
        .update({ duration_minutes: nextDuration, ended_at: endedAt })
        .eq('id', entry.id)
      if (error) throw error
    },
    onSuccess: (_d, v) => invalidateTime(qc, v.entry.task_id),
  })
}

/** Отнимает минуты у идущей сессии: начало таймера сдвигается позже. */
export function useShiftActiveTimer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ timer, minutes }: { timer: ActiveTimer; minutes: number }) => {
      const startedAt = new Date(new Date(timer.started_at).getTime() + minutes * 60_000)
      if (startedAt.getTime() > Date.now()) throw new Error('Идущая сессия короче, чем нужно отнять')
      const { error } = await supabase
        .from('active_timers')
        .update({ started_at: startedAt.toISOString() })
        .eq('user_id', timer.user_id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active_timer'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}

/** Комментарий к конкретной сессии учёта или правке — пустая строка его убирает. */
export function useSetEntryNote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ entry, note }: { entry: TimeEntry; note: string }) => {
      const { error } = await supabase
        .from('time_entries')
        .update({ note: note.trim() || null })
        .eq('id', entry.id)
      if (error) throw error
    },
    // заметка видна сразу, не дожидаясь сервера
    onMutate: ({ entry, note }) =>
      qc.setQueryData<TimeEntry[]>(['time_entries', entry.task_id], (list) =>
        list?.map((e) => (e.id === entry.id ? { ...e, note: note.trim() || null } : e)),
      ),
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: ['time_entries', v.entry.task_id] })
      qc.invalidateQueries({ queryKey: ['item_activity'] })
    },
  })
}
