import { useState } from 'react'
import { Check } from './Icon'
import { Button, Card, Overline, Segmented, Skeleton, Tag } from './ui'
import {
  PLANS,
  PLAN_NAME,
  effectivePlan,
  formatPrice,
  monthlyPrice,
  yearlySaving,
  type Billing,
  type Currency,
  type PlanId,
  type PlanInfo,
} from '../lib/plans'
import { useUserPlan } from '../lib/queries/plan'

const PREFS_KEY = 'semternity.pricing'

function loadPrefs(): { currency: Currency; billing: Billing } {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null')
    return {
      currency: raw?.currency === 'byn' ? 'byn' : 'usd',
      billing: raw?.billing === 'month' ? 'month' : 'year',
    }
  } catch {
    return { currency: 'usd', billing: 'year' }
  }
}

const PLAN_RANK: Record<Exclude<PlanId, 'lifetime'>, number> = { free: 0, pro: 1, studio: 2 }

/** Описание текущего тарифа под его названием. */
function currentText(plan: PlanId, paidUntil: string | null): string {
  if (plan === 'lifetime') return 'Всё из «Студии» без оплаты и без срока. Спасибо, что пользуетесь трекером с первых версий.'
  if (plan === 'free') return 'Бесплатно, до 3 клиентов. Отчёты, Telegram-итоги и Google — на «Про».'
  if (paidUntil) {
    const d = new Date(paidUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    return `Оплачен до ${d}.`
  }
  return 'Оплачен.'
}

/** Карточка текущего тарифа — первое, что видно на экране. */
function CurrentPlan({ plan, paidUntil }: { plan: PlanId; paidUntil: string | null }) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <Overline>Ваш тариф</Overline>
      <span className="flex items-center gap-2">
        <span className="text-xl font-semibold tracking-[-0.01em] text-text">{PLAN_NAME[plan]}</span>
        {plan === 'lifetime' && <Tag tone="accent">безлимит навсегда</Tag>}
      </span>
      <p className="text-sm text-text-secondary">{currentText(plan, paidUntil)}</p>
    </Card>
  )
}

function PlanCard({
  info,
  current,
  currency,
  billing,
}: {
  info: PlanInfo
  /** тариф пользователя */
  current: PlanId
  currency: Currency
  billing: Billing
}) {
  const active = effectivePlan(current)
  const isCurrent = info.id === active
  const covered = PLAN_RANK[info.id] < PLAN_RANK[active]
  const price = monthlyPrice(info, currency, billing)

  return (
    <article
      className={`flex flex-col gap-3 rounded-md border bg-surface p-4 ${
        isCurrent ? 'border-accent ring-1 ring-accent' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="text-lg font-semibold text-text">{info.name}</span>
          <span className="text-sm text-text-secondary">{info.who}</span>
        </span>
        {isCurrent && <Tag tone="accent">{current === 'lifetime' ? 'входит навсегда' : 'ваш тариф'}</Tag>}
        {covered && <Tag>входит в ваш</Tag>}
      </div>

      <div className="flex flex-col">
        <span className="flex items-baseline gap-1.5">
          <span
            className={`text-2xl font-medium tracking-[-0.02em] text-text tabular-nums ${info.price ? 'font-mono' : ''}`}
          >
            {info.price ? formatPrice(price, currency) : 'Бесплатно'}
          </span>
          {info.price && <span className="text-sm text-text-tertiary">в месяц</span>}
        </span>
        {info.price && (
          <span className="text-sm text-text-tertiary tabular-nums">
            {billing === 'year'
              ? `${formatPrice(info.price[currency].year, currency)} за год · выгода ${yearlySaving(info, currency)} %`
              : `за год — ${formatPrice(info.price[currency].year, currency)}`}
          </span>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {info.inherits && <li className="text-sm font-medium text-text-secondary">Всё из «{info.inherits}», плюс:</li>}
        {info.features.map((f) => (
          <li key={f.text} className="flex items-start gap-2 text-sm text-text">
            <Check size={15} className="mt-0.5 shrink-0 text-success-text" />
            <span className="min-w-0 flex-1">{f.text}</span>
            {f.soon && <Tag>скоро</Tag>}
          </li>
        ))}
      </ul>

      {!isCurrent && !covered && (
        <Button variant="secondary" disabled>
          Оплата появится позже
        </Button>
      )}
    </article>
  )
}

/** Экран «Профиль → Тариф»: текущий тариф и сетка. Покупки пока нет — только витрина. */
export function PlanScreen() {
  const { data, isLoading } = useUserPlan()
  const [prefs, setPrefs] = useState(loadPrefs)

  function update(next: Partial<typeof prefs>) {
    const merged = { ...prefs, ...next }
    setPrefs(merged)
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(merged))
    } catch {
      /* без хранилища выбор просто не запомнится */
    }
  }

  if (isLoading || !data) return <Skeleton className="h-28" />

  return (
    <>
      <CurrentPlan plan={data.plan} paidUntil={data.paid_until} />

      <section className="mt-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Overline className="px-0.5">Все тарифы</Overline>
          <span className="flex gap-2">
            <Segmented
              value={prefs.currency}
              onChange={(currency) => update({ currency })}
              options={[
                { value: 'usd', label: 'USD' },
                { value: 'byn', label: 'BYN' },
              ]}
            />
            <Segmented
              value={prefs.billing}
              onChange={(billing) => update({ billing })}
              options={[
                { value: 'month', label: 'Месяц' },
                { value: 'year', label: 'Год' },
              ]}
            />
          </span>
        </div>

        {PLANS.map((p) => (
          <PlanCard key={p.id} info={p} current={data.plan} currency={prefs.currency} billing={prefs.billing} />
        ))}

        <div className="flex flex-col gap-1 rounded-md border border-dashed border-border-strong px-4 py-3">
          <span className="flex items-center gap-2 text-base font-medium text-text">
            Команда <Tag>скоро</Tag>
          </span>
          <span className="text-sm text-text-secondary">Общие клиенты, роли и сводка по людям.</span>
        </div>

        <p className="px-0.5 text-sm text-text-tertiary">
          Цены в BYN фиксированные и не меняются вместе с курсом. Записи и отчёты остаются вашими на любом тарифе.
        </p>
      </section>
    </>
  )
}
