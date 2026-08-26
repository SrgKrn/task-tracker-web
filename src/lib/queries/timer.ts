import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { ActiveTimer } from '../types'

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
        .upsert({ user_id: user.id, task_id: taskId, started_at: new Date().toISOString() })
      if (upsertError) throw upsertError
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['active_timer'] })
      qc.invalidateQueries({ queryKey: ['tasks'] })
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
    }: {
      taskId: string
      currentFactHours: number
      newFactHours: number
    }) => {
      const deltaMinutes = Math.round((newFactHours - currentFactHours) * 60)
      if (deltaMinutes === 0) return
      const { error } = await supabase.from('time_entries').insert({
        task_id: taskId,
        entry_type: 'manual_adjustment',
        duration_minutes: deltaMinutes,
        note: 'Manual correction',
      })
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks', variables.taskId] })
    },
  })
}
