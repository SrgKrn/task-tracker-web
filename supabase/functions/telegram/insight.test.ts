import { describe, expect, it } from 'vitest'
import {
  chooseQuote,
  collectFacts,
  localDateHour,
  pickClientGroup,
  pickFact,
  plural,
  renderBlock,
  shiftDate,
  type EntryRow,
  type Fact,
  type InsightInput,
  type TaskInfo,
} from './insight'

const D = '2026-10-15' // четверг
const ROMASHKA = { id: 'c1', name: 'Ромашка' }
const ALFA = { id: 'c2', name: 'Альфа' }

function task(id: string, over: Partial<TaskInfo> = {}): TaskInfo {
  return { id, name: id, parent_id: null, planned_hours: 0, start_date: null, end_date: null, completed_at: null, client: null, ...over }
}

/** запись таймера: день, час начала по Минску (UTC+3), минуты */
function timer(date: string, hour: number, minutes: number, taskId = 't1'): EntryRow {
  const started = new Date(Date.parse(`${date}T00:00:00Z`) + (hour - 3) * 3_600_000).toISOString()
  return { task_id: taskId, duration_seconds: minutes * 60, effective_date: date, entry_type: 'timer', started_at: started }
}

function input(entries: EntryRow[], tasks: TaskInfo[] = [task('t1')], over: Partial<InsightInput> = {}): InsightInput {
  return { date: D, dayWord: 'Сегодня', timeZone: 'Europe/Minsk', workDaysPerWeek: 5, entries, tasks, ...over }
}

/** рабочие дни назад от D: по одной записи в день */
function workdays(count: number, minutes: number, hour = 10, taskId = 't1', end = D): EntryRow[] {
  const out: EntryRow[] = []
  for (let d = end; out.length < count; d = shiftDate(d, -1)) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay()
    if (wd === 0 || wd === 6) continue
    out.push(timer(d, hour, minutes, taskId))
  }
  return out
}

const kinds = (facts: Fact[]) => facts.map((f) => f.kind)
const find = (facts: Fact[], kind: string) => facts.find((f) => f.kind === kind)

describe('склонения', () => {
  it('задачи и дни', () => {
    expect([1, 3, 5, 11, 21, 22, 25, 111].map((n) => `${n} ${plural(n, ['задача', 'задачи', 'задач'])}`)).toEqual([
      '1 задача', '3 задачи', '5 задач', '11 задач', '21 задача', '22 задачи', '25 задач', '111 задач',
    ])
    expect([1, 2, 5, 12, 14].map((n) => plural(n, ['день', 'дня', 'дней']))).toEqual(['день', 'дня', 'дней', 'дней', 'дней'])
  })
})

describe('часовой пояс', () => {
  it('23:30 и 00:30 по Минску — разные дни', () => {
    expect(localDateHour(Date.parse('2026-10-15T20:30:00Z'), 'Europe/Minsk')).toEqual({ date: '2026-10-15', hour: 23 })
    expect(localDateHour(Date.parse('2026-10-15T21:30:00Z'), 'Europe/Minsk')).toEqual({ date: '2026-10-16', hour: 0 })
  })

  it('спринт, закрытый в 23:30, — сегодня; в 00:30 — уже завтра', () => {
    const late = task('s', { completed_at: '2026-10-15T20:30:00Z', planned_hours: 10, client: ROMASHKA })
    expect(kinds(collectFacts(input([], [late])))).toContain('sprint_closed')
    const afterMidnight = task('s', { completed_at: '2026-10-15T21:30:00Z', planned_hours: 10 })
    expect(kinds(collectFacts(input([], [afterMidnight])))).not.toContain('sprint_closed')
    expect(kinds(collectFacts(input([], [afterMidnight], { date: '2026-10-16' })))).toContain('sprint_closed')
  })
})

describe('ритм и рекорды', () => {
  it('пользователь без задач и записей — фактов нет, ничего не падает', () => {
    expect(collectFacts(input([], []))).toEqual([])
    expect(pickFact([], null)).toBeNull()
  })

  it('серия рабочих дней: от 5, выходные не рвут', () => {
    expect(find(collectFacts(input(workdays(4, 60))), 'streak')).toBeUndefined()
    expect(find(collectFacts(input(workdays(7, 60))), 'streak')?.text).toBe('7-й рабочий день подряд с учётом')
  })

  it('серия кратная пяти весит больше', () => {
    const w10 = find(collectFacts(input(workdays(10, 60))), 'streak')!.weight
    const w9 = find(collectFacts(input(workdays(9, 60, 10, 't1', shiftDate(D, -1)).concat(timer(D, 10, 0)))), 'streak')
    expect(w9).toBeUndefined() // день без учёта — серии нет
    const w11 = find(collectFacts(input(workdays(11, 60))), 'streak')!.weight
    expect(w10).toBeGreaterThan(w11)
  })

  it('продуктивные часы скрыты, пока данных мало', () => {
    // 8 рабочих дней по 3 часа (24 ч) — история меньше 14 дней
    expect(find(collectFacts(input(workdays(8, 180))), 'peak_hours')).toBeUndefined()
    // 20 дней по 30 минут — меньше 20 часов
    expect(find(collectFacts(input(workdays(20, 30))), 'peak_hours')).toBeUndefined()
  })

  it('продуктивные часы — в местном времени', () => {
    const entries = workdays(20, 90, 10).concat(workdays(20, 30, 15))
    expect(find(collectFacts(input(entries)), 'peak_hours')?.text).toMatch(/^Лучше всего у вас идёт с 10:00 до 12:00 — на эти два часа пришлось \d+% учёта за 4 недели$/)
  })

  it('самый плотный день недели', () => {
    const entries = workdays(20, 120)
    // четверги — по 6 часов
    for (let i = 0; i < 4; i++) entries.push(timer(shiftDate(D, -7 * i), 14, 240))
    expect(find(collectFacts(input(entries)), 'best_weekday')?.text).toBe('Четверг — ваш самый плотный день: в среднем 6 ч за последние 4 недели')
  })

  it('самый длинный фокус за месяц', () => {
    const entries = workdays(15, 50, 10, 't1', shiftDate(D, -1)).concat(timer(D, 10, 160))
    expect(find(collectFacts(input(entries)), 'long_focus')?.text).toBe('Сегодня был самый длинный отрезок работы без перерыва за месяц: 2 ч 40 мин')
    // был отрезок длиннее неделю назад — факта нет
    entries.push(timer(shiftDate(D, -7), 13, 170))
    expect(find(collectFacts(input(entries)), 'long_focus')).toBeUndefined()
  })

  it('рекорд дня за месяц и за 3 месяца', () => {
    const month = workdays(20, 180, 10, 't1', shiftDate(D, -1)).concat(timer(D, 9, 555))
    expect(find(collectFacts(input(month, undefined, { dayWord: 'Вчера' })), 'day_record')?.text).toBe('Вчера — самый насыщенный день за месяц: 9 ч 15 мин')
    const quarter = workdays(65, 180, 10, 't1', shiftDate(D, -1)).concat(timer(D, 9, 555))
    expect(find(collectFacts(input(quarter)), 'day_record')?.text).toBe('Сегодня — самый насыщенный день за 3 месяца: 9 ч 15 мин')
  })

  it('рубеж часов — только в день, когда его прошли', () => {
    const before = workdays(33, 180, 10, 't1', shiftDate(D, -1)) // 99 ч
    expect(find(collectFacts(input(before.concat(timer(D, 10, 120)))), 'hours_milestone')?.text).toBe('Сегодня в трекере набралось 100 часов учёта')
    expect(find(collectFacts(input(before.concat(timer(D, 10, 30)))), 'hours_milestone')).toBeUndefined()
  })

  it('ручная правка с минусом уменьшает день', () => {
    const e = workdays(7, 60)
    e.push({ task_id: 't1', duration_seconds: -3600, effective_date: D, entry_type: 'manual_adjustment', started_at: null })
    expect(find(collectFacts(input(e)), 'streak')).toBeUndefined()
  })
})

describe('клиенты и спринты', () => {
  const tasks = [task('r', { client: ROMASHKA }), task('a', { client: ALFA })]

  it('доля клиента в месяце', () => {
    const e = [timer('2026-10-02', 10, 600, 'r'), timer('2026-10-05', 10, 300, 'a'), timer(D, 10, 100, 'r')]
    expect(find(collectFacts(input(e, tasks)), 'client_share')?.text).toBe('Больше всего времени в октябре — «Ромашка»: 70% учёта месяца')
    // в начале месяца данных мало
    expect(find(collectFacts(input(e, tasks, { date: '2026-10-03' })), 'client_share')).toBeUndefined()
  })

  it('подзадача относится к клиенту спринта', () => {
    const t = [task('s', { client: ROMASHKA }), task('sub', { parent_id: 's' }), task('a', { client: ALFA })]
    const e = [timer('2026-10-06', 10, 600, 'sub'), timer('2026-10-07', 10, 100, 'a')]
    expect(find(collectFacts(input(e, t)), 'client_share')?.text).toContain('«Ромашка»: 86%')
  })

  it('спринт идёт ровно', () => {
    const s = task('s', { name: 'Спринт 7', planned_hours: 40, start_date: '2026-10-01', end_date: '2026-10-31', client: ROMASHKA })
    const e = [timer('2026-10-10', 10, 20 * 60, 's')] // 50% плана при 15/31 срока
    expect(find(collectFacts(input(e, [s])), 'sprint_on_track')?.text).toBe('«Спринт 7» (Ромашка): 50% плана при 48% срока — идёте ровно')
  })

  it('план спринта почти выработан', () => {
    const s = task('s', { name: 'Спринт 7', planned_hours: 40, start_date: '2026-10-01', end_date: '2026-10-31', client: ROMASHKA })
    const e = [timer('2026-10-10', 10, 36 * 60, 's')]
    expect(find(collectFacts(input(e, [s])), 'sprint_burn')?.text).toBe('«Спринт 7» (Ромашка): выработано 90% плана, а до срока ещё 16 дней')
    expect(find(collectFacts(input(e, [s])), 'sprint_on_track')).toBeUndefined()
  })

  it('закрытый спринт — с фактом и планом', () => {
    const s = task('s', { name: 'Спринт 6', planned_hours: 40, completed_at: '2026-10-15T09:00:00Z', client: ROMASHKA })
    const sub = task('sub', { parent_id: 's' })
    const e = [timer('2026-10-01', 10, 30 * 60, 's'), timer('2026-10-02', 10, 8 * 60, 'sub')]
    const f = find(collectFacts(input(e, [s, sub])), 'sprint_closed')!
    expect(f.text).toBe('Сегодня закрыт «Спринт 6» (Ромашка): 38 ч при плане 40 ч')
    expect(f.weight).toBe(85)
  })

  it('рубеж часов по клиенту', () => {
    const e = [timer('2026-09-01', 10, 49 * 60, 'r'), timer(D, 10, 90, 'r')]
    expect(find(collectFacts(input(e, tasks)), 'client_hours')?.text).toBe('По клиенту «Ромашка» набралось 50 часов учёта')
  })

  it('возвращение к клиенту после паузы', () => {
    const e = [timer('2026-09-23', 10, 60, 'a'), timer(D, 10, 60, 'a')]
    expect(find(collectFacts(input(e, tasks)), 'client_return')?.text).toBe('Сегодня снова работа по «Альфа» — после паузы в 3 недели')
    const short = [timer('2026-10-05', 10, 60, 'a'), timer(D, 10, 60, 'a')]
    expect(find(collectFacts(input(short, tasks)), 'client_return')).toBeUndefined()
  })
})

describe('выбор факта', () => {
  const facts: Fact[] = [
    { kind: 'streak', text: 'a', weight: 40 },
    { kind: 'client_share', text: 'b', weight: 20 },
    { kind: 'hours_milestone', text: 'c', weight: 90 },
  ]
  it('самый весомый', () => {
    expect(pickFact(facts, null)?.kind).toBe('hours_milestone')
  })
  it('вчерашний контекст не повторяется', () => {
    expect(pickFact(facts, 'hours_milestone')?.kind).toBe('streak')
    expect(pickFact([facts[0]], 'streak')).toBeNull()
  })
  it('темы фильтруются', () => {
    const e = workdays(7, 60)
    expect(collectFacts(input(e), ['clients'])).toEqual([])
  })
})

describe('выбор цитаты', () => {
  const quotes = [
    { id: 1, tags: ['streak', 'rhythm'] },
    { id: 2, tags: ['streak', 'rhythm'] },
    { id: 3, tags: ['rhythm'] },
    { id: 4, tags: ['general'] },
    { id: 5, tags: ['clients'] },
  ]
  const first = () => 0

  it('сначала по контексту факта', () => {
    expect(chooseQuote(quotes, new Set(), 'streak', first)).toEqual({ id: 1, reset: false })
  })
  it('не повторяется, пока есть новые', () => {
    expect(chooseQuote(quotes, new Set([1]), 'streak', first)).toEqual({ id: 2, reset: false })
  })
  it('контекст исчерпан — тема, потом general', () => {
    expect(chooseQuote(quotes, new Set([1, 2]), 'streak', first)).toEqual({ id: 3, reset: false })
    expect(chooseQuote(quotes, new Set([1, 2, 3]), 'streak', first)).toEqual({ id: 4, reset: false })
    expect(chooseQuote(quotes, new Set(), 'peak_hours', first)).toEqual({ id: 1, reset: false })
  })
  it('пустой тег — откат на general', () => {
    expect(chooseQuote([{ id: 9, tags: ['general'] }], new Set(), 'sprint_burn', first)).toEqual({ id: 9, reset: false })
  })
  it('увидел все подходящие — новый цикл', () => {
    expect(chooseQuote(quotes, new Set([1, 2, 3, 4]), 'streak', first)).toEqual({ id: 1, reset: true })
  })
  it('цитаты не повторяются за полный цикл', () => {
    const seen = new Set<number>()
    let rnd = 0.37
    const random = () => (rnd = (rnd * 9301 + 49297) % 233280 / 233280)
    for (let i = 0; i < 4; i++) {
      const r = chooseQuote(quotes, seen, 'streak', random)!
      expect(r.reset).toBe(false)
      expect(seen.has(r.id)).toBe(false)
      seen.add(r.id)
    }
  })
  it('цитат нет — null', () => {
    expect(chooseQuote([], new Set(), 'streak')).toBeNull()
  })
})

describe('группа клиентов', () => {
  const g = (id: string, name: string, show = true) => ({ id, name, show_in_list: show })
  it('«Проекты» — даже если «Разделы» стоят первыми', () => {
    expect(pickClientGroup([g('s', 'Разделы'), g('p', 'Проекты')], () => 0)?.id).toBe('p')
  })
  it('без такого имени — группа с цветными значениями', () => {
    expect(pickClientGroup([g('a', 'Отделы'), g('b', 'Заказчики')], (id) => (id === 'b' ? 3 : 0))?.id).toBe('b')
  })
  it('иначе — первая из видных в строке', () => {
    expect(pickClientGroup([g('a', 'Отделы', false), g('b', 'Заказчики')], () => 0)?.id).toBe('b')
    expect(pickClientGroup([], () => 0)).toBeNull()
  })
})

describe('текст блока', () => {
  it('с цитатой и без', () => {
    expect(renderBlock('Факт', { text: 'Текст', author: 'Автор', source: 'Книга' })).toBe('💡 Факт\n\n«Текст»\n— Автор, Книга')
    expect(renderBlock('Факт', null)).toBe('💡 Факт')
  })
})
