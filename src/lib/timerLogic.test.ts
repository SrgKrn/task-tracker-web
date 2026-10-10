import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { toDateString } from './period'
import { applyTimerLocally, isNetworkError, projectTimer, rollbackTimer, type TimerAction } from './timerLogic'
import type { ActiveTimer, Task, TimeEntry } from './types'

const U = 'user'
const start = (taskId: string, at: string): TimerAction => ({ kind: 'start', userId: U, taskId, at })
const stop = (at: string, startedAt: string | null = null): TimerAction => ({ kind: 'stop', userId: U, at, startedAt })

describe('projectTimer — очередь поверх ответа сервера', () => {
  const server: ActiveTimer = { user_id: U, task_id: 'a', started_at: '2026-10-11T08:00:00.000Z' }

  it('без очереди — то, что ответил сервер', () => {
    expect(projectTimer(server, [])).toBe(server)
    expect(projectTimer(null, [])).toBeNull()
  })

  it('старт другой задачи и стоп из очереди', () => {
    expect(projectTimer(server, [start('b', '2026-10-11T09:00:00.000Z')])).toEqual({
      user_id: U,
      task_id: 'b',
      started_at: '2026-10-11T09:00:00.000Z',
    })
    expect(projectTimer(server, [stop('2026-10-11T09:00:00.000Z')])).toBeNull()
    expect(projectTimer(server, [stop('t1'), start('c', 't2')])?.task_id).toBe('c')
  })

  it('повторный старт той же задачи не сбрасывает начало', () => {
    expect(projectTimer(server, [start('a', '2026-10-11T09:00:00.000Z')])).toBe(server)
  })
})

describe('isNetworkError', () => {
  it('узнаёт обрыв сети в разных браузерах', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'), true)).toBe(true)
    expect(isNetworkError({ message: 'TypeError: Load failed' }, true)).toBe(true)
    expect(isNetworkError(new Error('NetworkError when attempting to fetch resource.'), true)).toBe(true)
  })

  it('отказ сервера — не обрыв; без сети — всегда обрыв', () => {
    expect(isNetworkError({ message: 'Задача не найдена' }, true)).toBe(false)
    expect(isNetworkError({ message: 'Задача не найдена' }, false)).toBe(true)
  })
})

describe('applyTimerLocally — мгновенный отклик', () => {
  const startedAt = new Date(2026, 9, 11, 10, 0, 0)
  const day = toDateString(startedAt)
  const running: ActiveTimer = { user_id: U, task_id: 'a', started_at: startedAt.toISOString() }
  const at = new Date(startedAt.getTime() + 95_000).toISOString()

  function setup() {
    const qc = new QueryClient()
    const a = { id: 'a', fact_hours: 1 } as Task
    const b = { id: 'b', fact_hours: 0 } as Task
    qc.setQueryData(['active_timer'], running)
    qc.setQueryData(['tasks'], [a, b])
    qc.setQueryData(['tasks', 'a'], a)
    qc.setQueryData(['time_entries', 'a'], [] as TimeEntry[])
    qc.setQueryData(['time_entries_range', day, day], [] as TimeEntry[])
    qc.setQueryData(['time_entries_range', '2020-01-01', '2020-01-07'], [] as TimeEntry[])
    return qc
  }

  it('стоп: учёт пропадает, сессия с секундами — в записях дня и в факте', () => {
    const qc = setup()
    applyTimerLocally(qc, stop(at), running)
    expect(qc.getQueryData(['active_timer'])).toBeNull()
    const entries = qc.getQueryData<TimeEntry[]>(['time_entries_range', day, day])!
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ task_id: 'a', duration_seconds: 95, duration_minutes: 2, effective_date: day })
    expect(qc.getQueryData<TimeEntry[]>(['time_entries_range', '2020-01-01', '2020-01-07'])).toHaveLength(0)
    expect(qc.getQueryData<TimeEntry[]>(['time_entries', 'a'])).toHaveLength(1)
    const fact = qc.getQueryData<Task[]>(['tasks'])!.find((t) => t.id === 'a')!.fact_hours
    expect(fact).toBeCloseTo(1 + 95 / 3600)
    expect(qc.getQueryData<Task>(['tasks', 'a'])!.fact_hours).toBeCloseTo(1 + 95 / 3600)
  })

  it('старт другой задачи закрывает идущую и сразу показывает новую', () => {
    const qc = setup()
    applyTimerLocally(qc, start('b', at), running)
    expect(qc.getQueryData<ActiveTimer>(['active_timer'])).toEqual({ user_id: U, task_id: 'b', started_at: at })
    expect(qc.getQueryData<TimeEntry[]>(['time_entries', 'a'])).toHaveLength(1)
  })

  it('старт той же задачи ничего не меняет', () => {
    const qc = setup()
    applyTimerLocally(qc, start('a', at), running)
    expect(qc.getQueryData(['active_timer'])).toBe(running)
    expect(qc.getQueryData<TimeEntry[]>(['time_entries', 'a'])).toHaveLength(0)
  })

  it('старт без идущего учёта не пишет сессий', () => {
    const qc = setup()
    qc.setQueryData(['active_timer'], null)
    applyTimerLocally(qc, start('b', at), null)
    expect(qc.getQueryData<ActiveTimer>(['active_timer'])?.task_id).toBe('b')
    expect(qc.getQueryData<TimeEntry[]>(['time_entries_range', day, day])).toHaveLength(0)
  })

  it('откат возвращает всё как было', () => {
    const qc = setup()
    const snapshot = applyTimerLocally(qc, stop(at), running)
    rollbackTimer(qc, snapshot)
    expect(qc.getQueryData(['active_timer'])).toEqual(running)
    expect(qc.getQueryData<TimeEntry[]>(['time_entries_range', day, day])).toHaveLength(0)
    expect(qc.getQueryData<Task[]>(['tasks'])!.find((t) => t.id === 'a')!.fact_hours).toBe(1)
  })
})
