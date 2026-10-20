import { useEffect, useMemo, useState } from 'react'
import {
  buildSegments,
  makeTile,
  type DayTile,
  type TileClient,
} from '../../supabase/functions/telegram/tile.ts'
import { useGroupModel, type GroupModel } from './groups'
import { dayNormFor, isWorkday, normSettingsOf } from './norm'
import { addDays } from './period'
import { useTimeEntriesInRange } from './queries/dashboard'
import { useTasks } from './queries/tasks'
import { useActiveTimer } from './queries/timer'
import { useActiveWorkspace } from './workspace'
import type { ActiveTimer, Task, TimeEntry } from './types'

export {
  layoutTile,
  tileClients,
  tileRhythm,
  type DayTile,
  type TileClient,
  type TileRect,
  type TileSeg,
} from '../../supabase/functions/telegram/tile.ts'

const NO_CLIENT: TileClient = { key: 'none', name: 'Без группы', color: null }

/**
 * Клиент задачи для плитки — то же значение, что даёт точку в строке задачи: первое
 * значение «в строке» с цветом. У подзадачи без своего — значение спринта.
 */
export function tileClientOf(model: GroupModel, taskById: Map<string, Task>) {
  return (taskId: string): TileClient => {
    const task = taskById.get(taskId)
    if (!task) return NO_CLIENT
    for (const t of [task, task.parent_id ? taskById.get(task.parent_id) : undefined]) {
      if (!t) continue
      const values = model.valuesOf(t).filter((v) => v.group.show_in_list)
      const v = values.find((x) => x.item.color) ?? values[0]
      if (v) return { key: v.item.id, name: v.item.name, color: v.item.color ?? null }
    }
    return NO_CLIENT
  }
}

/** Плитки дней [from, to] по записям учёта. today — день, который ещё идёт. */
export function buildDayTiles(opts: {
  from: string
  to: string
  today: string
  entries: TimeEntry[]
  clientOf: (taskId: string) => TileClient
  normMinutes: (day: string) => number
  running?: ActiveTimer | null
  now?: number
}): Map<string, DayTile> {
  const byDay = new Map<string, TimeEntry[]>()
  for (const e of opts.entries) byDay.set(e.effective_date, [...(byDay.get(e.effective_date) ?? []), e])
  const tiles = new Map<string, DayTile>()
  for (let d = opts.from; d <= opts.to && d <= opts.today; d = addDays(d, 1)) {
    const live = d === opts.today
    const running = live && opts.running ? { ...opts.running, now: opts.now ?? Date.now() } : null
    tiles.set(d, makeTile(buildSegments(byDay.get(d) ?? [], opts.clientOf, running), opts.normMinutes(d), live))
  }
  return tiles
}

/** Номер плитки за год: сколько дней с учётом с 1 января по этот день включительно. */
export function tileNumber(tiles: Map<string, DayTile>, day: string): number {
  let n = 0
  for (const [d, t] of tiles) if (d <= day && d.slice(0, 4) === day.slice(0, 4) && t.total > 0) n++
  return n
}

/** самый длинный день каждого месяца — «рекорд месяца» (только законченные дни) */
export function monthRecords(tiles: Map<string, DayTile>, today: string): Set<string> {
  const best = new Map<string, { day: string; total: number }>()
  for (const [d, t] of tiles) {
    if (d >= today || t.total <= 0) continue
    const m = d.slice(0, 7)
    if (!best.has(m) || t.total > best.get(m)!.total) best.set(m, { day: d, total: t.total })
  }
  return new Set([...best.values()].map((b) => b.day))
}

/** Начало текущей минуты, пока active: идущий учёт дорисовывается раз в минуту. */
export function useMinuteClock(active: boolean): number | undefined {
  const [minute, setMinute] = useState<number | undefined>(undefined)
  useEffect(() => {
    if (!active) return
    const tick = () => setMinute(Math.floor(Date.now() / 60_000) * 60_000)
    const id = setInterval(tick, 15_000)
    const first = setTimeout(tick, 0)
    return () => {
      clearInterval(id)
      clearTimeout(first)
    }
  }, [active])
  return active ? minute : undefined
}

/**
 * Плитки активного пространства за период: учёт, клиенты, норма (только рабочие дни —
 * в выходной недобора не бывает). Идущий учёт попадает в сегодняшнюю плитку.
 */
export function useDayTiles(from: string, to: string, today: string, now?: number) {
  const { data: entries, isLoading } = useTimeEntriesInRange(from, to)
  const { data: tasks = [] } = useTasks()
  const { data: running } = useActiveTimer()
  const model = useGroupModel()
  const workspace = useActiveWorkspace()
  const tiles = useMemo(() => {
    const taskById = new Map(tasks.map((t) => [t.id, t]))
    const norm = normSettingsOf(workspace)
    return buildDayTiles({
      from,
      to,
      today,
      entries: entries ?? [],
      clientOf: tileClientOf(model, taskById),
      normMinutes: (d) => (isWorkday(d, norm.workDays) ? (dayNormFor(d, norm) ?? 0) * 60 : 0),
      // учёт по задаче другого пространства в эту плитку не идёт
      running: running && taskById.has(running.task_id) ? running : null,
      now,
    })
  }, [entries, tasks, running, model, workspace, from, to, today, now])
  return { tiles, loading: isLoading || model.loading }
}
