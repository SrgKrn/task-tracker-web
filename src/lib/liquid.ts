/**
 * Геометрия «жидкости» (0.60): перешеек между двумя кругами — метабол. Края перешейка
 * касаются обоих кругов по касательной, поэтому стыка не видно: два круга и мостик
 * читаются как одна капля. Тот же расчёт работает, пока круги движутся, — так плашка
 * учёта вытекает из «+» и стекает обратно.
 */

export interface Circle {
  x: number
  y: number
  r: number
}

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay)
const polar = (x: number, y: number, a: number, r: number): [number, number] => [x + r * Math.cos(a), y + r * Math.sin(a)]
const f = (n: number) => Math.round(n * 100) / 100

/**
 * Контур перешейка между кругами a и b. null — круги вложены друг в друга (капля ещё внутри)
 * или разошлись дальше, чем тянется жидкость. Замыкается хордами внутри кругов: сами круги
 * рисуются отдельно (кнопкой, «+» или кругом в том же слое).
 *
 * spread — насколько широко перешеек «садится» на круги (0…1), handle — полнота изгиба.
 */
export function bridgePath(a: Circle, b: Circle, spread = 0.5, handle = 2.4): string | null {
  const d = dist(a.x, a.y, b.x, b.y)
  const maxDist = a.r + b.r * 2.5
  if (d === 0 || d <= Math.abs(a.r - b.r) || d > maxDist) return null

  const overlap = d < a.r + b.r
  // круги наползают друг на друга — перешеек сужается к нулю, иначе у большого круга
  // торчат острые «плечики»
  if (overlap) spread *= (d - Math.abs(a.r - b.r)) / (a.r + b.r - Math.abs(a.r - b.r))
  const u1 = overlap ? Math.acos((a.r * a.r + d * d - b.r * b.r) / (2 * a.r * d)) : 0
  const u2 = overlap ? Math.acos((b.r * b.r + d * d - a.r * a.r) / (2 * b.r * d)) : 0
  const between = Math.atan2(b.y - a.y, b.x - a.x)
  const maxSpread = Math.acos(Math.max(-1, Math.min(1, (a.r - b.r) / d)))

  const a1 = between + u1 + (maxSpread - u1) * spread
  const a2 = between - u1 - (maxSpread - u1) * spread
  const a3 = between + Math.PI - u2 - (Math.PI - u2 - maxSpread) * spread
  const a4 = between - Math.PI + u2 + (Math.PI - u2 - maxSpread) * spread

  const p1 = polar(a.x, a.y, a1, a.r)
  const p2 = polar(a.x, a.y, a2, a.r)
  const p3 = polar(b.x, b.y, a3, b.r)
  const p4 = polar(b.x, b.y, a4, b.r)

  const total = a.r + b.r
  const base = Math.min(spread * handle, dist(p1[0], p1[1], p3[0], p3[1]) / total)
  const k = base * Math.min(1, (d * 2) / total)
  const h1 = polar(p1[0], p1[1], a1 - Math.PI / 2, a.r * k)
  const h2 = polar(p2[0], p2[1], a2 + Math.PI / 2, a.r * k)
  const h3 = polar(p3[0], p3[1], a3 + Math.PI / 2, b.r * k)
  const h4 = polar(p4[0], p4[1], a4 - Math.PI / 2, b.r * k)

  return [
    `M${f(p1[0])} ${f(p1[1])}`,
    `C${f(h1[0])} ${f(h1[1])} ${f(h3[0])} ${f(h3[1])} ${f(p3[0])} ${f(p3[1])}`,
    `L${f(p4[0])} ${f(p4[1])}`,
    `C${f(h4[0])} ${f(h4[1])} ${f(h2[0])} ${f(h2[1])} ${f(p2[0])} ${f(p2[1])}`,
    'Z',
  ].join('')
}

/** 0…1 на отрезке [from, to] шкалы t */
export function span(t: number, from: number, to: number) {
  return Math.max(0, Math.min(1, (t - from) / (to - from)))
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/** iOS-подобный выход: быстро и долго мягко */
export const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
/** выход с перелётом — как пружина без колебаний после */
export const easeBack = (t: number, s = 1.6) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2)
