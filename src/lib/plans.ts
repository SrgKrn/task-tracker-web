/**
 * Тарифы: каталог для экрана «Профиль → Тариф». Цены и состав — из тарифной сетки
 * (pricing.html, 20.10.2026). Лимиты пока нигде не проверяются: это только витрина.
 */

export type PlanId = 'free' | 'pro' | 'studio' | 'lifetime'
export type Currency = 'usd' | 'byn'
export type Billing = 'month' | 'year'

export interface PlanFeature {
  text: string
  /** ещё не сделано в приложении — показываем с пометкой «скоро» */
  soon?: boolean
}

export interface PlanInfo {
  id: Exclude<PlanId, 'lifetime'>
  name: string
  who: string
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
    who: 'Попробовать на своих клиентах',
    price: null,
    features: [
      { text: 'До 3 клиентов, задачи и спринты без ограничений' },
      { text: 'Таймер, ручной учёт, план часов и норма' },
      { text: '«Сводка» за текущий и прошлый месяц' },
      { text: 'Фокус и методики приоритетов' },
      { text: 'Плитка дня, пуш-напоминания' },
      { text: 'Файлы до 200 МБ' },
    ],
  },
  {
    id: 'pro',
    name: 'Про',
    who: 'Постоянные клиенты и отчёты им по часам',
    price: { usd: { month: 5, year: 48 }, byn: { month: 15, year: 144 } },
    inherits: 'Старта',
    features: [
      { text: 'Клиенты без ограничений, вся история' },
      { text: 'Отчёты PDF и Excel' },
      { text: 'Telegram: итоги дня и недели, команды' },
      { text: 'Google Календарь и Диск' },
      { text: 'До 3 пространств, пресеты, холст групп' },
      { text: 'Хронология, мозаика года' },
      { text: 'Файлы до 5 ГБ' },
    ],
  },
  {
    id: 'studio',
    name: 'Студия',
    who: 'Отчёт клиенту — часть вашей работы',
    price: { usd: { month: 9, year: 84 }, byn: { month: 27, year: 252 } },
    inherits: 'Про',
    features: [
      { text: 'Пространства без ограничений' },
      { text: 'Свой логотип и реквизиты в отчётах', soon: true },
      { text: 'Отчёт клиенту по ссылке', soon: true },
      { text: 'Ставка в час и сумма в отчёте', soon: true },
      { text: 'Файлы до 25 ГБ' },
      { text: 'Быстрый ответ поддержки' },
    ],
  },
]

export const PLAN_NAME: Record<PlanId, string> = {
  free: 'Старт',
  pro: 'Про',
  studio: 'Студия',
  lifetime: 'Пожизненный',
}

/** Тариф, чьи возможности действуют: у пожизненного — всё из «Студии». */
export function effectivePlan(plan: PlanId): Exclude<PlanId, 'lifetime'> {
  return plan === 'lifetime' ? 'studio' : plan
}

/** Цена в месяц для выбранной оплаты: за год — годовая сумма, делённая на 12. */
export function monthlyPrice(plan: PlanInfo, currency: Currency, billing: Billing): number {
  if (!plan.price) return 0
  const p = plan.price[currency]
  return billing === 'year' ? p.year / 12 : p.month
}

/** $4 · $4,5 · 12 BYN — без лишних нулей, запятая как в остальном приложении. */
export function formatPrice(value: number, currency: Currency): string {
  const n = String(Math.round(value * 100) / 100).replace('.', ',')
  return currency === 'usd' ? `$${n}` : `${n} BYN`
}

/** Скидка за год в процентах, округлённая: у «Про» и «Студии» — 20 и 22. */
export function yearlySaving(plan: PlanInfo, currency: Currency): number {
  if (!plan.price) return 0
  const p = plan.price[currency]
  return Math.round((1 - p.year / (p.month * 12)) * 100)
}
