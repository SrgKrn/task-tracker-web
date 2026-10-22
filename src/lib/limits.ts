/**
 * Лимиты тарифов — по чек-листу пользователя (артефакт «Лимиты тарифов Semternity»,
 * решения 20.10.2026). Источник правды — таблица plan_limits в базе (миграция 0032):
 * приложение получает лимиты своего тарифа через my_plan(). Здесь — та же таблица для
 * подписей и сообщений; тест сверяет её с миграцией, чтобы они не разошлись.
 */

import type { PaidPlan } from './plans'

export interface Limits {
  workspaces: number | null
  groups: number | null
  items: number | null
  tasks: number | null
  subtasks: number | null
  stages: number | null
  client_work: boolean
  canvas: boolean
  presets: boolean
  timer: boolean
  norm: boolean
  /** глубина истории учёта в днях; null — вся */
  history_days: number | null
  chronology_days: number | null
  tile: boolean
  mosaic: 'month' | 'month_year'
  focus: boolean
  methods: boolean
  export: boolean
  export_per_month: number | null
  export_drive: boolean
  export_extras: boolean
  logo: boolean
  rate: boolean
  billing: boolean
  share_links: number | null
  share_days: number | null
  push: boolean
  tg_reminders: boolean
  tg_digest: boolean
  gcal: boolean
  calendars: number | null
  gdrive: boolean
  storage_mb: number
  file_mb: number
  support: string
}

export const PLAN_LIMITS: Record<PaidPlan, Limits> = {
  free: {
    workspaces: 1, groups: 3, items: null, tasks: null, subtasks: null, stages: null,
    client_work: false, canvas: true, presets: true,
    timer: true, norm: true, history_days: 365, chronology_days: 90, tile: true, mosaic: 'month',
    focus: true, methods: true,
    export: false, export_per_month: 0, export_drive: false, export_extras: false, logo: false,
    rate: false, billing: false, share_links: 0, share_days: 30,
    push: true, tg_reminders: false, tg_digest: false, gcal: false, calendars: 0, gdrive: false,
    storage_mb: 200, file_mb: 10, support: 'в боте',
  },
  plus: {
    workspaces: 3, groups: 5, items: null, tasks: null, subtasks: null, stages: null,
    client_work: false, canvas: true, presets: true,
    timer: true, norm: true, history_days: null, chronology_days: null, tile: true, mosaic: 'month_year',
    focus: true, methods: true,
    export: true, export_per_month: null, export_drive: false, export_extras: true, logo: false,
    rate: false, billing: false, share_links: 0, share_days: 30,
    push: true, tg_reminders: true, tg_digest: true, gcal: false, calendars: 0, gdrive: false,
    storage_mb: 1024, file_mb: 30, support: 'в боте, 2 дня',
  },
  pro: {
    workspaces: 5, groups: null, items: null, tasks: null, subtasks: null, stages: null,
    client_work: true, canvas: true, presets: true,
    timer: true, norm: true, history_days: null, chronology_days: null, tile: true, mosaic: 'month_year',
    focus: true, methods: true,
    export: true, export_per_month: null, export_drive: true, export_extras: true, logo: true,
    rate: true, billing: true, share_links: null, share_days: 30,
    push: true, tg_reminders: true, tg_digest: true, gcal: true, calendars: null, gdrive: true,
    storage_mb: 3072, file_mb: 100, support: 'в течение рабочего дня',
  },
}

/** Пробный период платного тарифа и скидка за год — одно значение на всю сетку. */
export const TRIAL_DAYS = 7
export const YEARLY_DISCOUNT = 25

const PLAN_TITLE: Record<PaidPlan, string> = { free: '«Старте»', plus: '«Плюсе»', pro: '«Про»' }
const ORDER: PaidPlan[] = ['free', 'plus', 'pro']

function mb(v: number): string {
  return v >= 1024 && v % 1024 === 0 ? `${v / 1024} ГБ` : `${v} МБ`
}

/** «на «Старте» — 1, на «Плюсе» — 3, на «Про» — 5» */
function ladder(key: 'workspaces' | 'groups' | 'file_mb' | 'storage_mb'): string {
  return ORDER.map((p) => {
    const v = PLAN_LIMITS[p][key]
    const text = v === null ? 'без ограничений' : key.endsWith('_mb') ? mb(v) : String(v)
    return `на ${PLAN_TITLE[p]} — ${text}`
  }).join(', ')
}

/** Самый дешёвый тариф, где возможность есть. */
export function cheapestWith(key: keyof Limits): PaidPlan | null {
  return ORDER.find((p) => PLAN_LIMITS[p][key] === true) ?? null
}

/** Отказ базы plan_limit:<ключ> — понятным текстом. */
export function planLimitMessage(code: string): string | null {
  const key = code.replace(/^plan_limit:/, '')
  switch (key) {
    case 'workspaces':
      return `Больше пространств на вашем тарифе нельзя: ${ladder('workspaces')}. Тарифы — в Профиле.`
    case 'groups':
      return `Больше групп в этом пространстве на вашем тарифе нельзя: ${ladder('groups')}.`
    case 'client_work':
      return '«Работа с клиентами» — на тарифе «Про». Тарифы — в Профиле.'
    case 'logo':
      return 'Свой логотип в отчёте — на тарифе «Про». Тарифы — в Профиле.'
    case 'share_links':
      return 'Ссылка для клиента — на тарифе «Про».'
    case 'file_mb':
      return `Файл больше, чем позволяет тариф: ${ladder('file_mb')}.`
    case 'storage_mb':
      return `Место под файлы закончилось: ${ladder('storage_mb')}. Удалите ненужные файлы или смените тариф.`
    case 'trial_used':
      return 'Пробный период на этом аккаунте уже был.'
    case 'already_paid':
      return 'У вас уже платный тариф — пробный не нужен.'
    case 'trial_plan':
      return 'Попробовать можно «Плюс» или «Про».'
    default:
      return null
  }
}

/**
 * Где поместится ещё одно: самый дешёвый тариф, у которого лимит больше count.
 * null — дальше некуда (уже максимум).
 */
export function planForMore(key: 'workspaces' | 'groups', count: number): PaidPlan | null {
  return ORDER.find((p) => {
    const v = PLAN_LIMITS[p][key]
    return v === null || v > count
  }) ?? null
}

/** Можно ли добавить ещё одно при лимите limit (null — без ограничения). */
export function hasRoom(limit: number | null, count: number): boolean {
  return limit === null || count < limit
}
