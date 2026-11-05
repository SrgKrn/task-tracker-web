import { useLayoutEffect, useRef, type RefObject } from 'react'
import { bridgePath, easeBack, easeInOut, easeOut, lerp, span, type Circle } from '../lib/liquid'

/**
 * Жидкая связка плашки учёта с кружком «+» (0.60).
 *
 * В покое стоп-кнопка плашки и «+» соединены перешейком-метаболом: его края касаются обоих
 * кругов по касательной, поэтому шва нет. Положения берутся из настоящей раскладки, а не
 * зашиты числами, — связка не съезжает на другой ширине экрана.
 *
 * Старт: капля поднимается из «+», тянет за собой перешеек, встаёт на место стоп-кнопки и
 * растекается влево в плашку; жидкость «остывает» — под ней уже настоящая плашка.
 * Стоп — то же в обратную сторону, и «+» проглатывает каплю.
 */

export type PourMode = 'enter' | 'leave' | 'rest'
export const ENTER_MS = 900
export const LEAVE_MS = 560

interface Geometry {
  stop: Circle
  fab: Circle
  pill: { x: number; y: number; w: number; h: number }
  fabEl: HTMLElement
}

function measure(wrap: HTMLElement, pill: HTMLElement, stop: HTMLElement): Geometry | null {
  const fabEl = document.querySelector<HTMLElement>('.tabbar:not([data-hidden]) .fab')
  const row = fabEl?.parentElement
  if (!fabEl || !row || !fabEl.offsetWidth) return null
  const w = wrap.getBoundingClientRect()
  // ряд таб-бара не двигается при «пружине» кружка — его рамка и есть место «+» в покое
  const rr = row.getBoundingClientRect()
  const fr = fabEl.offsetWidth / 2
  return {
    fabEl,
    fab: { x: rr.right - w.left - fr, y: rr.top + rr.height / 2 - w.top, r: fr },
    // по горизонтали — рамка (дробные пиксели: смещение на полпикселя видно как перекос),
    // по вертикали — раскладка: содержимое плашки на старте ещё приподнимается анимацией
    stop: {
      x: (() => {
        const r = stop.getBoundingClientRect()
        return r.left + r.width / 2 - w.left
      })(),
      y: pill.offsetTop + stop.offsetTop + stop.offsetHeight / 2,
      r: stop.offsetWidth / 2,
    },
    pill: { x: pill.offsetLeft, y: pill.offsetTop, w: pill.offsetWidth, h: pill.offsetHeight },
  }
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** упругая «пружина» кружка: [t, sx, sy] — отрезки между точками сглажены */
function squash(t: number, keys: [number, number, number][]) {
  for (let i = 1; i < keys.length; i++) {
    const [t1, x1, y1] = keys[i]
    const [t0, x0, y0] = keys[i - 1]
    if (t <= t1) {
      const e = easeInOut(span(t, t0, t1))
      return [lerp(x0, x1, e), lerp(y0, y1, e)]
    }
  }
  return [1, 1]
}
const KICK: [number, number, number][] = [
  [0, 1, 1],
  [0.12, 0.92, 0.88],
  [0.3, 0.96, 1.06],
  [0.48, 1.03, 0.98],
  [0.66, 1, 1],
]
const GULP: [number, number, number][] = [
  [0, 1, 1],
  [0.7, 1, 1],
  [0.82, 1.08, 0.93],
  [0.92, 0.98, 1.02],
  [1, 1, 1],
]

export function TimerPour({
  mode,
  pillRef,
  stopRef,
  onEntered,
}: {
  mode: PourMode
  pillRef: RefObject<HTMLElement | null>
  stopRef: RefObject<HTMLElement | null>
  onEntered: () => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const bridge = useRef<SVGPathElement>(null)
  const sheet = useRef<SVGRectElement>(null)
  const knob = useRef<SVGCircleElement>(null)
  const glyph = useRef<SVGRectElement>(null)
  const doneRef = useRef(onEntered)
  useLayoutEffect(() => {
    doneRef.current = onEntered
  })

  // покой: только перешеек. Пересчёт на каждой перерисовке плашки (раз в секунду — часы)
  // и при смене размеров экрана
  useLayoutEffect(() => {
    if (mode !== 'rest') return
    const draw = () => {
      // обёртка плашки — родитель слоя: её ref на этом этапе ещё не подключён
      const wrap = svg.current?.parentElement
      const pill = pillRef.current
      const stop = stopRef.current
      const path = bridge.current
      if (!wrap || !pill || !stop || !path) return
      const g = measure(wrap, pill, stop)
      path.setAttribute('d', (g && bridgePath(g.stop, g.fab)) || '')
    }
    draw()
    window.addEventListener('resize', draw)
    window.visualViewport?.addEventListener('resize', draw)
    return () => {
      window.removeEventListener('resize', draw)
      window.visualViewport?.removeEventListener('resize', draw)
    }
  })

  useLayoutEffect(() => {
    if (mode === 'rest') return
    // обёртка плашки — родитель слоя: её ref на этом этапе ещё не подключён
      const wrap = svg.current?.parentElement
    const pill = pillRef.current
    const stop = stopRef.current
    if (!wrap || !pill || !stop) return
    const g = measure(wrap, pill, stop)
    const enter = mode === 'enter'
    if (!g || reduced()) {
      pill.style.opacity = enter ? '' : '0'
      if (enter) doneRef.current()
      return
    }
    const { fab, fabEl } = g
    const S = g.stop
    const P = g.pill
    // капля в «+» прячется под верхний край кружка — «плюс» не закрывает
    const start = { x: fab.x, y: fab.y - fab.r + 10, r: 8 }
    const duration = enter ? ENTER_MS : LEAVE_MS
    pill.style.opacity = enter ? '0' : '1'

    const frame = (t: number) => {
      const [sx, sy] = squash(t, enter ? KICK : GULP)
      fabEl.style.transform = sx === 1 && sy === 1 ? '' : `scale(${sx}, ${sy})`
      // «+» в этот момент сплюснут — перешеек садится на меньший радиус, чтобы не торчать
      const fabNow = { ...fab, r: fab.r * Math.min(sx, sy) }

      // капля: из «+» на место стоп-кнопки (на старте — с перелётом), на стопе — обратно
      const kt = enter ? easeBack(span(t, 0.04, 0.44), 1.2) : 1 - Math.pow(span(t, 0.46, 0.9), 2)
      const k = {
        x: lerp(start.x, S.x, kt),
        y: lerp(start.y, S.y, kt),
        r: lerp(start.r, S.r, Math.min(1, enter ? easeOut(span(t, 0.04, 0.4)) : 1 - span(t, 0.46, 0.9))),
      }

      // жидкость растекается из капли влево в плашку и обратно
      const st = enter ? span(t, 0.36, 0.8) : 1 - easeInOut(span(t, 0.16, 0.52))
      const ew = enter ? easeBack(st, 0.9) : st
      const eh = enter ? easeOut(st) : st
      const right = lerp(S.x + S.r, P.x + P.w, eh)
      const width = lerp(S.r * 2, P.w, ew)
      const height = lerp(S.r * 2, P.h, eh)
      const sheetOn = enter ? 1 - span(t, 0.74, 0.94) : span(t, 0, 0.18)

      sheet.current?.setAttribute('x', String(right - width))
      sheet.current?.setAttribute('y', String(S.y - height / 2))
      sheet.current?.setAttribute('width', String(Math.max(0, width)))
      sheet.current?.setAttribute('height', String(Math.max(0, height)))
      sheet.current?.setAttribute('rx', String(lerp(S.r, 14, eh)))
      sheet.current?.setAttribute('opacity', String(st > 0 ? sheetOn : 0))
      // настоящая плашка проступает под остывающей жидкостью
      pill.style.opacity = String(enter ? span(t, 0.6, 0.76) : 1 - span(t, 0.18, 0.22))

      knob.current?.setAttribute('cx', String(k.x))
      knob.current?.setAttribute('cy', String(k.y))
      knob.current?.setAttribute('r', String(Math.max(0, k.r)))
      const gs = Math.max(0, (k.r / S.r) * 11)
      glyph.current?.setAttribute('x', String(k.x - gs / 2))
      glyph.current?.setAttribute('y', String(k.y - gs / 2))
      glyph.current?.setAttribute('width', String(gs))
      glyph.current?.setAttribute('height', String(gs))
      glyph.current?.setAttribute('opacity', String(enter ? span(t, 0.2, 0.4) : 1 - span(t, 0.46, 0.6)))
      // капля уже внутри «+» — перешейку не на чем держаться: острые «плечики» у кружка
      const inside = Math.hypot(k.x - fabNow.x, k.y - fabNow.y) < fabNow.r
      bridge.current?.setAttribute('d', (!inside && bridgePath(k, fabNow)) || '')
    }

    frame(0)
    const t0 = performance.now()
    let raf = 0
    const loop = (now: number) => {
      const t = Math.min(1, (now - t0) / duration)
      frame(t)
      if (t < 1) raf = requestAnimationFrame(loop)
      else if (enter) doneRef.current()
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      fabEl.style.transform = ''
      pill.style.opacity = ''
    }
  }, [mode, pillRef, stopRef])

  const moving = mode !== 'rest'
  return (
    <svg ref={svg} className="mini-bridge pointer-events-none absolute top-0 left-0 overflow-visible" width="1" height="1" aria-hidden>
      {moving && <rect ref={sheet} fill="var(--accent)" opacity="0" />}
      <path ref={bridge} fill="var(--accent)" />
      {moving && (
        <>
          <circle ref={knob} fill="var(--accent)" r="0" />
          <rect ref={glyph} fill="var(--on-accent)" rx="2" />
        </>
      )}
    </svg>
  )
}

