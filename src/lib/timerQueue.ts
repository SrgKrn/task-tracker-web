import { useSyncExternalStore } from 'react'
import { supabase } from './supabaseClient'
import { isNetworkError, type TimerAction } from './timerLogic'

export { isNetworkError, type TimerAction }

/*
 * Очередь старта и остановки учёта без сети. Нажатие записывается с моментом, когда его
 * сделали, и уходит на сервер, как только вернётся связь: учёт не теряется в метро и в
 * лифте. Очередь лежит в localStorage — переживает и закрытие приложения.
 */

/** Что вернул сервер: какой учёт идёт и какую сессию закрыли. */
export interface TimerResult {
  started_at?: string
  task_id?: string
  stopped: { task_id: string; seconds: number; entry_id: string } | null
  stale?: boolean
}

const KEY = 'semternity:timer-queue'
const listeners = new Set<() => void>()
let snapshot: TimerAction[] = read()

function read(): TimerAction[] {
  try {
    const raw = localStorage.getItem(KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function write(list: TimerAction[]) {
  snapshot = list
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list))
    else localStorage.removeItem(KEY)
  } catch {
    // хранилище недоступно (приватный режим) — очередь живёт до перезагрузки
  }
  listeners.forEach((l) => l())
}

export function pendingTimerActions(userId?: string): TimerAction[] {
  return userId ? snapshot.filter((a) => a.userId === userId) : snapshot
}

export function enqueueTimerAction(action: TimerAction) {
  write([...snapshot, action])
}

export const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export async function sendTimerAction(action: TimerAction): Promise<TimerResult> {
  const { data, error } =
    action.kind === 'start'
      ? await supabase.rpc('timer_start', { p_task_id: action.taskId, p_at: action.at, p_tz: timeZone() })
      : await supabase.rpc('timer_stop', { p_at: action.at, p_tz: timeZone(), p_started_at: action.startedAt })
  if (error) throw error
  return data as TimerResult
}

let flushing: Promise<{ sent: number; failed: string[] }> | null = null

/**
 * Отправить очередь по порядку. Обрыв сети — остановиться и подождать следующей попытки;
 * отказ сервера (задачу удалили) — выбросить действие и сообщить.
 */
export function flushTimerQueue(): Promise<{ sent: number; failed: string[] }> {
  if (flushing) return flushing
  // без сети не пробуем: очередь отправится по событию online
  if (!navigator.onLine) return Promise.resolve({ sent: 0, failed: [] })
  flushing = (async () => {
    let sent = 0
    const failed: string[] = []
    const {
      data: { session },
    } = await supabase.auth.getSession()
    // действия другого аккаунта (вышли и вошли под другим) не отправляются никогда
    if (session) write(snapshot.filter((a) => a.userId === session.user.id))
    while (session && snapshot.length) {
      const [head] = snapshot
      try {
        await sendTimerAction(head)
        sent++
      } catch (e) {
        if (isNetworkError(e)) break
        failed.push(e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e))
      }
      write(snapshot.slice(1))
    }
    return { sent, failed }
  })().finally(() => {
    flushing = null
  })
  return flushing
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('online', listener)
  window.addEventListener('offline', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('online', listener)
    window.removeEventListener('offline', listener)
  }
}

/** Есть ли сеть и сколько нажатий ждут отправки — для плашки «нет сети». */
export function useNetworkState() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine)
  const pending = useSyncExternalStore(subscribe, () => snapshot.length)
  return { online, pending }
}
