import { useEffect, useRef, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { tap } from '../lib/haptics'
import { navDepth } from '../lib/navMotion'
import { bridgePath } from '../lib/liquid'

/** сколько надо протянуть (уже с сопротивлением), чтобы капля оторвалась */
const THRESHOLD = 76
/** где висит кольцо загрузки, пока данные едут */
const HOLD_AT = 56
const SOURCE_R = 18
const DROP_R = 13

/**
 * «Потянуть, чтобы обновить» (0.60) — на корневых экранах телефона. Список едет за пальцем
 * с растущим сопротивлением, из-под верхнего края тянется терракотовая капля. На пороге
 * перешеек рвётся — капля отрывается и становится кольцом загрузки; отпустили — данные
 * обновляются, кольцо сжимается, список встаёт на место.
 */
export function PullToRefresh({ contentRef }: { contentRef: RefObject<HTMLElement | null> }) {
  const qc = useQueryClient()
  const svgRef = useRef<SVGSVGElement>(null)
  const neckRef = useRef<SVGPathElement>(null)
  const dropRef = useRef<SVGCircleElement>(null)
  const spinRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let startY = 0
    let startX = 0
    let pull = 0
    let state: 'idle' | 'maybe' | 'pull' | 'busy' = 'idle'
    let detached = false

    const allowed = () =>
      window.matchMedia('(max-width: 1023.98px)').matches &&
      window.scrollY <= 0 &&
      navDepth(location.pathname) === 0 &&
      !document.querySelector('[role="dialog"][aria-modal="true"], .row-menu')

    const draw = () => {
      const content = contentRef.current
      if (content) {
        content.style.transform = pull > 0 ? `translateY(${pull}px)` : ''
        // плавный transform обёртки (стопка под листом) здесь только мешал бы пальцу
        content.style.transition = pull > 0 ? 'none' : ''
      }
      const cx = window.innerWidth / 2
      const src = { x: cx, y: -SOURCE_R + 4, r: SOURCE_R }
      const drop = { x: cx, y: Math.max(src.y, pull * 0.62), r: Math.min(DROP_R, 5 + pull * 0.12) }
      // перешеек рвётся на пороге: дальше капля висит сама по себе
      const neck = detached ? null : bridgePath(drop, src)
      neckRef.current?.setAttribute('d', neck ?? '')
      dropRef.current?.setAttribute('cx', String(drop.x))
      dropRef.current?.setAttribute('cy', String(drop.y))
      // пока грузится, вместо капли — кольцо
      dropRef.current?.setAttribute('r', String(pull > 2 && state !== 'busy' ? drop.r : 0))
      if (svgRef.current) svgRef.current.style.opacity = pull > 2 || state === 'busy' ? '1' : '0'
    }

    const settle = (to: number, ms: number) =>
      new Promise<void>((resolve) => {
        const from = pull
        const t0 = performance.now()
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ms)
          const e = 1 - Math.pow(1 - t, 3)
          pull = from + (to - from) * e
          draw()
          if (t < 1) requestAnimationFrame(step)
          else resolve()
        }
        requestAnimationFrame(step)
      })

    const onStart = (e: TouchEvent) => {
      if (state !== 'idle' || e.touches.length !== 1 || !allowed()) return
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      state = 'maybe'
    }
    const onMove = (e: TouchEvent) => {
      if (state !== 'maybe' && state !== 'pull') return
      const dy = e.touches[0].clientY - startY
      const dx = e.touches[0].clientX - startX
      if (state === 'maybe') {
        if (Math.abs(dy) < 6 && Math.abs(dx) < 6) return
        if (dy <= 0 || Math.abs(dx) > dy || window.scrollY > 0) {
          state = 'idle'
          return
        }
        state = 'pull'
        detached = false
      }
      e.preventDefault()
      // сопротивление растёт: чем дальше, тем туже
      pull = Math.max(0, 140 * (1 - Math.exp(-dy / 220)))
      const past = pull >= THRESHOLD
      if (past !== detached) {
        detached = past
        if (past) tap()
      }
      draw()
    }
    const onEnd = async () => {
      if (state === 'maybe') state = 'idle'
      if (state !== 'pull') return
      if (!detached) {
        state = 'idle'
        await settle(0, 260)
        return
      }
      // оторвалась: капля — кольцо загрузки, список ждёт под ним
      state = 'busy'
      draw()
      spinRef.current?.setAttribute('data-on', '')
      await settle(HOLD_AT, 220)
      try {
        await Promise.all([qc.refetchQueries({ type: 'active' }), new Promise((r) => setTimeout(r, 500))])
      } finally {
        spinRef.current?.setAttribute('data-done', '')
        await new Promise((r) => setTimeout(r, 180))
        spinRef.current?.removeAttribute('data-on')
        spinRef.current?.removeAttribute('data-done')
        await settle(0, 300)
        detached = false
        state = 'idle'
        draw()
      }
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    document.addEventListener('touchcancel', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
      document.removeEventListener('touchcancel', onEnd)
      pull = 0
      draw()
    }
  }, [contentRef, qc])

  return (
    <div className="ptr safe-top pointer-events-none fixed inset-x-0 top-0 z-30 lg:hidden" aria-hidden>
      <svg ref={svgRef} className="ptr-liquid absolute left-0 overflow-visible" width="1" height="1" style={{ opacity: 0 }}>
        <path ref={neckRef} fill="var(--accent)" />
        <circle ref={dropRef} fill="var(--accent)" r="0" />
      </svg>
      <span ref={spinRef} className="ptr-spin" />
    </div>
  )
}
