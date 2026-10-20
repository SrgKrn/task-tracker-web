import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { PlanId } from '../plans'

export interface UserPlan {
  plan: PlanId
  paid_until: string | null
  note: string | null
}

/**
 * Тариф пользователя. Строку в user_plans пишет только сервер; нет строки — «Старт».
 * Тариф один на профиль, не на пространство: ключ в GLOBAL_KEYS.
 */
export function useUserPlan() {
  return useQuery({
    queryKey: ['user_plan'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<UserPlan> => {
      const { data, error } = await supabase.from('user_plans').select('plan, paid_until, note').maybeSingle()
      if (error) throw error
      return (data as UserPlan | null) ?? { plan: 'free', paid_until: null, note: null }
    },
  })
}
