import type { QueryClient } from '@tanstack/react-query'
import { toDateString } from './period'
import type { ActiveTimer, Task, TimeEntry } from './types'

/**
 * Логика учёта без обращений к серверу: что показать на экране сразу после нажатия и
 * как нажатия из очереди ложатся поверх ответа сервера. Отдельно от запросов — чтобы
 * её можно было проверить тестами.
 */
export type TimerAction =
  | { kind: 'start'; userId: string; taskId: string; at: string }
  | { kind: 'stop'; userId: string; at: string; startedAt: string | null }

/** Нажатия из очереди поверх ответа сервера: без сети учёт на экране тот, что нажали. */
export function projectTimer(timer: ActiveTimer | null, actions: TimerAction[]): ActiveTimer | null {
  let t = timer
  for (const a of actions) {
    if (a.kind === 'stop') t = null
    else if (t?.task_id !== a.taskId) t = { user_id: a.userId, task_id: a.taskId, started_at: a.at }
  }
  return t
}

/** Сеть недоступна: запрос не дошёл до сервера, а не сервер отказал. */
export function isNetworkError(error: unknown, online = typeof navigator === 'undefined' || navigator.onLine): boolean {
  if (!online) return true
  const message =
    error && typeof error === 'object' && 'message' in error ? String((error as { message: unknown }).message) : String(error)
  // Chrome — «Failed to fetch», Firefox — «NetworkError…», Safari — «Load failed»
  return /Failed to fetch|NetworkError|Load failed|Network request failed/i.test(message)
}

export type CacheSnapshot = [readonly unknown[], unknown][]

/**
 * Показать результат нажатия сразу, не дожидаясь сервера: учёт в плашке и кольце, а
 * закрытая сессия — в записях дня и факте задачи. Сервер потом пришлёт точные данные.
 * Возвращает снимок кэша для отката, если сервер откажет.
 */
export function applyTimerLocally(
  qc: QueryClient,
  action: TimerAction,
  running: ActiveTimer | null | undefined,
): CacheSnapshot {
  const snapshot: CacheSnapshot = [
    ...qc.getQueriesData({ queryKey: ['active_timer'] }),
    ...qc.getQueriesData({ queryKey: ['time_entries'] }),
    ...qc.getQueriesData({ queryKey: ['time_entries_range'] }),
    ...qc.getQueriesData({ queryKey: ['tasks'] }),
  ]
  if (action.kind === 'start' && running?.task_id === action.taskId) return snapshot
  const closing = running ?? null

  if (closing) {
    const started = new Date(closing.started_at)
    const seconds = Math.max(0, Math.floor((new Date(action.at).getTime() - started.getTime()) / 1000))
    // сессия относится к дню своего начала в местном времени — как на сервере
    const day = toDateString(started)
    const entry: TimeEntry = {
      id: `pending-${action.at}`,
      user_id: closing.user_id,
      task_id: closing.task_id,
      entry_type: 'timer',
      started_at: closing.started_at,
      ended_at: action.at,
      duration_seconds: seconds,
      duration_minutes: Math.round(seconds / 60),
      note: null,
      effective_date: day,
      created_at: action.at,
    }
    qc.setQueryData<TimeEntry[]>(['time_entries', closing.task_id], (list) => (list ? [...list, entry] : list))
    for (const [key, list] of qc.getQueriesData<TimeEntry[]>({ queryKey: ['time_entries_range'] })) {
      const [, from, to] = key as [string, string, string]
      if (list && day >= from && day <= to) qc.setQueryData(key, [...list, entry])
    }
    const addFact = (t: Task) => (t.id === closing.task_id ? { ...t, fact_hours: t.fact_hours + seconds / 3600 } : t)
    for (const [key, data] of qc.getQueriesData<Task[] | Task>({ queryKey: ['tasks'] })) {
      if (Array.isArray(data)) qc.setQueryData(key, data.map(addFact))
      else if (data) qc.setQueryData(key, addFact(data))
    }
  }
  const next: ActiveTimer | null =
    action.kind === 'start' ? { user_id: action.userId, task_id: action.taskId, started_at: action.at } : null
  qc.setQueryData(['active_timer'], next)
  return snapshot
}

export function rollbackTimer(qc: QueryClient, snapshot: CacheSnapshot) {
  for (const [key, data] of snapshot) qc.setQueryData(key, data)
}
