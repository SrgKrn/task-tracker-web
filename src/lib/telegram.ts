import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import { UserError } from './Toast'

export interface TelegramStatus {
  /** бот создан и подключён к приложению на сервере */
  configured: boolean
  bot: string
  linked: { username: string; firstName: string; notifyLongTimer: boolean } | null
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
    setLongTimer: useMutation({
      onMutate: (on: boolean) =>
        patch((s) => (s.linked ? { ...s, linked: { ...s.linked, notifyLongTimer: on } } : s)),
      onError: refresh,
      mutationFn: async (on: boolean) => {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) throw new Error('Нужно войти заново')
        const { error } = await supabase
          .from('telegram_accounts')
          .update({ notify_long_timer: on })
          .eq('user_id', user.id)
        if (error) throw error
      },
      onSuccess: refresh,
    }),
  }
}
