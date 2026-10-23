import { describe, expect, it } from 'vitest'
import { buildClientSnapshot, newShareToken, snapshotAsReport } from './clientReport'
import type { ReportData, SprintRow } from './report'

const row = (id: string, over: number, amount: number): SprintRow => ({
  id,
  name: `Спринт ${id}`,
  outer: '',
  inner: '',
  plan: 10,
  factTotal: 10 + over,
  factPeriod: 10 + over,
  pct: Math.round(((10 + over) / 10) * 100),
  over,
  status: 'в работе',
  clientKey: 'none',
  stageTone: 'progress',
  subDone: 0,
  subTotal: 0,
  isFinal: false,
  startDate: null,
  endDate: null,
  overdue: false,
  group: over > 0 ? 'over' : 'inplan',
  bill: { rate: 40, currency: 'BYN', hours: 10, amount, overHours: over, overAmount: over * 40 },
})

const report = {
  from: '2026-10-01',
  to: '2026-10-31',
  label: 'октябрь 2026',
  generatedAt: new Date('2026-10-20T10:00:00Z'),
  options: { includeChecks: false, includeComments: false, includeOvertime: false },
  sprints: [row('a', 2, 400), row('b', 0, 400)],
} as unknown as ReportData

describe('buildClientSnapshot', () => {
  const snap = buildClientSnapshot({
    report,
    tasks: [
      { id: 'a', item_ids: ['client-1'] },
      { id: 'b', item_ids: ['client-2'] },
    ],
    itemId: 'client-1',
    client: 'А-Лизинг',
    owner: 'Сергей',
  })

  it('только спринты этого клиента, без внутренних id', () => {
    expect(snap.sprints.map((s) => s.name)).toEqual(['Спринт a'])
    expect(snap.sprints[0].id).toBe('1')
  })

  it('итоги пересчитаны по клиенту', () => {
    expect(snap.billing).toEqual([{ currency: 'BYN', hours: 10, amount: 400, overHours: 2, overAmount: 80, due: 400 }])
    expect(snap.hours).toBe(12)
    expect(snap.overCount).toBe(1)
  })

  it('снимок читается как отчёт для PDF', () => {
    const r = snapshotAsReport(JSON.parse(JSON.stringify(snap)))
    expect(r.generatedAt).toBeInstanceOf(Date)
    expect(r.label).toBe('А-Лизинг · октябрь 2026')
  })
})

describe('newShareToken', () => {
  it('32 символа base64url, каждый раз новый', () => {
    const a = newShareToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/)
    expect(newShareToken()).not.toBe(a)
  })
})

describe('buildClientSnapshot — что сделано (0.42)', () => {
  const entry = (headId: string, title: string, hours: number, note: string | null) => ({
    start: '10:00',
    end: '11:00',
    title,
    headId,
    clientKey: 'x',
    hours,
    note,
    tag: null,
  })
  const withJournal = {
    ...report,
    days: [{ date: '2026-10-05', day: 5, weekend: false, hours: 3 }],
    journal: [
      {
        date: '2026-10-05',
        label: '5 октября, понедельник',
        entries: [entry('a', 'Баннеры', 1, 'Три варианта'), entry('a', 'Баннеры', 0.5, null), entry('b', 'Чужой клиент', 1.5, 'секрет')],
      },
    ],
  } as unknown as ReportData
  const make = (withNotes: boolean) =>
    buildClientSnapshot({
      report: withJournal,
      tasks: [
        { id: 'a', item_ids: ['client-1'] },
        { id: 'b', item_ids: ['client-2'] },
      ],
      itemId: 'client-1',
      client: 'А-Лизинг',
      owner: 'Сергей',
      color: 'label-2',
      withNotes,
    })

  it('только записи этого клиента, задача за день — одной строкой, часы по дням', () => {
    const s = make(false)
    expect(s.v).toBe(2)
    expect(s.color).toBe('label-2')
    expect(s.journal).toEqual([{ date: '2026-10-05', label: '5 октября, понедельник', total: 1.5, rows: [{ title: 'Баннеры', hours: 1.5, notes: [] }] }])
    expect(s.days?.[0].hours).toBe(1.5)
    expect(JSON.stringify(s)).not.toContain('секрет')
  })

  it('комментарии — только с галочкой', () => {
    expect(make(true).journal?.[0].rows[0].notes).toEqual(['Три варианта'])
    expect(make(false).withNotes).toBe(false)
  })
})
