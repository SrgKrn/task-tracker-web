import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { UserError } from './Toast'

export interface TelegramStatus {
  /** бот создан и подключён к приложению на сервере */
  configured: boolean
  bot: string
  linked: {
    username: string
    firstName: string
    notifyLongTimer: boolean
    dailySummary: boolean
    weeklySummary: boolean
    /** час местного времени для сводки */
    summaryHour: number
    notifyMeetings: boolean
  } | null
}

type Linked = NonNullable<TelegramStatus['linked']>

/** поля настроек в приложении → колонки telegram_accounts */
const COLUMN: Record<'notifyLongTimer' | 'dailySummary' | 'weeklySummary' | 'summaryHour' | 'notifyMeetings', string> = {
  notifyLongTimer: 'notify_long_timer',
  dailySummary: 'daily_summary',
  weeklySummary: 'weekly_summary',
  summaryHour: 'summary_hour',
  notifyMeetings: 'notify_meetings',
}

/** Вся работа с Telegram — через серверную функцию: токен бота в приложение не попадает. */
async function call<T>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('telegram', { body: { action, ...extra } })
  if (error) {
    // у ошибок функции текст лежит в теле ответа — достаём его, а не «non-2xx status code»
    const ctx = (error as { context?: Response }).context
    const body = ctx ? await ctx.json().catch(() => null) : null
    throw body?.error ? new UserError(body.error) : error
  }
  return data as T
}

export function useTelegramStatus() {
  return useQuery({
    queryKey: ['telegram_status'],
    queryFn: () => call<TelegramStatus>('status'),
    // вернулись из Telegram после «Запустить» — статус перечитается сам
    refetchOnWindowFocus: true,
  })
}

/**
 * Ссылка t.me/бот?start=код берётся заранее, пока карточка на экране: окно, открытое
 * после ожидания сервера, iPhone блокирует. Код живёт 30 минут — ссылку обновляем раньше.
 */
export function useTelegramLink(enabled: boolean) {
  return useQuery({
    queryKey: ['telegram_link'],
    enabled,
    staleTime: 20 * 60 * 1000,
    refetchInterval: 20 * 60 * 1000,
    queryFn: () =>
      call<{ url: string }>('link', { timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
  })
}

export function useTelegramActions() {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['telegram_status'] })
  // экран меняется сразу, не дожидаясь серверной функции: первый её вызов «просыпается»
  // несколько секунд, и казалось, что кнопка не сработала
  const patch = (fn: (s: TelegramStatus) => TelegramStatus) =>
    qc.setQueryData<TelegramStatus>(['telegram_status'], (s) => (s ? fn(s) : s))
  return {
    test: useMutation({ mutationFn: () => call('test') }),
    unlink: useMutation({
      mutationFn: () => call('unlink'),
      onSuccess: () => {
        patch((s) => ({ ...s, linked: null }))
        qc.removeQueries({ queryKey: ['telegram_link'] })
        refresh()
      },
    }),
    /** любая настройка уведомлений — переключатель меняется сразу, сервер догоняет */
    update: useMutation({
      onMutate: (fields: Partial<Pick<Linked, keyof typeof COLUMN>>) =>
        patch((s) => (s.linked ? { ...s, linked: { ...s.linked, ...fields } } : s)),
      onError: refresh,
      mutationFn: async (fields: Partial<Pick<Linked, keyof typeof COLUMN>>) => {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Нужно войти заново')
        const row = Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [COLUMN[k as keyof typeof COLUMN], v]),
        )
        const { error } = await supabase.from('telegram_accounts').update(row).eq('user_id', user.id)
        if (error) throw error
      },
      onSuccess: refresh,
    }),
    digestNow: useMutation({ mutationFn: () => call('digest_now') }),
  }
}
