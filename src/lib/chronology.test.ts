import { describe, expect, it } from 'vitest'
import { buildChronology, matchesFilter, type ChronoEntry, type ChronoInput } from './chronology'

/** местное время дня в ISO — тесты не зависят от пояса машины */
const at = (date: string, hm: string, sec = 0) => {
  const [h, m] = hm.split(':').map(Number)
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m, sec).toISOString()
}
const D = '2026-10-15'
const Y = '2026-10-14'

let n = 0
function timer(date: string, from: string, seconds: number, taskId = 't1', note: string | null = null): ChronoEntry {
  const start = at(date, from)
  const end = new Date(new Date(start).getTime() + seconds * 1000).toISOString()
  return {
    id: `e${++n}`, task_id: taskId, entry_type: 'timer', started_at: start, ended_at: end,
    duration_seconds: seconds, duration_minutes: Math.round(seconds / 60), note, effective_date: date, created_at: end,
  }
}
function adjust(date: string, createdAt: string, seconds: number, taskId = 't1', note: string | null = null): ChronoEntry {
  return {
    id: `e${++n}`, task_id: taskId, entry_type: 'manual_adjustment', started_at: null, ended_at: null,
    duration_seconds: seconds, duration_minutes: Math.round(seconds / 60), note, effective_date: date, created_at: createdAt,
  }
}
const base = (over: Partial<ChronoInput> = {}): ChronoInput => ({
  entries: [], statusEvents: [], changes: [], comments: [], files: [], meetingEntryIds: new Set(), from: Y, to: D, ...over,
})

describe('хронология', () => {
  it('дни по убыванию, строки по убыванию времени, итог дня — учёт и правки', () => {
    const days = buildChronology(base({
      entries: [timer(D, '10:00', 3600), timer(D, '14:00', 1800), adjust(D, at(D, '16:31'), 3600), timer(Y, '09:00', 600)],
    }))
    expect(days.map((d) => d.date)).toEqual([D, Y])
    expect(days[0].rows.map((r) => r.kind)).toEqual(['adjustment', 'timer', 'timer'])
    expect(days[0].totalSeconds).toBe(3600 + 1800 + 3600)
    expect(days[0].counts).toEqual({ sessions: 2, adjustments: 1, stages: 0, changes: 0 })
  })

  it('запуски короче минуты сворачиваются, но в итог дня входят', () => {
    const [d] = buildChronology(base({ entries: [timer(D, '10:37', 3), timer(D, '11:00', 900), timer(D, '14:48', 6)] }))
    expect(d.rows).toHaveLength(1)
    expect(d.shortStarts).toHaveLength(2)
    expect(d.totalSeconds).toBe(909)
  })

  it('встреча из календаря не считается случайным запуском даже короткой', () => {
    const m = timer(D, '11:00', 30, 't1', 'эврика')
    const [d] = buildChronology(base({ entries: [m], meetingEntryIds: new Set([m.id]) }))
    expect(d.rows[0]).toMatchObject({ kind: 'timer', meeting: true, note: 'эврика' })
  })

  it('правки за пару минут — одной строкой, далёкие — отдельно', () => {
    const [d] = buildChronology(base({
      entries: [
        adjust(D, at(D, '13:23', 10), 1800, 'a'),
        adjust(D, at(D, '13:23', 40), 1800, 'b'),
        adjust(D, at(D, '16:31'), 3600, 'c'),
      ],
    }))
    expect(d.rows.map((r) => r.kind)).toEqual(['adjustment', 'adjustmentGroup'])
    const g = d.rows[1]
    expect(g.kind === 'adjustmentGroup' && g.items.map((i) => i.taskId)).toEqual(['b', 'a'])
    expect(d.counts.adjustments).toBe(3)
  })

  it('нулевая правка не показывается', () => {
    const [d] = buildChronology(base({ entries: [adjust(D, at(D, '19:40'), 0), timer(D, '10:00', 600)] }))
    expect(d.rows.map((r) => r.kind)).toEqual(['timer'])
    expect(d.counts.adjustments).toBe(0)
  })

  it('правка задним числом — в своём дне, с отметкой, когда внесена', () => {
    const days = buildChronology(base({ entries: [adjust(Y, at(D, '09:00'), 900)] }))
    expect(days[0].date).toBe(Y)
    expect(days[0].rows[0]).toMatchObject({ kind: 'adjustment', enteredOn: D })
  })

  it('этапы: «было» берётся из предыдущего события задачи, пачка сворачивается', () => {
    const [d] = buildChronology(base({
      from: D,
      statusEvents: [
        { id: 's0', task_id: 't8', status_id: '25', is_final: false, created_at: at('2026-10-01', '10:00') },
        { id: 's1', task_id: 't8', status_id: '50', is_final: false, created_at: at(D, '12:29', 10) },
        { id: 's2', task_id: 't3', status_id: 'done', is_final: true, created_at: at(D, '12:29', 30) },
        { id: 's3', task_id: 't5', status_id: '75', is_final: false, created_at: at(D, '18:00') },
      ],
    }))
    expect(d.rows.map((r) => r.kind)).toEqual(['stage', 'stageGroup'])
    const g = d.rows[1]
    if (g.kind !== 'stageGroup') throw new Error('ожидалась пачка')
    expect(g.items.find((i) => i.taskId === 't8')).toMatchObject({ from: '25', to: '50' })
    expect(g.items.find((i) => i.taskId === 't3')).toMatchObject({ from: null, final: true })
    expect(d.counts.stages).toBe(3)
  })

  it('поля одного сохранения — одной строкой; создание и удаление — отдельно', () => {
    const [d] = buildChronology(base({
      changes: [
        { id: 1, task_id: 't8', task_name: 'Спринт 8', field: 'created', old_value: null, new_value: null, created_at: at(D, '09:00') },
        { id: 2, task_id: 't8', task_name: 'Спринт 8', field: 'planned_hours', old_value: 40, new_value: 44, created_at: at(D, '12:05', 1) },
        { id: 3, task_id: 't8', task_name: 'Спринт 8', field: 'end_date', old_value: null, new_value: '2026-10-31', created_at: at(D, '12:05', 1) },
        { id: 4, task_id: 't8', task_name: 'Спринт 8', field: 'name', old_value: 'Спринт 8', new_value: 'Спринт 8+', created_at: at(D, '15:00') },
      ],
    }))
    expect(d.rows).toHaveLength(3)
    const edit = d.rows.find((r) => r.kind === 'change' && r.fields.length === 2)
    expect(edit && edit.kind === 'change' && edit.fields.map((f) => f.field)).toEqual(['planned_hours', 'end_date'])
    expect(d.counts.changes).toBe(3)
  })

  it('полоса дня: шкала 8–20, шире — если работа выходила за край', () => {
    const [d] = buildChronology(base({ entries: [timer(D, '14:00', 3600)] }))
    expect(d.scale).toEqual({ from: 8, to: 20 })
    expect(d.ribbon[0].left).toBeCloseTo(0.5)
    expect(d.ribbon[0].width).toBeCloseTo(1 / 12)
    const [late] = buildChronology(base({ entries: [timer(D, '22:30', 3600)] }))
    expect(late.scale).toEqual({ from: 8, to: 24 })
  })

  it('пустой период — пустая хронология', () => {
    expect(buildChronology(base())).toEqual([])
  })

  it('фильтры', () => {
    const [d] = buildChronology(base({
      entries: [timer(D, '10:00', 600), adjust(D, at(D, '11:00'), 600)],
      comments: [{ id: 'c1', task_id: 't1', body: 'заметка', created_at: at(D, '12:00') }],
    }))
    const kinds = (f: Parameters<typeof matchesFilter>[1]) => d.rows.filter((r) => matchesFilter(r, f)).map((r) => r.kind)
    expect(kinds('tracking')).toEqual(['timer'])
    expect(kinds('adjustments')).toEqual(['adjustment'])
    expect(kinds('changes')).toEqual(['comment'])
    expect(kinds('all')).toHaveLength(3)
  })
})
