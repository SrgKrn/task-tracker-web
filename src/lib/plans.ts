/**
 * Тарифы: каталог для экрана «Профиль → Тариф». Одна сетка для всех, две границы:
 * число пространств (сферы жизни) — «Плюс», «Работа с клиентами» (деньги) — «Про».
 * Лимиты пока нигде не проверяются: это только витрина.
 */

import type { Workspace } from './types'

/** studio — старое значение, в базе его ни у кого нет; оставлено, чтобы старая строка не ломала экран */
export type PlanId = 'free' | 'plus' | 'pro' | 'lifetime' | 'studio'
export type PaidPlan = 'free' | 'plus' | 'pro'
export type Currency = 'usd' | 'byn'
export type Billing = 'month' | 'year'

export interface PlanFeature {
  text: string
  /** ещё не сделано в приложении — показываем с пометкой «скоро» */
  soon?: boolean
}

export interface PlanInfo {
  id: PaidPlan
  name: string
  who: string
  /** главное отличие одной строкой — выделено в карточке */
  key: string
  /** цена в месяц при помесячной оплате и сумма за год; у бесплатного — null */
  price: Record<Currency, { month: number; year: number }> | null
  /** первая строка списка — «Всё из …, плюс:» */
  inherits?: string
  features: PlanFeature[]
}

export const PLANS: PlanInfo[] = [
  {
    id: 'free',
    name: 'Старт',
    who: 'Одна сфера: только работа или только учёба',
    key: '1 пространство, всё ядро',
    price: null,
    features: [
      { text: 'Задачи, спринты, подзадачи, этапы' },
      { text: 'Таймер и учёт, план часов, норма' },
      { text: '«Сегодня», «Сводка», вся история' },
      { text: 'Фокус и методики приоритетов' },
      { text: 'Плитка дня, пуш-напоминания' },
    ],
  },
  {
    id: 'plus',
    name: 'Плюс',
    who: 'Несколько сфер жизни в одном трекере',
    key: 'До 5 пространств и интеграции',
    price: { usd: { month: 3.99, year: 36 }, byn: { month: 12, year: 108 } },
    inherits: 'Старта',
    features: [
      { text: 'Работа, учёба, спорт, личное — отдельно' },
      { text: 'Итоги дня и недели в Telegram' },
      { text: 'Google Календарь и Диск' },
      { text: 'Отчёты PDF и Excel' },
      { text: 'Мозаика года, хронология' },
    ],
  },
  {
    id: 'pro',
    name: 'Про',
    who: 'Отчитываетесь перед клиентами часами',
    key: 'Работа с клиентами',
    price: { usd: { month: 7.99, year: 72 }, byn: { month: 24, year: 216 } },
    inherits: 'Плюса',
    features: [
      { text: 'Ставка в час у клиента и спринта' },
      { text: 'Сумма к оплате в отчёте' },
      { text: 'Отчёт клиенту по ссылке' },
      { text: 'Свой логотип в отчёте', soon: true },
    ],
  },
]

export const PLAN_NAME: Record<PlanId, string> = {
  free: 'Старт',
  plus: 'Плюс',
  pro: 'Про',
  lifetime: 'Пожизненный',
  studio: 'Про',
}

/** Тариф, чьи возможности действуют: у пожизненного — всё из «Про». */
export function effectivePlan(plan: PlanId): PaidPlan {
  if (plan === 'lifetime' || plan === 'studio') return 'pro'
  return plan
}

export const PLAN_RANK: Record<PaidPlan, number> = { free: 0, plus: 1, pro: 2 }

/**
 * Какой тариф подходит по тому, как человек пользуется трекером: есть пространство
 * с «Работой с клиентами» — «Про»; больше одного пространства — «Плюс»; иначе «Старт».
 */
export function recommendPlan(workspaces: Pick<Workspace, 'client_work'>[]): { plan: PaidPlan; why: string } {
  if (workspaces.some((w) => w.client_work)) {
    return { plan: 'pro', why: 'У вас есть пространство с работой с клиентами — ставка, сумма и ссылка для клиента входят в «Про».' }
  }
  if (workspaces.length > 1) {
    return { plan: 'plus', why: `У вас ${workspaces.length} пространства — несколько сфер жизни входят в «Плюс».` }
  }
  return { plan: 'free', why: 'Одно пространство без работы с клиентами — хватает «Старта».' }
}

/** Цена в месяц для выбранной оплаты: за год — годовая сумма, делённая на 12. */
export function monthlyPrice(plan: PlanInfo, currency: Currency, billing: Billing): number {
  if (!plan.price) return 0
  const p = plan.price[currency]
  return billing === 'year' ? p.year / 12 : p.month
}

/** $3 · $3,99 · 12 BYN — без лишних нулей, запятая как в остальном приложении. */
export function formatPrice(value: number, currency: Currency): string {
  const n = String(Math.round(value * 100) / 100).replace('.', ',')
  return currency === 'usd' ? `$${n}` : `${n} BYN`
}

/** Скидка за год в процентах, округлённая. */
export function yearlySaving(plan: PlanInfo, currency: Currency): number {
  if (!plan.price) return 0
  const p = plan.price[currency]
  return Math.round((1 - p.year / (p.month * 12)) * 100)
}
