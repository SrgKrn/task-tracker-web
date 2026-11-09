import { describe, expect, it } from 'vitest'
import { NO_FILTERS, activeFilterCount, filterUsers, matchesPlan, sortUsers, usersCsv } from './adminUsers'
import type { AdminUser } from './queries/feedback'

const NOW = new Date('2026-11-09T12:00:00Z').getTime()
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

function user(p: Partial<AdminUser>): AdminUser {
  return {
    id: p.email ?? 'x',
    email: 'x@x',
    name: null,
    created_at: daysAgo(100),
    last_active: null,
    last_seen_version: null,
    last_seen_device: null,
    plan: 'free',
    effective: 'free',
    paid_until: null,
    trial: false,
    trial_used: false,
    workspaces: 1,
    tasks: 0,
    hours: 0,
    hours_30d: 0,
    feedback: 0,
    telegram: false,
    google: false,
    push: false,
    last_sign_in: null,
    banned_until: null,
    is_admin: false,
    ...p,
  }
}

const anna = user({ email: 'anna@x', name: 'Анна', created_at: daysAgo(2), last_active: daysAgo(0.1), plan: 'pro', effective: 'pro', hours: 12.5, tasks: 3 })
const boris = user({ email: 'boris@x', name: 'Борис', created_at: daysAgo(40), last_active: daysAgo(5), plan: 'plus', effective: 'plus', trial: true, hours: 3, tasks: 30 })
const vera = user({ email: 'vera@x', created_at: daysAgo(200), last_active: daysAgo(60), plan: 'lifetime', effective: 'pro', hours: 100 })
const gleb = user({ email: 'gleb@x', name: 'Глеб', created_at: daysAgo(1), plan: 'pro', effective: 'free', banned_until: daysAgo(-30) })
const all = [anna, boris, vera, gleb]

describe('фильтры пользователей', () => {
  it('без фильтров — все', () => {
    expect(filterUsers(all, NO_FILTERS, NOW)).toHaveLength(4)
  })

  it('поиск по почте и имени без учёта регистра', () => {
    expect(filterUsers(all, { ...NO_FILTERS, query: 'BOR' }, NOW)).toEqual([boris])
    expect(filterUsers(all, { ...NO_FILTERS, query: 'анн' }, NOW)).toEqual([anna])
  })

  it('тариф: истёкший платный считается «Старт», пожизненный — отдельно', () => {
    expect(matchesPlan(gleb, 'free')).toBe(true)
    expect(matchesPlan(gleb, 'pro')).toBe(false)
    expect(matchesPlan(vera, 'pro')).toBe(false)
    expect(matchesPlan(vera, 'lifetime')).toBe(true)
    expect(filterUsers(all, { ...NO_FILTERS, plan: 'trial' }, NOW)).toEqual([boris])
  })

  it('активность: сегодня, неделя, пропали (больше месяца или никогда)', () => {
    expect(filterUsers(all, { ...NO_FILTERS, activity: 'day' }, NOW)).toEqual([anna])
    expect(filterUsers(all, { ...NO_FILTERS, activity: 'week' }, NOW)).toEqual([anna, boris])
    expect(filterUsers(all, { ...NO_FILTERS, activity: 'idle' }, NOW)).toEqual([vera, gleb])
  })

  it('новые за неделю и заблокированные', () => {
    expect(filterUsers(all, { ...NO_FILTERS, newWeek: true }, NOW)).toEqual([anna, gleb])
    expect(filterUsers(all, { ...NO_FILTERS, banned: true }, NOW)).toEqual([gleb])
  })

  it('счётчик включённых фильтров не учитывает поиск', () => {
    expect(activeFilterCount({ ...NO_FILTERS, query: 'a' })).toBe(0)
    expect(activeFilterCount({ ...NO_FILTERS, plan: 'pro', newWeek: true })).toBe(2)
  })
})

describe('сортировка', () => {
  it('по активности: никогда не заходившие — в конце', () => {
    expect(sortUsers(all, 'active').map((u) => u.email)).toEqual(['anna@x', 'boris@x', 'vera@x', 'gleb@x'])
  })
  it('по регистрации, часам, задачам, имени', () => {
    expect(sortUsers(all, 'created')[0]).toBe(gleb)
    expect(sortUsers(all, 'hours')[0]).toBe(vera)
    expect(sortUsers(all, 'tasks')[0]).toBe(boris)
    expect(sortUsers(all, 'name').map((u) => u.name || u.email)).toEqual(['Анна', 'Борис', 'Глеб', 'vera@x'])
  })
  it('не меняет исходный список', () => {
    const copy = [...all]
    sortUsers(all, 'hours')
    expect(all).toEqual(copy)
  })
})

describe('CSV', () => {
  it('BOM, точка с запятой, шапка и строка на человека', () => {
    const csv = usersCsv([anna, boris])
    expect(csv.startsWith('﻿Почта;Имя;')).toBe(true)
    const lines = csv.trim().split('\r\n')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('anna@x;Анна;')
    expect(lines[1]).toContain(';12,5;')
  })
  it('экранирует точку с запятой и кавычки', () => {
    const csv = usersCsv([user({ email: 'q@x', name: 'Иван; "ИП"' })])
    expect(csv).toContain('q@x;"Иван; ""ИП""";')
  })
})
