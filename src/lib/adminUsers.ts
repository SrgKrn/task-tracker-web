import type { AdminUser } from './queries/feedback'

/*
 * Админка, вкладка «Люди» (0.66): поиск, фильтры, сортировка и выгрузка в CSV.
 * Чистые функции — без React и сети, чтобы проверялись тестами.
 */

export type PlanFilter = 'all' | 'free' | 'plus' | 'pro' | 'lifetime' | 'trial'
export type ActivityFilter = 'all' | 'day' | 'week' | 'month' | 'idle'
export type UserSort = 'active' | 'created' | 'hours' | 'tasks' | 'name'

export interface UserFilters {
  query: string
  plan: PlanFilter
  activity: ActivityFilter
  /** зарегистрировались за последние 7 дней */
  newWeek: boolean
  banned: boolean
}

export const NO_FILTERS: UserFilters = { query: '', plan: 'all', activity: 'all', newWeek: false, banned: false }

const DAY = 86_400_000

export const PLAN_FILTER_LABEL: Record<PlanFilter, string> = {
  all: 'Все',
  free: 'Старт',
  plus: 'Плюс',
  pro: 'Про',
  lifetime: 'Навсегда',
  trial: 'Пробный',
}

export const ACTIVITY_LABEL: Record<ActivityFilter, string> = {
  all: 'Любая',
  day: 'Сегодня',
  week: 'За неделю',
  month: 'За месяц',
  idle: 'Пропали',
}

export const SORT_LABEL: Record<UserSort, string> = {
  active: 'По активности',
  created: 'По регистрации',
  hours: 'По часам',
  tasks: 'По задачам',
  name: 'По имени',
}

function age(iso: string | null, now: number): number {
  return iso ? now - new Date(iso).getTime() : Infinity
}

export function matchesPlan(u: AdminUser, plan: PlanFilter): boolean {
  if (plan === 'all') return true
  if (plan === 'lifetime') return u.plan === 'lifetime'
  if (plan === 'trial') return u.trial && u.effective !== 'free'
  // «Плюс» и «Про» — действующий тариф без пожизненного; «Старт» — всё, что сейчас бесплатно
  return u.effective === plan && u.plan !== 'lifetime'
}

export function matchesActivity(u: AdminUser, activity: ActivityFilter, now = Date.now()): boolean {
  const a = age(u.last_active, now)
  switch (activity) {
    case 'all':
      return true
    case 'day':
      return a <= DAY
    case 'week':
      return a <= 7 * DAY
    case 'month':
      return a <= 30 * DAY
    case 'idle':
      return a > 30 * DAY
  }
}

/** сколько фильтров включено, кроме поиска — для подписи кнопки «Фильтр · 2» */
export function activeFilterCount(f: UserFilters): number {
  return (f.plan !== 'all' ? 1 : 0) + (f.activity !== 'all' ? 1 : 0) + (f.newWeek ? 1 : 0) + (f.banned ? 1 : 0)
}

export function filterUsers(list: AdminUser[], f: UserFilters, now = Date.now()): AdminUser[] {
  const q = f.query.trim().toLowerCase()
  return list.filter(
    (u) =>
      (!q || u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q)) &&
      matchesPlan(u, f.plan) &&
      matchesActivity(u, f.activity, now) &&
      (!f.newWeek || age(u.created_at, now) <= 7 * DAY) &&
      (!f.banned || !!u.banned_until),
  )
}

export function sortUsers(list: AdminUser[], sort: UserSort): AdminUser[] {
  const time = (iso: string | null) => (iso ? new Date(iso).getTime() : -Infinity)
  const name = (u: AdminUser) => (u.name || u.email).toLocaleLowerCase('ru')
  const by: Record<UserSort, (a: AdminUser, b: AdminUser) => number> = {
    active: (a, b) => time(b.last_active) - time(a.last_active),
    created: (a, b) => time(b.created_at) - time(a.created_at),
    hours: (a, b) => b.hours - a.hours,
    tasks: (a, b) => b.tasks - a.tasks,
    name: (a, b) => name(a).localeCompare(name(b), 'ru'),
  }
  // при равенстве — свежие регистрации выше: порядок не прыгает между загрузками
  return [...list].sort((a, b) => by[sort](a, b) || time(b.created_at) - time(a.created_at))
}

/* ── CSV ────────────────────────────────────────────────────────────── */

function cell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'boolean' ? (v ? 'да' : '') : typeof v === 'number' ? String(v).replace('.', ',') : v
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function date(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

const CSV_COLUMNS: [string, (u: AdminUser) => string | number | boolean | null][] = [
  ['Почта', (u) => u.email],
  ['Имя', (u) => u.name],
  ['Регистрация', (u) => date(u.created_at)],
  ['Последний вход', (u) => date(u.last_sign_in)],
  ['Последняя активность', (u) => date(u.last_active)],
  ['Тариф', (u) => u.plan],
  ['Действует', (u) => u.effective],
  ['Оплачен до', (u) => date(u.paid_until)],
  ['Пробный', (u) => u.trial],
  ['Пространств', (u) => u.workspaces],
  ['Задач', (u) => u.tasks],
  ['Часов', (u) => u.hours],
  ['Часов за 30 дней', (u) => u.hours_30d],
  ['Обращений', (u) => u.feedback],
  ['Telegram', (u) => u.telegram],
  ['Google', (u) => u.google],
  ['Пуши', (u) => u.push],
  ['Заблокирован до', (u) => date(u.banned_until)],
  ['Админ', (u) => u.is_admin],
  ['Версия', (u) => u.last_seen_version],
  ['Устройство', (u) => u.last_seen_device],
]

/** CSV для Excel: точка с запятой, BOM — чтобы кириллица открылась без мастера импорта */
export function usersCsv(list: AdminUser[]): string {
  const head = CSV_COLUMNS.map(([h]) => h).join(';')
  const rows = list.map((u) => CSV_COLUMNS.map(([, get]) => cell(get(u))).join(';'))
  return '﻿' + [head, ...rows].join('\r\n') + '\r\n'
}
