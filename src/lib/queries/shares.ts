import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { activeWorkspaceId } from '../workspace'
import type { ClientSnapshot } from '../clientReport'

export interface ReportShare {
  id: string
  token: string
  title: string
  item_id: string | null
  period_from: string
  period_to: string
  views: number
  last_viewed_at: string | null
  revoked_at: string | null
  created_at: string
}

/** Ссылки на отчёты активного пространства — свежие сверху. */
export function useReportShares() {
  return useQuery({
    queryKey: ['report_shares'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_shares')
        .select('id, token, title, item_id, period_from, period_to, views, last_viewed_at, revoked_at, created_at')
        .eq('workspace_id', activeWorkspaceId())
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as ReportShare[]
    },
  })
}

export function useCreateShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { token: string; itemId: string; title: string; snapshot: ClientSnapshot }) => {
      const { error } = await supabase.from('report_shares').insert({
        token: input.token,
        item_id: input.itemId,
        title: input.title,
        period_from: input.snapshot.from,
        period_to: input.snapshot.to,
        data: input.snapshot,
        workspace_id: activeWorkspaceId(),
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report_shares'] }),
  })
}

/** Отозвать: ссылка перестаёт открываться, запись остаётся в списке как отозванная. */
export function useRevokeShare() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('report_shares').update({ revoked_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report_shares'] }),
  })
}

/** Отчёт по ссылке — для страницы клиента, без входа. null — ссылки нет или её отозвали. */
export async function fetchSharedReport(token: string): Promise<{ title: string; created_at: string; data: ClientSnapshot } | null> {
  const { data, error } = await supabase.rpc('get_shared_report', { p_token: token })
  if (error) throw error
  return (data as { title: string; created_at: string; data: ClientSnapshot } | null) ?? null
}
