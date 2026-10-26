import { useLayoutEffect, type RefObject } from 'react'
import type { NavDir } from './navMotion'

/**
 * Переходы экранов на телефоне (0.59), как в Telegram: двигаются оба экрана.
 * Вглубь — новый въезжает справа с тенью, старый уходит влево на треть и темнеет.
 * Назад — наоборот. Между вкладками — быстрое растворение, без сдвига.
 *
 * Старого экрана к моменту отрисовки нового уже нет, поэтому прямо перед сменой адреса
 * (pushState или «назад») с него снимается копия разметки — «слепок». Его и анимируем
 * поверх или под новым экраном, потом убираем.
 */

type Snap = { el: HTMLElement; rect: DOMRect; path: string; at: number }

let snap: Snap | null = null
let source: (() => HTMLElement | null) | null = null
let finish: (() => void) | null = null
/** где был прокручен каждый экран — чтобы «назад» вернул на то же место */
const scrolls = new Map<string, number>()

const DURATION = 340
const EASE = 'cubic-bezier(0.2, 0.85, 0.15, 1)'
/** насколько уходит нижний экран — как в iOS и Telegram */
const PARALLAX = '-28%'
const DIM = 0.14

const mobile = () => window.matchMedia('(max-width: 1023.98px)').matches
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function take() {
  scrolls.set(location.pathname, window.scrollY)
  const el = source?.()
  if (!el || !mobile() || reduced()) {
    snap = null
    return
  }
  snap = { el: el.cloneNode(true) as HTMLElement, rect: el.getBoundingClientRect(), path: location.pathname, at: performance.now() }
}

let installed = false
/** Подключить до первого рендера роутера: «назад» должен увидеть ещё старый экран. */
export function installScreenSnapshots() {
  if (installed || typeof window === 'undefined') return
  installed = true
  const push = history.pushState.bind(history)
  history.pushState = (data: unknown, unused: string, url?: string | URL | null) => {
    // смена только параметров (фильтр, вкладка листа) — не переход, слепок не нужен
    if (url != null && new URL(url, location.href).pathname !== location.pathname) take()
    push(data, unused, url)
  }
  window.addEventListener('popstate', take)
}

function layer(className: string, z: number) {
  const el = document.createElement('div')
  el.className = className
  el.setAttribute('aria-hidden', 'true')
  el.style.zIndex = String(z)
  document.body.appendChild(el)
  return el
}

function play(s: Snap, content: HTMLElement, dir: NavDir, pathname: string) {
  finish?.()

  const ghost = s.el
  ghost.classList.add('route-ghost')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.inert = true
  Object.assign(ghost.style, {
    top: `${s.rect.top}px`,
    left: `${s.rect.left}px`,
    width: `${s.rect.width}px`,
    height: `${Math.max(s.rect.height, window.innerHeight - s.rect.top)}px`,
  })
  document.body.appendChild(ghost)

  // новый экран — сверху страницы; «назад» — там, где его оставили
  if (dir === 'forward') window.scrollTo(0, 0)
  else if (dir === 'back') window.scrollTo(0, scrolls.get(pathname) ?? 0)

  const timing = { duration: DURATION, easing: EASE }
  const anims: Animation[] = []
  let dim: HTMLElement | null = null

  if (dir === 'tab') {
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
    anims.push(
      content.animate(
        forward ? [{ transform: 'translateX(100%)' }, { transform: 'none' }] : [{ transform: `translateX(${PARALLAX})` }, { transform: 'none' }],
        timing,
      ),
      ghost.animate(
        forward ? [{ transform: 'none' }, { transform: `translateX(${PARALLAX})` }] : [{ transform: 'none' }, { transform: 'translateX(100%)' }],
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
    dim?.remove()
    content.classList.remove('route-live')
    content.style.zIndex = ''
  }
  finish = done
  Promise.all(anims.map((a) => a.finished)).then(done, done)
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

  useLayoutEffect(() => {
    const s = snap
    snap = null
    const content = ref.current
    if (!s || !content || dir === 'none' || s.path === pathname || performance.now() - s.at > 800) return
    play(s, content, dir, pathname)
  }, [ref, pathname, dir])
}
