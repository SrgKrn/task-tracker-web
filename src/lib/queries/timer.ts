import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toDateString } from '../period'
import { applyTimerLocally, projectTimer, rollbackTimer } from '../timerLogic'
import { supabase } from '../supabaseClient'
import {
  enqueueTimerAction,
  flushTimerQueue,
  isNetworkError,
  pendingTimerActions,
  sendTimerAction,
  type TimerAction,
} from '../timerQueue'
import { entrySeconds } from '../time'
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

async function currentUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Нужно войти заново')
  return session.user.id
}

export function useActiveTimer() {
  return useQuery({
    queryKey: ['active_timer'],
    queryFn: async () => {
      const { data, error } = await supabase.from('active_timers').select('*').maybeSingle()
      if (error) throw error
      const timer = data as ActiveTimer | null
      const userId = timer?.user_id ?? (await currentUserId().catch(() => undefined))
      return projectTimer(timer, userId ? pendingTimerActions(userId) : [])
    },
    // the display tick lives in the component; this just needs to stay fresh across screens
    refetchOnWindowFocus: true,
  })
}

function invalidateTimer(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ['active_timer'] })
  qc.invalidateQueries({ queryKey: ['tasks'] })
  qc.invalidateQueries({ queryKey: ['time_entries'] })
  qc.invalidateQueries({ queryKey: ['time_entries_range'] })
}

/**
 * Отправить нажатие: сразу, если сеть есть и очередь пуста, иначе — в очередь. Обрыв сети
 * посреди запроса тоже кладёт нажатие в очередь: на экране учёт уже показан.
 * `queued` — нажатие ждёт сети.
 */
async function dispatch(action: TimerAction): Promise<{ queued: boolean }> {
  if (!navigator.onLine || pendingTimerActions().length > 0) {
    enqueueTimerAction(action)
    void flushTimerQueue()
    return { queued: true }
  }
  try {
    await sendTimerAction(action)
    return { queued: false }
  } catch (e) {
    if (!isNetworkError(e)) throw e
    enqueueTimerAction(action)
    return { queued: true }
  }
}

type MutateOptions = { onError?: (error: unknown) => void; onSuccess?: () => void }

function useTimerMutation() {
  const qc = useQueryClient()
  return useMutation({
    // без сети нажатие тоже должно сработать — оно ляжет в очередь
    networkMode: 'always',
    mutationFn: (action: TimerAction) => dispatch(action),
    onMutate: async (action) => {
      await qc.cancelQueries({ queryKey: ['active_timer'] })
      return applyTimerLocally(qc, action, qc.getQueryData<ActiveTimer | null>(['active_timer']))
    },
    onError: (_e, _action, snapshot) => {
      if (snapshot) rollbackTimer(qc, snapshot)
    },
    onSettled: (result) => {
      // пока нажатие в очереди, сервер ещё не знает о нём — оставляем то, что на экране
      if (!result?.queued) invalidateTimer(qc)
    },
  })
}

/** Начать учёт по задаче; идущий по другой задаче закрывается тем же запросом. */
export function useStartTimer() {
  const m = useTimerMutation()
  return {
    isPending: m.isPending,
    mutate: (taskId: string, options?: MutateOptions) => {
      void currentUserId().then(
        (userId) => m.mutate({ kind: 'start', userId, taskId, at: new Date().toISOString() }, options),
        options?.onError,
      )
    },
  }
}

/** Остановить идущий учёт. */
export function useStopTimer() {
  const qc = useQueryClient()
  const m = useTimerMutation()
  return {
    isPending: m.isPending,
    mutate: (_?: undefined, options?: MutateOptions) => {
      const running = qc.getQueryData<ActiveTimer | null>(['active_timer'])
      void currentUserId().then(
        (userId) =>
          m.mutate({ kind: 'stop', userId, at: new Date().toISOString(), startedAt: running?.started_at ?? null }, options),
        options?.onError,
      )
    },
  }
}

/**
 * Отправить очередь, когда вернулась сеть или открыли приложение. После отправки —
 * перечитать учёт и записи: на экране окажется то, что записал сервер.
 */
export function useTimerQueueSync(onFailed: (messages: string[]) => void) {
  const qc = useQueryClient()
  return async () => {
    if (!pendingTimerActions().length) return
    const { sent, failed } = await flushTimerQueue()
    if (sent || failed.length) invalidateTimer(qc)
    if (failed.length) onFailed(failed)
  }
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
        duration_seconds: deltaMinutes * 60,
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
      const nextSeconds = entrySeconds(entry) - minutes * 60
      if (nextSeconds < 0) throw new Error('Сессия короче, чем нужно отнять')
      const endedAt = entry.ended_at
        ? new Date(new Date(entry.ended_at).getTime() - minutes * 60_000).toISOString()
        : null
      const { error } = await supabase
        .from('time_entries')
        .update({ duration_seconds: nextSeconds, ended_at: endedAt })
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
