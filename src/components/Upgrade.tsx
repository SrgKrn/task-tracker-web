import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from './ui'
import { PLANS, formatPrice, monthlyPrice, type PaidPlan } from '../lib/plans'
import { TRIAL_DAYS, hasRoom, planForMore } from '../lib/limits'
import { useStartTrial, useUserPlan } from '../lib/queries/plan'
import { describeError, useToast } from '../lib/Toast'

const NAME: Record<PaidPlan, string> = { free: '«Старте»', plus: '«Плюсе»', pro: '«Про»' }

/** Тариф и доступ к пробному периоду — для подсказок «Доступно на …». */
export function useGate() {
  const { data } = useUserPlan()
  const effective = data?.effective ?? 'free'
  return {
    plan: data,
    effective,
    /** пробный ещё не брали и сейчас «Старт» */
    canTrial: !!data && !data.trial_used && effective === 'free',
  }
}

/**
 * Закрытое место: что недоступно, на каком тарифе есть и почём, «Попробовать 7 дней»
 * (если пробный ещё не брали) и «Тарифы». Ставится вместо кнопки или блока.
 */
export function UpgradeNote({
  need,
  what,
  className = '',
}: {
  /** самый дешёвый тариф, где это есть */
  need: Exclude<PaidPlan, 'free'>
  /** «Второе пространство», «Отчёт PDF и Excel» */
  what: string
  className?: string
}) {
  const { canTrial } = useGate()
  const start = useStartTrial()
  const { showError, showSuccess } = useToast()
  const info = PLANS.find((p) => p.id === need)!
  const price = formatPrice(monthlyPrice(info, 'usd', 'year'), 'usd')

  return (
    <div className={`flex flex-col gap-2.5 rounded-md border border-dashed border-border-strong px-3.5 py-3 ${className}`}>
      <p className="text-sm text-text">
        <span className="font-medium">{what}</span> — на {NAME[need]}, от {price} в месяц при оплате за год.
      </p>
      <div className="flex flex-wrap gap-2">
        {canTrial && (
          <Button
            variant="primary"
            loading={start.isPending}
            onClick={() =>
              start.mutate(need, {
                onError: (e) => showError(describeError(e)),
                onSuccess: () => showSuccess(`Пробный ${info.name === 'Про' ? '«Про»' : '«Плюс»'} на ${TRIAL_DAYS} дней включён`),
              })
            }
          >
            Попробовать {TRIAL_DAYS} дней
          </Button>
        )}
        <Link
          to="/settings/tariff"
          className="inline-flex min-h-[var(--tap)] items-center rounded-sm px-3 text-sm font-medium text-accent-text"
        >
          Тарифы
        </Link>
      </div>
    </div>
  )
}

/** Хватает ли места ещё на одно (пространство, группу) и где оно появится. */
export function useRoom(key: 'workspaces' | 'groups', count: number) {
  const { plan } = useGate()
  // пока тариф грузится — не прячем: у пожизненного кнопка не должна мигать, а обойти лимит не даст база
  const limit = plan ? plan.limits[key] : null
  const allowed = hasRoom(limit, count)
  return { allowed, limit, need: allowed ? null : planForMore(key, count) }
}

/** Упёрлись в счётный лимит: подсказка с тарифом или — если выше некуда — просто сколько можно. */
export function RoomNote({ room, what, max }: { room: ReturnType<typeof useRoom>; what: string; max: string }) {
  if (room.allowed) return null
  if (room.need && room.need !== 'free') return <UpgradeNote need={room.need} what={what} />
  return <p className="px-0.5 text-sm text-text-secondary">{max}</p>
}

/** Целый раздел по тарифу: можно — сам раздел, нельзя — подсказка с тарифом. Пока грузится — раздел. */
export function Gated({
  allow,
  need,
  what,
  children,
}: {
  allow: (limits: NonNullable<ReturnType<typeof useGate>['plan']>['limits']) => boolean
  need: Exclude<PaidPlan, 'free'>
  what: string
  children: ReactNode
}) {
  const { plan } = useGate()
  if (plan && !allow(plan.limits)) return <UpgradeNote need={need} what={what} />
  return <>{children}</>
}
