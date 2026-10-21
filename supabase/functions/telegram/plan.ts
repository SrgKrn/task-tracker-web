/**
 * Тариф пользователя для серверных функций: лимиты из plan_limits_of (миграции 0032, 0034).
 * Одинаковая копия лежит в каждой функции (telegram, timer-reminders, calendar, google) —
 * их выкладывают по отдельности; тест plan-copies.test.ts следит, чтобы копии совпадали.
 *
 * Если узнать тариф не вышло — пропускаем (fail-open): сбой не должен оборвать
 * напоминания тем, у кого всё оплачено. Обойти лимит так не выйдет: включить
 * интеграцию без тарифа не даст приложение.
 */

export interface PlanLimits {
  tg_reminders: boolean
  tg_digest: boolean
  gcal: boolean
  gdrive: boolean
  calendars: number | null
}

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>
}

const OPEN: PlanLimits = { tg_reminders: true, tg_digest: true, gcal: true, gdrive: true, calendars: null }
const TTL_MS = 60_000
const cache = new Map<string, { at: number; value: Promise<PlanLimits> }>()

export function limitsOf(db: RpcClient, userId: string): Promise<PlanLimits> {
  const hit = cache.get(userId)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value
  const value = Promise.resolve(db.rpc('plan_limits_of', { p_user: userId })).then(
    ({ data, error }) => {
      if (error || !data || typeof data !== 'object') {
        if (error) console.error('plan_limits_of', String((error as { message?: string }).message ?? error))
        return OPEN
      }
      const l = data as Record<string, unknown>
      return {
        tg_reminders: l.tg_reminders !== false,
        tg_digest: l.tg_digest !== false,
        gcal: l.gcal !== false,
        gdrive: l.gdrive !== false,
        calendars: typeof l.calendars === 'number' ? l.calendars : null,
      }
    },
    (e) => {
      console.error('plan_limits_of', String(e))
      return OPEN
    },
  )
  cache.set(userId, { at: Date.now(), value })
  return value
}

/** Подпись для отказа: что и на каком тарифе. */
export const PLAN_TEXT = {
  tg_digest: 'Итоги дня и недели и команды в Telegram — на тарифе «Плюс». Тарифы — в Semternity: Профиль → Тариф.',
  tg_reminders: 'Напоминания в Telegram — на тарифе «Плюс». Тарифы — в Semternity: Профиль → Тариф.',
  gcal: 'Встречи из календаря — на тарифе «Про». Тарифы — в Semternity: Профиль → Тариф.',
  gdrive: 'Google Диск — на тарифе «Про».',
}
