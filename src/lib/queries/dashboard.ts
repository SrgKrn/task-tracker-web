import { useQuery } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import type { TimeEntry } from '../types'

/** time_entries logged (created_at) within [fromISO, toISO) — the "fact" side of the dashboard. */
export function useTimeEntriesInRange(fromISO: string, toISO: string) {
  return useQuery({
    queryKey: ['time_entries_range', fromISO, toISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .gte('created_at', fromISO)
        .lt('created_at', toISO)
      if (error) throw error
      return data as TimeEntry[]
    },
  })
}
