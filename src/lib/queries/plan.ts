import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { PLAN_LIMITS, type Limits } from '../limits'
import type { PaidPlan, PlanId } from '../plans'

export interface UserPlan {
  /** записанный тариф: free | plus | pro | lifetime */
  plan: PlanId
  /** действующий: пожизненный — pro, платный с истёкшим сроком — free */
  effective: PaidPlan
  paid_until: string | null
  /** сейчас идёт пробный период */
  trial: boolean
  /** пробный уже был — второй раз нельзя */
  trial_used: boolean
  note: string | null
  limits: Limits
}

/**
 * Тариф и его лимиты — одним запросом my_plan(). Строку в user_plans пишет только
 * сервер (и пробный период); нет строки — «Старт». Тариф один на профиль: ключ в GLOBAL_KEYS.
 */
export function useUserPlan() {
  return useQuery({
    queryKey: ['user_plan'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<UserPlan> => {
      const { data, error } = await supabase.rpc('my_plan')
      if (error) throw error
      const p = (data ?? {}) as Partial<UserPlan>
      const effective = (p.effective ?? 'free') as PaidPlan
      return {
        plan: (p.plan ?? 'free') as PlanId,
        effective,
        paid_until: p.paid_until ?? null,
        trial: p.trial === true,
        trial_used: p.trial_used === true,
        note: p.note ?? null,
        limits: (p.limits as Limits | undefined) ?? PLAN_LIMITS[effective],
      }
    },
  })
}

/** Лимиты действующего тарифа; пока не загрузились — «Старт», чтобы ничего не открыть лишнего. */
export function useLimits(): Limits {
  const { data } = useUserPlan()
  return data?.limits ?? PLAN_LIMITS.free
}

/** Пробный период «Плюса» или «Про» на 7 дней — один раз на аккаунт. */
export function useStartTrial() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (plan: 'plus' | 'pro') => {
      const { error } = await supabase.rpc('start_trial', { p_plan: plan })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_plan'] }),
  })
}
