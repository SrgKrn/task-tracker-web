import type { ReactNode } from 'react'

export type RingState = 'idle' | 'running' | 'done' | 'over'

const STATE_COLOR: Record<RingState, string> = {
  idle: 'var(--s-accent-muted)',
  running: 'var(--s-accent)',
  done: 'var(--s-success)',
  over: 'var(--s-danger)',
}

interface RingProps {
  /** диаметр в px */
  size: number
  /** заполнение 0–100; выше 100 кольцо просто полное */
  pct: number
  state?: RingState
  /** цвет заливки, если нужен не по состоянию */
  color?: string
  /** цвет трека; на крупных кольцах он темнее */
  track?: string
  /** фон центра — всегда цвет подложки, чтобы кольцо не «висело» */
  centerBg?: string
  /** точка «сейчас» сверху; по спеке только на кольцах 104+ */
  marker?: boolean
  onClick?: () => void
  ariaLabel?: string
  children?: ReactNode
}

/**
 * Ядро визуального языка: одинаковая логика на всех масштабах — от строки задачи (32px)
 * до кольца суток (104px). Заливка = clamp(факт/план, 0, 1) от 12 часов по часовой,
 * обод ≈12% диаметра.
 */
export function Ring({
  size,
  pct,
  state = 'idle',
  color,
  track,
  centerBg = 'var(--s-surface)',
  marker = false,
  onClick,
  ariaLabel,
  children,
}: RingProps) {
  const deg = Math.max(0, Math.min(pct, 100)) * 3.6
  const fill = color ?? STATE_COLOR[state]
  const trackColor = track ?? (size >= 100 ? 'var(--s-ring-track-lg)' : 'var(--s-ring-track)')
  const inset = Math.max(4, Math.round(size * 0.12 * 10) / 10)

  const body = (
    <>
      <div
        className="absolute flex items-center justify-center rounded-full"
        style={{ inset: `${inset}px`, background: centerBg }}
      >
        {children}
      </div>
      {marker && (
        <div
          className="absolute h-2 w-2 rounded-full"
          style={{
            top: -4,
            left: '50%',
            marginLeft: -4,
            background: 'var(--s-accent)',
            boxShadow: '0 0 12px rgba(232,163,61,.8)',
          }}
        />
      )}
    </>
  )

  const style = {
    width: size,
    height: size,
    background: `conic-gradient(${fill} 0deg ${deg}deg, ${trackColor} ${deg}deg 360deg)`,
    transition: 'background 300ms ease-out',
  }

  if (!onClick) {
    return (
      <div className="relative shrink-0 rounded-full" style={style}>
        {body}
      </div>
    )
  }

  // кликабельное кольцо — главное действие приложения, поэтому область нажатия
  // растягивается до 44px, а сам диск остаётся того размера, что задан макетом
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="hit-44 shrink-0 rounded-full"
      style={style}
    >
      {body}
    </button>
  )
}

/** ▶ — задача не запущена */
export function PlayGlyph({ color = 'var(--color-slate-300)', size = 8 }: { color?: string; size?: number }) {
  return (
    <span
      style={{
        width: 0,
        height: 0,
        borderLeft: `${size}px solid ${color}`,
        borderTop: `${size * 0.625}px solid transparent`,
        borderBottom: `${size * 0.625}px solid transparent`,
        marginLeft: size * 0.25,
      }}
    />
  )
}

/** ■ — идёт учёт */
export function StopGlyph({ size = 8, color = 'var(--s-accent)' }: { size?: number; color?: string }) {
  return <span style={{ width: size, height: size, borderRadius: 2, background: color }} />
}
