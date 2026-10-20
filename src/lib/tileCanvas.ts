import { useEffect, useState } from 'react'
import { layoutTile, type DayTile } from './dayTile'

/** Перерисовать при смене темы: тема ставит data-theme на <html>. */
export function useThemeVersion(): number {
  const [v, setV] = useState(0)
  useEffect(() => {
    const mo = new MutationObserver(() => setV((x) => x + 1))
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return v
}

/** Цвета холста — из токенов темы: на canvas var(--…) не работает. */
export function tilePalette() {
  const cs = getComputedStyle(document.documentElement)
  const get = (n: string) => cs.getPropertyValue(n).trim()
  return {
    sunken: get('--surface-sunken'),
    dashed: get('--border-strong'),
    ring: get('--surface'),
    accent: get('--accent'),
    label: (c: string | null) => get(`--${c ?? 'label-8'}`),
  }
}
export type TilePalette = ReturnType<typeof tilePalette>

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)))
}

/**
 * Плитка на холсте в точке (x0, y0) размером size. Без учёта — пунктирная рамка;
 * record — терракотовая рамка рекорда месяца (место под неё — внутри size).
 */
export function drawDayTile(
  ctx: CanvasRenderingContext2D,
  p: TilePalette,
  tile: DayTile | undefined,
  x0: number,
  y0: number,
  size: number,
  record = false,
) {
  const pad = record ? Math.max(2, size * 0.07) : 0
  const x = x0 + pad
  const y = y0 + pad
  const s = size - pad * 2
  const radius = Math.max(1.5, s * 0.1)
  if (!tile || tile.total <= 0) {
    ctx.save()
    roundRect(ctx, x + 0.5, y + 0.5, s - 1, s - 1, radius)
    ctx.strokeStyle = p.dashed
    ctx.lineWidth = 1
    ctx.setLineDash(s > 20 ? [3, 3] : [1.5, 1.5])
    ctx.stroke()
    ctx.restore()
    return
  }
  ctx.save()
  roundRect(ctx, x, y, s, s, radius)
  ctx.fillStyle = p.sunken
  ctx.fill()
  ctx.clip()
  const gap = s >= 60 ? s * 0.022 : s >= 24 ? 1 : 0.6
  for (const r of layoutTile(tile)) {
    const bx = x + r.x * s + gap / 2
    const by = y + r.y * s + gap / 2
    const bw = r.w * s - gap
    const bh = r.h * s - gap
    if (bw <= 0 || bh <= 0) continue
    roundRect(ctx, bx, by, bw, bh, s >= 60 ? s * 0.03 : 0.8)
    if (!r.seg) {
      if (tile.live && s >= 24) {
        ctx.save()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = p.dashed
        ctx.stroke()
        ctx.restore()
      }
      continue
    }
    ctx.fillStyle = p.label(r.seg.client.color)
    ctx.fill()
    // длинный заход: кольцо на каждый полный час
    if (s >= 60 && r.seg.minutes >= 90) {
      const hours = Math.floor(r.seg.minutes / 60)
      ctx.save()
      ctx.strokeStyle = p.ring
      ctx.globalAlpha = 0.3
      ctx.lineWidth = Math.max(1, s * 0.006)
      for (let i = 1; i <= hours; i++) {
        const k = i / (hours + 1)
        roundRect(ctx, bx + (bw * k) / 2, by + (bh * k) / 2, bw * (1 - k), bh * (1 - k), s * 0.02)
        ctx.stroke()
      }
      ctx.restore()
    }
  }
  ctx.restore()
  if (record) {
    ctx.save()
    roundRect(ctx, x0 + 0.75, y0 + 0.75, size - 1.5, size - 1.5, radius + pad)
    ctx.strokeStyle = p.accent
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.restore()
  }
}

/** холст с учётом плотности экрана; draw рисует в CSS-пикселях */
export function prepCanvas(canvas: HTMLCanvasElement, w: number, h: number) {
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  return ctx
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

/** «Вторник, 20 октября» */
export function tileDayTitle(day: string): string {
  const d = new Date(`${day}T00:00:00`)
  const wd = d.toLocaleDateString('ru-RU', { weekday: 'long' })
  return `${wd[0].toUpperCase()}${wd.slice(1)}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`
}

