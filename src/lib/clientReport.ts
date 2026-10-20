/**
 * Отчёт клиенту по ссылке: снимок отчёта по одному значению группы (клиенту) на момент
 * отправки. Только спринты, часы и сумма — без журнала, комментариев и чужих клиентов.
 */
import { billTotals, type BillTotal } from './rate'
import type { ReportData, SprintRow } from './report'
import type { Task } from './types'

export interface ClientSnapshot {
  v: 1
  client: string
  /** кто отправил: имя из профиля */
  owner: string
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
}

/** Снимок по клиенту из уже собранного отчёта: спринты, где у задачи есть это значение. */
export function buildClientSnapshot(args: {
  report: ReportData
  tasks: Pick<Task, 'id' | 'item_ids'>[]
  itemId: string
  client: string
  owner: string
}): ClientSnapshot {
  const { report: r, itemId } = args
  const ofClient = new Set(args.tasks.filter((t) => t.item_ids.includes(itemId)).map((t) => t.id))
  // id задач клиенту ни к чему — заменяем порядковыми
  const sprints = r.sprints.filter((s) => ofClient.has(s.id)).map((s, i) => ({ ...s, id: String(i + 1) }))
  const includeOvertime = r.options.includeOvertime === true
  const over = sprints.filter((s) => s.group === 'over')
  return {
    v: 1,
    client: args.client,
    owner: args.owner,
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
