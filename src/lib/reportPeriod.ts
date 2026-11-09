/**
 * Период отчёта на экране «Сводка» (0.66): быстрые пресеты, шаг стрелками и подпись.
 *
 * Период помнит свою «единицу»: месяц листается месяцами, неделя — неделями, «последние
 * 30 дней» — отрезками по 30 дней. Так стрелки ‹ › делают то, чего от них ждут, а не
 * сдвигают произвольный отрезок на его длину.
 */
import { addDays, toDateString } from './period'

export type PeriodUnit = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'range'

export interface ReportPeriod {
  unit: PeriodUnit
  from: string
  to: string
}

export type PresetKey =
  | 'today'
  | 'yesterday'
  | 'week'
  | 'last_week'
  | 'month'
  | 'last_month'
  | 'quarter'
  | 'last_quarter'
  | 'year'
  | 'last_year'
  | 'd7'
  | 'd30'
  | 'd90'

export interface PresetDef {
  key: PresetKey
  label: string
  /** короткая подпись — для чипов на телефоне */
  short: string
}

export const PRESETS: PresetDef[] = [
  { key: 'today', label: 'Сегодня', short: 'Сегодня' },
  { key: 'yesterday', label: 'Вчера', short: 'Вчера' },
  { key: 'week', label: 'Эта неделя', short: 'Неделя' },
  { key: 'last_week', label: 'Прошлая неделя', short: 'Пр. неделя' },
  { key: 'month', label: 'Этот месяц', short: 'Месяц' },
  { key: 'last_month', label: 'Прошлый месяц', short: 'Пр. месяц' },
  { key: 'quarter', label: 'Этот квартал', short: 'Квартал' },
  { key: 'last_quarter', label: 'Прошлый квартал', short: 'Пр. квартал' },
  { key: 'year', label: 'Этот год', short: 'Год' },
  { key: 'last_year', label: 'Прошлый год', short: 'Пр. год' },
  { key: 'd7', label: 'Последние 7 дней', short: '7 дней' },
  { key: 'd30', label: 'Последние 30 дней', short: '30 дней' },
  { key: 'd90', label: 'Последние 90 дней', short: '90 дней' },
]

/** чипы на виду; остальное — в выборе периода */
export const QUICK_PRESETS: PresetKey[] = ['today', 'week', 'month', 'last_month', 'quarter', 'year']

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function mondayOf(iso: string): string {
  const d = parse(iso)
  return addDays(iso, -((d.getDay() + 6) % 7))
}

function monthRange(y: number, m: number): { from: string; to: string } {
  return { from: toDateString(new Date(y, m, 1)), to: toDateString(new Date(y, m + 1, 0)) }
}

function quarterRange(y: number, q: number): { from: string; to: string } {
  return { from: toDateString(new Date(y, q * 3, 1)), to: toDateString(new Date(y, q * 3 + 3, 0)) }
}

export function presetPeriod(key: PresetKey, today: string): ReportPeriod {
  const t = parse(today)
  const y = t.getFullYear()
  const m = t.getMonth()
  const q = Math.floor(m / 3)
  switch (key) {
    case 'today':
      return { unit: 'day', from: today, to: today }
    case 'yesterday': {
      const d = addDays(today, -1)
      return { unit: 'day', from: d, to: d }
    }
    case 'week': {
      const from = mondayOf(today)
      return { unit: 'week', from, to: addDays(from, 6) }
    }
    case 'last_week': {
      const from = addDays(mondayOf(today), -7)
      return { unit: 'week', from, to: addDays(from, 6) }
    }
    case 'month':
      return { unit: 'month', ...monthRange(y, m) }
    case 'last_month':
      return { unit: 'month', ...monthRange(y, m - 1) }
    case 'quarter':
      return { unit: 'quarter', ...quarterRange(y, q) }
    case 'last_quarter':
      return { unit: 'quarter', ...quarterRange(y, q - 1) }
    case 'year':
      return { unit: 'year', from: `${y}-01-01`, to: `${y}-12-31` }
    case 'last_year':
      return { unit: 'year', from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    case 'd7':
      return { unit: 'range', from: addDays(today, -6), to: today }
    case 'd30':
      return { unit: 'range', from: addDays(today, -29), to: today }
    case 'd90':
      return { unit: 'range', from: addDays(today, -89), to: today }
  }
}

/** какой пресет сейчас выбран (для подсветки); null — свой период */
export function activePreset(p: ReportPeriod, today: string): PresetKey | null {
  for (const def of PRESETS) {
    const x = presetPeriod(def.key, today)
    if (x.from === p.from && x.to === p.to) return def.key
  }
  return null
}

function daysIn(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000) + 1
}

/** ‹ › — на одну единицу периода назад (−1) или вперёд (+1) */
export function shiftPeriod(p: ReportPeriod, dir: -1 | 1): ReportPeriod {
  const f = parse(p.from)
  switch (p.unit) {
    case 'day':
    case 'week': {
      const n = p.unit === 'day' ? 1 : 7
      return { ...p, from: addDays(p.from, n * dir), to: addDays(p.to, n * dir) }
    }
    case 'month':
      return { unit: 'month', ...monthRange(f.getFullYear(), f.getMonth() + dir) }
    case 'quarter':
      return { unit: 'quarter', ...quarterRange(f.getFullYear(), Math.floor(f.getMonth() / 3) + dir) }
    case 'year': {
      const y = f.getFullYear() + dir
      return { unit: 'year', from: `${y}-01-01`, to: `${y}-12-31` }
    }
    case 'range': {
      const n = daysIn(p.from, p.to)
      return { unit: 'range', from: addDays(p.from, n * dir), to: addDays(p.to, n * dir) }
    }
  }
}

/** свой отрезок: целый месяц/год сам становится месяцем/годом — и стрелки листают как надо */
export function customPeriod(from: string, to: string): ReportPeriod {
  const [a, b] = from <= to ? [from, to] : [to, from]
  const fa = parse(a)
  const month = monthRange(fa.getFullYear(), fa.getMonth())
  if (a === b) return { unit: 'day', from: a, to: b }
  if (month.from === a && month.to === b) return { unit: 'month', from: a, to: b }
  if (a.endsWith('-01-01') && b === `${a.slice(0, 4)}-12-31`) return { unit: 'year', from: a, to: b }
  const qr = quarterRange(fa.getFullYear(), Math.floor(fa.getMonth() / 3))
  if (qr.from === a && qr.to === b) return { unit: 'quarter', from: a, to: b }
  if (mondayOf(a) === a && daysIn(a, b) === 7) return { unit: 'week', from: a, to: b }
  return { unit: 'range', from: a, to: b }
}

const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const ROMAN = ['I', 'II', 'III', 'IV']

/** «Ноябрь 2026», «IV квартал 2026», «2–8 ноября», «9 ноября 2026» */
export function periodTitle(p: ReportPeriod, today: string): string {
  const a = parse(p.from)
  const b = parse(p.to)
  const thisYear = parse(today).getFullYear()
  const yr = (d: Date) => (d.getFullYear() === thisYear ? '' : ` ${d.getFullYear()}`)
  if (p.unit === 'month') return `${MONTHS_NOM[a.getMonth()]} ${a.getFullYear()}`
  if (p.unit === 'quarter') return `${ROMAN[Math.floor(a.getMonth() / 3)]} квартал ${a.getFullYear()}`
  if (p.unit === 'year') return String(a.getFullYear())
  if (p.from === p.to) return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]}${yr(a)}`
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[a.getMonth()]}${yr(b)}`
  }
  if (a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}${yr(b)}`
  }
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} ${a.getFullYear()} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]} ${b.getFullYear()}`
}

/** не раньше начала истории тарифа: на «Старте» период обрезается до года назад */
export function clampPeriod(p: ReportPeriod, minFrom: string | null): { period: ReportPeriod; cut: boolean } {
  if (!minFrom || p.from >= minFrom) return { period: p, cut: false }
  if (p.to < minFrom) return { period: { unit: 'range', from: minFrom, to: minFrom }, cut: true }
  return { period: { ...p, unit: 'range', from: minFrom }, cut: true }
}

const KEY = 'semternity.reportPeriod'

/** выбранный период помним как пресет (чтобы «Этот месяц» завтра оставался этим месяцем) */
export function loadPeriod(today: string): ReportPeriod {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw) as { preset?: PresetKey; from?: string; to?: string }
      if (v.preset && PRESETS.some((p) => p.key === v.preset)) return presetPeriod(v.preset, today)
      if (typeof v.from === 'string' && typeof v.to === 'string' && /^\d{4}-\d\d-\d\d$/.test(v.from)) {
        return customPeriod(v.from, v.to)
      }
    }
  } catch {
    // приватный режим — берём этот месяц
  }
  return presetPeriod('month', today)
}

export function savePeriod(p: ReportPeriod, today: string) {
  try {
    const preset = activePreset(p, today)
    localStorage.setItem(KEY, JSON.stringify(preset ? { preset } : { from: p.from, to: p.to }))
  } catch {
    // не запомнили — в следующий раз откроется этот месяц
  }
}
