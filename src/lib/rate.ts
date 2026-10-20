/**
 * Ставка в час и сумма к оплате. Ставка — у значения группы (обычно клиента), у спринта
 * её можно переопределить: новая цена с этого месяца не меняет прошлые спринты.
 */

export type RateCurrency = 'BYN' | 'USD' | 'EUR' | 'RUB'
export const RATE_CURRENCIES: RateCurrency[] = ['BYN', 'USD', 'EUR', 'RUB']

export interface Rate {
  rate: number
  currency: RateCurrency
  /** откуда ставка: своя у спринта или у значения группы */
  source: 'task' | 'item'
  /** у какого значения нашлась (для подсказки «как у …») */
  itemName?: string
}

interface RatedTask {
  item_ids: string[]
  hourly_rate: number | null
  rate_currency: string | null
}
interface RatedItem {
  id: string
  name: string
  group_id: string
  hourly_rate: number | null
  rate_currency: string | null
}

function currencyOf(v: string | null | undefined): RateCurrency {
  return RATE_CURRENCIES.includes(v as RateCurrency) ? (v as RateCurrency) : 'BYN'
}

/** Ставка значений задачи: первая заданная в порядке групп. */
export function itemRate(itemIds: string[], items: RatedItem[], groupOrder: string[]): Rate | null {
  const own = items.filter((i) => itemIds.includes(i.id) && i.hourly_rate != null && Number(i.hourly_rate) > 0)
  if (!own.length) return null
  own.sort((a, b) => groupOrder.indexOf(a.group_id) - groupOrder.indexOf(b.group_id))
  const it = own[0]
  return { rate: Number(it.hourly_rate), currency: currencyOf(it.rate_currency), source: 'item', itemName: it.name }
}

/** Действующая ставка спринта: своя, иначе у его значений групп. */
export function resolveRate(task: RatedTask, items: RatedItem[], groupOrder: string[]): Rate | null {
  if (task.hourly_rate != null && Number(task.hourly_rate) > 0) {
    return { rate: Number(task.hourly_rate), currency: currencyOf(task.rate_currency), source: 'task' }
  }
  return itemRate(task.item_ids, items, groupOrder)
}

export interface SprintBill {
  rate: number
  currency: RateCurrency
  /** часы к оплате в пределах плана (без плана — часы периода) */
  hours: number
  amount: number
  /** часы сверх плана и их стоимость — отдельной строкой */
  overHours: number
  overAmount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Сумма спринта. С планом: часы спринта в пределах плана, переработка отдельно — план это
 * договорённость с клиентом. Без плана договорённости нет: к оплате часы за период отчёта.
 */
export function billSprint(
  rate: Rate | null,
  plan: number,
  factTotal: number,
  factPeriod: number,
): SprintBill | null {
  if (!rate) return null
  const hours = plan > 0 ? Math.min(factTotal, plan) : factPeriod
  const overHours = plan > 0 ? Math.max(0, factTotal - plan) : 0
  return {
    rate: rate.rate,
    currency: rate.currency,
    hours,
    amount: round2(hours * rate.rate),
    overHours,
    overAmount: round2(overHours * rate.rate),
  }
}

export interface BillTotal {
  currency: RateCurrency
  hours: number
  amount: number
  overHours: number
  overAmount: number
  /** итог к оплате с учётом выбора «переработку — в сумму» */
  due: number
}

/** Итоги по валютам: разные клиенты платят в разных валютах — не складываем их. */
export function billTotals(bills: (SprintBill | null)[], includeOvertime: boolean): BillTotal[] {
  const by = new Map<RateCurrency, BillTotal>()
  for (const b of bills) {
    if (!b) continue
    const t = by.get(b.currency) ?? { currency: b.currency, hours: 0, amount: 0, overHours: 0, overAmount: 0, due: 0 }
    t.hours += b.hours
    t.amount = round2(t.amount + b.amount)
    t.overHours += b.overHours
    t.overAmount = round2(t.overAmount + b.overAmount)
    by.set(b.currency, t)
  }
  return RATE_CURRENCIES.filter((c) => by.has(c)).map((c) => {
    const t = by.get(c)!
    return { ...t, due: round2(t.amount + (includeOvertime ? t.overAmount : 0)) }
  })
}

const SIGN: Record<RateCurrency, string> = { BYN: 'BYN', USD: '$', EUR: '€', RUB: '₽' }

/** 1 250,50 BYN · $40 · 3 000 ₽ — пробел между тысячами, копейки только если есть. */
export function formatMoney(value: number, currency: RateCurrency): string {
  const fixed = Math.abs(value - Math.round(value)) < 0.005 ? String(Math.round(value)) : value.toFixed(2)
  const [int, frac] = fixed.split('.')
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const n = frac ? `${grouped},${frac}` : grouped
  if (currency === 'USD') return `$${n}`
  if (currency === 'EUR') return `${n} €`
  return `${n} ${SIGN[currency]}`
}

/** «40 BYN/ч» — подпись ставки */
export function formatRate(rate: number, currency: RateCurrency): string {
  return `${formatMoney(rate, currency)}/ч`
}
