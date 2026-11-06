import { useEffect, useLayoutEffect, type RefObject } from 'react'
import { navDepth, type NavDir } from './navMotion'

/**
 * Переходы экранов на телефоне (0.59), как в Telegram: двигаются оба экрана.
 * Вглубь — новый въезжает справа с тенью, старый уходит влево на треть и темнеет.
 * Назад — наоборот. Между вкладками — быстрое растворение, без сдвига.
 *
 * Старого экрана к моменту отрисовки нового уже нет, поэтому прямо перед сменой адреса
 * (pushState или «назад») с него снимается копия разметки — «слепок». Его и анимируем
 * поверх или под новым экраном, потом убираем.
 *
 * 0.60: слепки экранов, с которых ушли вглубь, не выбрасываются, а лежат стопкой. Из неё
 * берётся экран «под» карточкой для свайпа назад от левого края: карточка едет за пальцем,
 * снизу выезжает прежний экран.
 */

type Snap = { el: HTMLElement; rect: DOMRect; path: string; at: number }
/** экран, с которого ушли вглубь: from — его адрес, to — куда ушли */
type Under = { el: HTMLElement; rect: DOMRect; from: string; to: string; origin?: Origin }
/** откуда раскрывается экран кругом — центр нажатой кнопки (аватар → профиль) */
type Origin = { x: number; y: number; at: number }

let snap: Snap | null = null
let source: (() => HTMLElement | null) | null = null
let finish: (() => void) | null = null
/** адрес экрана, который сейчас на виду: в popstate location уже новый */
let shownPath = typeof location === 'undefined' ? '/' : location.pathname
/** где был прокручен каждый экран — чтобы «назад» вернул на то же место */
const scrolls = new Map<string, number>()
const unders: Under[] = []
const MAX_UNDERS = 6
/** свайп назад довёл карточку до конца: следующий экран уже «показан» жестом */
let swipedBack: (() => void) | null = null
let origin: Origin | null = null

/** Следующий переход вглубь раскроется кругом из этого элемента (аватар → профиль). */
export function revealFrom(el: Element) {
  const r = el.getBoundingClientRect()
  origin = { x: r.left + r.width / 2, y: r.top + r.height / 2, at: performance.now() }
}

const DURATION = 340
const EASE = 'cubic-bezier(0.2, 0.85, 0.15, 1)'
/** насколько уходит нижний экран — как в iOS и Telegram */
const PARALLAX = -0.28
const DIM = 0.14
/** свайп начинается не дальше этого от левого края */
const EDGE = 24

const mobile = () => window.matchMedia('(max-width: 1023.98px)').matches
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function take() {
  scrolls.set(shownPath, window.scrollY)
  const el = source?.()
  if (swipedBack || !el || !mobile() || reduced()) {
    snap = null
    return
  }
  snap = { el: el.cloneNode(true) as HTMLElement, rect: el.getBoundingClientRect(), path: shownPath, at: performance.now() }
}

/**
 * Системный жест «назад» (свайп от края в Safari на iPhone, жест навигации Android) рисует
 * свою анимацию: прежний экран уже выехал из-под пальца. Если поверх сыграть ещё и свою —
 * прежний экран показывается дважды. Такой «назад» узнаём по флагу браузера, а где его
 * нет — по пальцу, который только что протянули от края экрана.
 */
const edge = { x0: 0, moved: 0, at: 0, down: false, cancelled: false }
const NATIVE_EDGE = 32
function trackEdgeGesture() {
  const opts = { passive: true, capture: true }
  window.addEventListener(
    'touchstart',
    (e) => {
      const x = e.touches[0]?.clientX ?? NATIVE_EDGE + 1
      edge.down = x <= NATIVE_EDGE || x >= window.innerWidth - NATIVE_EDGE
      edge.x0 = x
      edge.moved = 0
      edge.cancelled = false
      edge.at = performance.now()
    },
    opts,
  )
  window.addEventListener(
    'touchmove',
    (e) => {
      if (!edge.down) return
      edge.moved = Math.max(edge.moved, Math.abs((e.touches[0]?.clientX ?? edge.x0) - edge.x0))
      edge.at = performance.now()
    },
    opts,
  )
  const up = (e: TouchEvent) => {
    if (edge.down) {
      edge.at = performance.now()
      // палец у края забрал сам браузер (Safari так начинает свой жест) — касание отменено
      edge.cancelled = e.type === 'touchcancel'
    }
    edge.down = false
  }
  window.addEventListener('touchend', up, opts)
  window.addEventListener('touchcancel', up, opts)
}
const nativeGesture = (e: PopStateEvent) =>
  (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true ||
  ((edge.moved > 40 || edge.cancelled || edge.down) && performance.now() - edge.at < 700)

/** Safari на iPhone/iPad в браузере: там свой свайп «назад», наш поверх него — двойной. */
const iosBrowser = () => {
  if (typeof navigator === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return ios && !standalone
}

let installed = false
/** Подключить до первого рендера роутера: «назад» должен увидеть ещё старый экран. */
export function installScreenSnapshots() {
  if (installed || typeof window === 'undefined') return
  installed = true
  // прокрутку при «назад» возвращаем сами — браузер делал это раньше, чем экран сменится
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
  const push = history.pushState.bind(history)
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    // смена только параметров (фильтр, вкладка листа) — не переход, слепок не нужен
    if (url != null && new URL(url, location.href).pathname !== location.pathname) take()
    push(data, unused, url)
  }
  trackEdgeGesture()
  window.addEventListener('popstate', (e) => {
    // системный жест уже показал переход — свой не играем, только запоминаем прокрутку
    if (!swipedBack && nativeGesture(e)) {
      scrolls.set(shownPath, window.scrollY)
      snap = null
      return
    }
    take()
  })
}

function layer(className: string, z: number) {
  const el = document.createElement('div')
  el.className = className
  el.setAttribute('aria-hidden', 'true')
  el.style.zIndex = String(z)
  document.body.appendChild(el)
  return el
}

function placeGhost(ghost: HTMLElement, rect: DOMRect) {
  ghost.classList.add('route-ghost')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.inert = true
  Object.assign(ghost.style, {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${Math.max(rect.height, window.innerHeight - rect.top)}px`,
    transform: '',
  })
  document.body.appendChild(ghost)
}

function play(s: Snap, content: HTMLElement, dir: NavDir, pathname: string, from?: Origin) {
  finish?.()

  const ghost = s.el
  placeGhost(ghost, s.rect)

  // новый экран — сверху страницы; «назад» — там, где его оставили
  if (dir === 'forward') window.scrollTo(0, 0)
  else if (dir === 'back') window.scrollTo(0, scrolls.get(pathname) ?? 0)

  const timing = { duration: DURATION, easing: EASE }
  const anims: Animation[] = []
  let dim: HTMLElement | null = null

  // круг из аватара: вглубь — новый экран раскрывается кругом, старый чуть отступает
  // в глубину; назад — круг собирается обратно в аватар
  const reveal = dir === 'forward' ? fresh(origin) : dir === 'back' ? from : undefined
  origin = null

  if (reveal) {
    const forward = dir === 'forward'
    const R = Math.hypot(Math.max(reveal.x, window.innerWidth - reveal.x), Math.max(reveal.y, window.innerHeight - reveal.y))
    const top = forward ? content : ghost
    const below = forward ? ghost : content
    dim = layer('route-dim', 2)
    content.classList.add('route-live')
    top.style.zIndex = '3'
    below.style.zIndex = '1'
    // круг считается от окна, а слой сдвинут прокруткой — поправка на его верх
    const oy = reveal.y - (forward ? 0 : s.rect.top)
    const at = (r: number) => `circle(${r}px at ${reveal.x}px ${forward ? reveal.y - top.getBoundingClientRect().top : oy}px)`
    const clip = [{ clipPath: at(18) }, { clipPath: at(R) }]
    const sink = [{ transform: 'none' }, { transform: 'scale(0.94)' }]
    const t = { duration: 420, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' }
    anims.push(
      top.animate(forward ? clip : [...clip].reverse(), { ...t, fill: 'forwards' }),
      below.animate(forward ? sink : [...sink].reverse(), { ...t, fill: 'forwards' }),
      dim.animate(forward ? [{ opacity: 0 }, { opacity: DIM * 2 }] : [{ opacity: DIM * 2 }, { opacity: 0 }], { ...t, fill: 'forwards' }),
    )
  } else if (dir === 'tab') {
    // вкладки: слепок сверху растворяется — новый экран проступает сквозь него
    ghost.style.zIndex = '3'
    anims.push(ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards' }))
  } else {
    const forward = dir === 'forward'
    dim = layer('route-dim', 2)
    content.classList.add('route-live')
    content.style.zIndex = forward ? '3' : '1'
    ghost.style.zIndex = forward ? '1' : '3'
    if (!forward) ghost.classList.add('route-ghost-top')
    const px = `${PARALLAX * 100}%`
    anims.push(
      content.animate(
        forward ? [{ transform: 'translateX(100%)' }, { transform: 'none' }] : [{ transform: `translateX(${px})` }, { transform: 'none' }],
        timing,
      ),
      ghost.animate(
        forward ? [{ transform: 'none' }, { transform: `translateX(${px})` }] : [{ transform: 'none' }, { transform: 'translateX(100%)' }],
        { ...timing, fill: 'forwards' },
      ),
      dim.animate(forward ? [{ opacity: 0 }, { opacity: DIM }] : [{ opacity: DIM }, { opacity: 0 }], { ...timing, fill: 'forwards' }),
    )
  }

  const done = () => {
    if (finish !== done) return
    finish = null
    anims.forEach((a) => a.cancel())
    ghost.remove()
    ghost.classList.remove('route-ghost-top')
    dim?.remove()
    content.classList.remove('route-live')
    content.style.zIndex = ''
    // слепок экрана, с которого ушли вглубь, — в стопку: под карточку для свайпа назад
    if (dir === 'forward') {
      unders.push({ el: ghost, rect: s.rect, from: s.path, to: pathname, origin: reveal })
      if (unders.length > MAX_UNDERS) unders.shift()
    }
  }
  finish = done
  settled(anims, reveal ? 420 : dir === 'tab' ? 180 : DURATION).then(done)
}

/**
 * Конец анимаций — или запасной таймер: анимация, начатая в свёрнутом приложении (или если
 * браузер её так и не запустил), может не закончиться никогда, а экран не должен навсегда
 * остаться со слепком поверх.
 */
function settled(anims: Animation[], ms: number): Promise<void> {
  return new Promise((resolve) => {
    let ran = false
    const once = () => {
      if (ran) return
      ran = true
      resolve()
    }
    Promise.all(anims.map((a) => a.finished)).then(once, once)
    window.setTimeout(once, ms + 120)
  })
}

const fresh = (o: Origin | null) => (o && performance.now() - o.at < 800 ? o : undefined)

/**
 * Стопка слепков следует за переходами: назад — снять верхний, вкладка или корень —
 * начать заново. Возвращает снятый (у него может быть круг, из которого раскрывались).
 */
function trackUnders(dir: NavDir, pathname: string): Under | undefined {
  let popped: Under | undefined
  if (dir === 'back') {
    while (unders.length && unders[unders.length - 1].to !== pathname && unders[unders.length - 1].from !== pathname) unders.pop()
    if (unders.length && unders[unders.length - 1].from === pathname) popped = unders.pop()
  }
  if (dir === 'tab' || navDepth(pathname) === 0) unders.length = 0
  return popped
}

/**
 * Свайп назад от левого края (0.60). Карточка едет ровно за пальцем, из-под неё выезжает
 * прежний экран (слепок из стопки), затемнение слабеет. Отпустили дальше трети ширины или
 * быстрым движением — карточка докатывается и срабатывает «назад»; иначе возвращается.
 */
function edgeSwipe(getContent: () => HTMLElement | null) {
  let startX = 0
  let startY = 0
  let lastX = 0
  let lastT = 0
  let speed = 0
  let state: 'idle' | 'maybe' | 'drag' = 'idle'
  let under: Under | null = null
  let content: HTMLElement | null = null
  let dim: HTMLElement | null = null
  let width = 1

  const blocked = () =>
    !mobile() ||
    iosBrowser() ||
    reduced() ||
    !!finish ||
    !!swipedBack ||
    !!document.querySelector('[role="dialog"][aria-modal="true"]') ||
    navDepth(location.pathname) === 0

  const apply = (dx: number) => {
    const p = Math.max(0, Math.min(1, dx / width))
    if (content) content.style.transform = `translateX(${dx}px)`
    if (under) under.el.style.transform = `translateX(${PARALLAX * (1 - p) * 100}%)`
    if (dim) dim.style.opacity = String(DIM * (1 - p))
  }

  const cleanup = () => {
    under?.el.remove()
    dim?.remove()
    if (content) {
      content.style.transform = ''
      content.style.transition = ''
      content.style.zIndex = ''
      content.classList.remove('route-live')
    }
    under = null
    dim = null
    content = null
    state = 'idle'
  }

  const onStart = (e: TouchEvent) => {
    if (state !== 'idle' || e.touches.length !== 1) return
    const t = e.touches[0]
    if (t.clientX > EDGE || blocked()) return
    const top = unders[unders.length - 1]
    if (!top || top.to !== location.pathname) return
    startX = lastX = t.clientX
    startY = t.clientY
    lastT = e.timeStamp
    speed = 0
    state = 'maybe'
  }

  const onMove = (e: TouchEvent) => {
    if (state === 'idle') return
    const t = e.touches[0]
    const dx = t.clientX - startX
    if (state === 'maybe') {
      const dy = t.clientY - startY
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      // вертикально — это прокрутка, не наш жест
      if (dx <= 0 || Math.abs(dy) > dx) {
        state = 'idle'
        return
      }
      const c = getContent()
      const top = unders[unders.length - 1]
      if (!c || !top) {
        state = 'idle'
        return
      }
      state = 'drag'
      content = c
      under = top
      width = window.innerWidth
      placeGhost(under.el, under.rect)
      under.el.style.zIndex = '1'
      dim = layer('route-dim', 2)
      content.classList.add('route-live')
      content.style.zIndex = '3'
      // у обёртки экранов есть плавный transform (стопка под листом) — за пальцем он не нужен
      content.style.transition = 'none'
    }
    e.preventDefault()
    const dt = Math.max(1, e.timeStamp - lastT)
    speed = 0.7 * speed + 0.3 * ((t.clientX - lastX) / dt)
    lastX = t.clientX
    lastT = e.timeStamp
    apply(Math.max(0, dx))
  }

  const onEnd = () => {
    if (state !== 'drag') {
      state = 'idle'
      return
    }
    const dx = Math.max(0, lastX - startX)
    const go = dx > width / 3 || speed > 0.5
    const c = content!
    const u = under!
    const d = dim!
    const p = dx / width
    // докатывается с той же кривой, что и обычный переход; длительность — по остатку пути
    const duration = Math.max(160, DURATION * (go ? 1 - p : p) + 60)
    const timing = { duration, easing: EASE, fill: 'forwards' as const }
    const anims = [
      c.animate([{ transform: `translateX(${dx}px)` }, { transform: go ? 'translateX(100%)' : 'none' }], timing),
      u.el.animate([{ transform: u.el.style.transform }, { transform: go ? 'none' : `translateX(${PARALLAX * 100}%)` }], timing),
      d.animate([{ opacity: d.style.opacity }, { opacity: go ? 0 : DIM }], timing),
    ]
    state = 'idle'
    settled(anims, duration).then(() => {
      if (!go) {
        anims.forEach((a) => a.cancel())
        cleanup()
        return
      }
      // экран под пальцем уже показан: «назад» без своей анимации, слепок уберём, как только
      // React нарисует настоящий экран на его месте
      swipedBack = () => {
        swipedBack = null
        anims.forEach((a) => a.cancel())
        cleanup()
      }
      history.back()
    })
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
    cleanup()
  }
}

/**
 * Подключает анимацию к обёртке экранов: с неё снимается слепок, её же двигаем.
 * dir — направление перехода к pathname (useNavDirection).
 */
export function useScreenMotion(ref: RefObject<HTMLElement | null>, pathname: string, dir: NavDir) {
  useLayoutEffect(() => {
    source = () => ref.current
    return () => {
      source = null
    }
  }, [ref])

  useEffect(() => edgeSwipe(() => ref.current), [ref])

  useLayoutEffect(() => {
    shownPath = pathname
    const s = snap
    snap = null
    if (swipedBack) {
      window.scrollTo(0, scrolls.get(pathname) ?? 0)
      trackUnders('back', pathname)
      swipedBack()
      return
    }
    const popped = trackUnders(dir, pathname)
    const content = ref.current
    // «назад» без своей анимации (системный жест, компьютер) — прокрутку всё равно возвращаем
    if (!s && dir === 'back') window.scrollTo(0, scrolls.get(pathname) ?? 0)
    if (!s || !content || dir === 'none' || s.path === pathname || performance.now() - s.at > 800) return
    play(s, content, dir, pathname, popped?.origin)
  }, [ref, pathname, dir])
}
