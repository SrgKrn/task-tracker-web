import { useQuery } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { todayStr } from './period'

/** Блок «Время»: факт дня и цитата под его контекст. Считает и фиксирует на день сервер. */
export interface DayInsight {
  fact: string
  kind: string
  quote: { text: string; author: string; source: string | null } | null
}

/**
 * Блок дня с сервера (функция telegram, действие insight) — тот же, что придёт в вечерних
 * «Итогах дня». Утром факт — о вчерашнем дне. null — блок выключен или сказать нечего.
 */
export function useDayInsight(enabled: boolean) {
  const day = todayStr()
  return useQuery({
    queryKey: ['day_insight', day],
    enabled,
    // на день блок не меняется — перечитывать незачем
    staleTime: Infinity,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('telegram', { body: { action: 'insight' } })
      if (error) throw error
      return (data?.insight ?? null) as DayInsight | null
    },
  })
}

/** часовые пояса для выбора в настройках; старые браузеры — хотя бы текущий и Минск */
export function timeZoneOptions(current: string): string[] {
  const device = Intl.DateTimeFormat().resolvedOptions().timeZone
  let all: string[] = []
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch {
    all = []
  }
  return [...new Set([current, device, 'Europe/Minsk', ...all])].filter(Boolean)
}
