import { useEffect, useState } from 'react'

/** Re-renders once a second while `active`, so callers can recompute elapsed = now() - startedAt. */
export function useTicker(active: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [active])
}

function elapsedSeconds(startedAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
}

export function formatElapsed(startedAt: string): string {
  const totalSeconds = elapsedSeconds(startedAt)
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':')
}

/** Часы сессии в формате макета: мм:сс, свыше часа ч:мм:сс. */
export function formatClock(startedAt: string): string {
  const totalSeconds = elapsedSeconds(startedAt)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  if (m < 60) return `${m}:${String(s).padStart(2, '0')}`
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Доля часа сессии — заливка кольца в доке таймера. */
export function sessionHourPct(startedAt: string): number {
  return ((elapsedSeconds(startedAt) % 3600) / 3600) * 100
}

/** Часы в текущей сессии, чтобы прибавлять к факту на лету. */
export function elapsedHours(startedAt: string): number {
  return elapsedSeconds(startedAt) / 3600
}

export function formatHours(hours: number): string {
  return hours.toFixed(2)
}

/** Часы по-русски: десятые доли и запятая — 3,5 (а не 3.50). */
export function formatHoursRu(hours: number): string {
  return String(Math.round(hours * 10) / 10).replace('.', ',')
}
