/**
 * Отчёт клиенту по ссылке: снимок отчёта по одному значению группы (клиенту) на момент
 * отправки. Только спринты, часы и сумма — без журнала, комментариев и чужих клиентов.
 */
import { billTotals, type BillTotal } from './rate'
import type { ReportData, SprintRow } from './report'
import type { Task } from './types'

export interface ClientSnapshot {
  /** 1 — до 0.42 (только спринты и сумма); 2 — с цветом, днями, планом и журналом */
  v: 1 | 2
  client: string
  /** кто отправил: имя из профиля */
  owner: string
  /** свой логотип отправителя (PNG data URL) — в шапке страницы и PDF */
  logo?: string | null
  from: string
  to: string
  label: string
  /** ISO-время сборки */
  generatedAt: string
  includeOvertime: boolean
  sprints: SprintRow[]
  billing: BillTotal[]
  /** часы клиента за период */
  hours: number
  inWorkCount: number
  closedCount: number
  overCount: number
  overHours: number
  overdueCount: number
  /** 0.42: цвет клиента ('label-1'…), часы по дням, план спринтов, «что сделано» */
  color?: string | null
  plan?: number
  days?: { date: string; day: number; weekend: boolean; hours: number }[]
  journal?: ClientJournalDay[]
  /** комментарии к учёту показаны клиенту (галочка при создании ссылки) */
  withNotes?: boolean
}

export interface ClientJournalDay {
  date: string
  label: string
  total: number
  rows: { title: string; hours: number; notes: string[] }[]
}

/** Снимок по клиенту из уже собранного отчёта: спринты, где у задачи есть это значение. */
export function buildClientSnapshot(args: {
  report: ReportData
  tasks: Pick<Task, 'id' | 'item_ids'>[]
  itemId: string
  client: string
  owner: string
  /** цвет значения группы — точка и столбики в отчёте */
  color?: string | null
  /** показать клиенту комментарии к учёту (отчёт для этого собирают с комментариями) */
  withNotes?: boolean
}): ClientSnapshot {
  const { report: r, itemId } = args
  const ofClient = new Set(args.tasks.filter((t) => t.item_ids.includes(itemId)).map((t) => t.id))
  // записи клиента — по спринту записи; подзадачи групп не несут, их держит спринт
  const byDay = new Map<string, number>()
  const journal: ClientJournalDay[] = []
  for (const day of r.journal ?? []) {
    const mine = (day.entries ?? []).filter((e) => ofClient.has(e.headId))
    if (!mine.length) continue
    const rows = new Map<string, { title: string; hours: number; notes: string[] }>()
    for (const e of mine) {
      const row = rows.get(e.title) ?? { title: e.title, hours: 0, notes: [] }
      row.hours += e.hours
      if (args.withNotes && e.note) row.notes.push(e.note)
      rows.set(e.title, row)
    }
    const total = mine.reduce((a, e) => a + e.hours, 0)
    byDay.set(day.date, total)
    journal.push({ date: day.date, label: day.label, total, rows: [...rows.values()].sort((a, b) => b.hours - a.hours) })
  }
  // id задач клиенту ни к чему — заменяем порядковыми
  const sprints = r.sprints.filter((s) => ofClient.has(s.id)).map((s, i) => ({ ...s, id: String(i + 1) }))
  const includeOvertime = r.options.includeOvertime === true
  const over = sprints.filter((s) => s.group === 'over')
  return {
    v: 2,
    client: args.client,
    owner: args.owner,
    logo: r.logo ?? null,
    from: r.from,
    to: r.to,
    label: r.label,
    generatedAt: r.generatedAt.toISOString(),
    includeOvertime,
    sprints,
    billing: billTotals(
      sprints.map((s) => s.bill),
      includeOvertime,
    ),
    hours: sprints.reduce((sum, s) => sum + s.factPeriod, 0),
    inWorkCount: sprints.length,
    closedCount: sprints.filter((s) => s.isFinal).length,
    overCount: over.length,
    overHours: over.reduce((sum, s) => sum + s.over, 0),
    overdueCount: sprints.filter((s) => s.overdue).length,
    color: args.color ?? null,
    plan: sprints.reduce((sum, s) => sum + s.plan, 0),
    days: (r.days ?? []).map((d) => ({ date: d.date, day: d.day, weekend: d.weekend, hours: byDay.get(d.date) ?? 0 })),
    journal,
    withNotes: args.withNotes === true,
  }
}

/**
 * Снимок в виде отчёта — для страниц PDF «Спринты» и «К оплате». Остальные разделы
 * в PDF клиента не рисуются, их поля пустые.
 */
export function snapshotAsReport(s: ClientSnapshot): ReportData {
  return {
    from: s.from,
    to: s.to,
    label: `${s.client} · ${s.label}`,
    logo: s.logo ?? null,
    generatedAt: new Date(s.generatedAt),
    options: { includeChecks: false, includeComments: false, includeOvertime: s.includeOvertime },
    sprints: s.sprints,
    billing: s.billing,
    inWorkCount: s.inWorkCount,
    closedCount: s.closedCount,
    overCount: s.overCount,
    overHours: s.overHours,
    overdueCount: s.overdueCount,
    total: s.hours,
  } as unknown as ReportData
}

/** Токен ссылки: 24 случайных байта, base64url — 32 символа. */
export function newShareToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Адрес страницы отчёта для клиента. */
export function shareUrl(token: string, origin = window.location.origin): string {
  return `${origin}/r/${token}`
}
