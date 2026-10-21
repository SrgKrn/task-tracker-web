import { useState } from 'react'
import { Check } from './Icon'
import { Button, Card, Overline, Segmented, Skeleton, Tag } from './ui'
import {
  PLANS,
  PLAN_NAME,
  PLAN_RANK,
  formatPrice,
  monthlyPrice,
  recommendPlan,
  yearlySaving,
  type Billing,
  type Currency,
  type PaidPlan,
  type PlanId,
  type PlanInfo,
} from '../lib/plans'
import { useUserPlan } from '../lib/queries/plan'
import { useGate } from './Upgrade'
import { TRIAL_DAYS } from '../lib/limits'
import { useStartTrial } from '../lib/queries/plan'
import { describeError, useToast } from '../lib/Toast'
import { useWorkspaces } from '../lib/workspace'

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

/** Описание текущего тарифа под его названием. */
function currentText(plan: PlanId, paidUntil: string | null, trial = false): string {
  if (trial && paidUntil) {
    const d = new Date(paidUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    return `Пробный период до ${d}. Потом — «Старт», если не продлить.`
  }
  if (plan === 'lifetime') return 'Всё из «Про», без оплаты, без срока и без лимитов на пространства, группы и файлы. Спасибо, что пользуетесь трекером с первых версий.'
  if (plan === 'free') return 'Бесплатно: одно пространство, три группы и всё ядро трекера.'
  if (paidUntil) {
    const d = new Date(paidUntil).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    return `Оплачен до ${d}.`
  }
  return 'Оплачен.'
}

function CurrentPlan({ plan, paidUntil, trial }: { plan: PlanId; paidUntil: string | null; trial: boolean }) {
  return (
    <Card className="flex flex-col gap-1.5 p-4">
      <Overline>Ваш тариф</Overline>
      <span className="flex items-center gap-2">
        <span className="text-xl font-semibold tracking-[-0.01em] text-text">{PLAN_NAME[plan]}</span>
        {plan === 'lifetime' && <Tag tone="accent">безлимит навсегда</Tag>}
        {trial && <Tag tone="accent">пробный</Tag>}
      </span>
      <p className="text-sm text-text-secondary">{currentText(plan, paidUntil, trial)}</p>
    </Card>
  )
}

function PlanCard({
  info,
  current,
  active,
  recommended,
  currency,
  billing,
}: {
  info: PlanInfo
  /** записанный тариф пользователя */
  current: PlanId
  /** действующий: пожизненный — Про, кончился срок — Старт */
  active: PaidPlan
  /** подходит по тому, как пользуется трекером */
  recommended: boolean
  currency: Currency
  billing: Billing
}) {
  const isCurrent = info.id === active
  const covered = PLAN_RANK[info.id] < PLAN_RANK[active]
  const price = monthlyPrice(info, currency, billing)
  // рамкой выделяем действующий тариф; пока он «Старт» — тот, что подходит
  const highlight = isCurrent ? current !== 'free' || recommended : recommended && active === 'free'

  return (
    <article
      className={`flex flex-col gap-3 rounded-md border bg-surface p-4 ${
        highlight ? 'border-accent ring-1 ring-accent' : 'border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col">
          <span className="text-lg font-semibold text-text">{info.name}</span>
          <span className="text-sm text-text-secondary">{info.who}</span>
        </span>
        {isCurrent ? (
          <Tag tone="accent">{current === 'lifetime' ? 'входит навсегда' : 'ваш тариф'}</Tag>
        ) : covered ? (
          <Tag>входит в ваш</Tag>
        ) : recommended ? (
          <Tag tone="accent">вам подходит</Tag>
        ) : null}
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

      <p className="rounded-sm bg-surface-sunken px-3 py-2 text-base font-medium text-text">{info.key}</p>

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

      {!isCurrent && !covered && <PlanAction plan={info.id} name={info.name} />}
    </article>
  )
}

/** Экран «Профиль → Тариф»: текущий тариф, что подходит, сетка. Покупки пока нет — только витрина. */
export function PlanScreen() {
  const { data, isLoading } = useUserPlan()
  const { data: workspaces = [] } = useWorkspaces()
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

  const rec = recommendPlan(workspaces)
  const active = data.effective
  // подсказку показываем, только если подходящий тариф выше действующего
  const needsMore = PLAN_RANK[rec.plan as PaidPlan] > PLAN_RANK[active]

  return (
    <>
      <CurrentPlan
        plan={data.effective === 'free' && data.plan !== 'free' && data.plan !== 'lifetime' ? 'free' : data.plan}
        paidUntil={data.paid_until}
        trial={data.trial && data.effective !== 'free'}
      />
      {needsMore && <p className="px-0.5 text-sm text-text-secondary">{rec.why}</p>}

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
          <PlanCard
            key={p.id}
            info={p}
            current={data.plan}
            active={active}
            recommended={p.id === rec.plan}
            currency={prefs.currency}
            billing={prefs.billing}
          />
        ))}

        <div className="flex flex-col gap-1 rounded-md border border-dashed border-border-strong px-4 py-3">
          <span className="flex items-center gap-2 text-base font-medium text-text">
            Команда <Tag>скоро</Tag>
          </span>
          <span className="text-sm text-text-secondary">Общие пространства, роли и сводка по людям, оплата за место.</span>
        </div>

        <p className="px-0.5 text-sm text-text-tertiary">
          «Работа с клиентами» включается в настройках пространства. Цены в BYN фиксированные. Платные тарифы можно
          попробовать 7 дней. При переходе на более дешёвый тариф лишнее уходит в архив и возвращается при оплате.
        </p>
      </section>
    </>
  )
}

/** Под тарифом выше действующего: пробный период, если его ещё не брали; оплаты пока нет. */
function PlanAction({ plan, name }: { plan: PaidPlan; name: string }) {
  const { canTrial } = useGate()
  const start = useStartTrial()
  const { showError, showSuccess } = useToast()
  if (plan === 'free') return null
  if (!canTrial) {
    return (
      <Button variant="secondary" disabled>
        Оплата появится позже
      </Button>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant="primary"
        loading={start.isPending}
        onClick={() =>
          start.mutate(plan, {
            onError: (e) => showError(describeError(e)),
            onSuccess: () => showSuccess(`Пробный «${name}» на ${TRIAL_DAYS} дней включён`),
          })
        }
      >
        Попробовать {TRIAL_DAYS} дней бесплатно
      </Button>
      <span className="text-center text-xs text-text-tertiary">Пробный — один раз на аккаунт. Оплата появится позже.</span>
    </div>
  )
}
