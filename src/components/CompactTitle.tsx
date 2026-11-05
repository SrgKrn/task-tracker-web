import { useEffect, useRef, useState } from 'react'

/**
 * Большой заголовок сворачивается в шапку (0.60), как в iOS и Telegram. Пока крупный
 * заголовок экрана (h1) на виду — шапки нет. Ушёл под верхний край — сверху проявляется
 * матовая полоса с тем же названием по центру; сам крупный заголовок по дороге гаснет.
 * Касание полосы — наверх. Экранам с собственной липкой шапкой (карточка задачи) не нужна.
 */
export function CompactTitle({ pathname }: { pathname: string }) {
  const barRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ path: string; title: string; shown: boolean } | null>(null)

  useEffect(() => {
    let io: IntersectionObserver | null = null
    let raf = 0
    let tries = 0
    let h1: HTMLElement | null = null
    // заголовок появляется не сразу (экран грузится частями) — ищем несколько кадров
    const find = () => {
      h1 = document.querySelector<HTMLElement>('.app-content h1')
      if (!h1 || h1.closest('.sticky')) {
        if (++tries < 40) raf = requestAnimationFrame(find)
        return
      }
      const el = h1
      const title = el.textContent ?? ''
      const top = barRef.current?.offsetHeight ?? 56
      io = new IntersectionObserver(
        ([e]) => {
          // гаснет, пока уходит под шапку; совсем ушёл — шапка с названием
          el.style.opacity = e.isIntersecting ? String(Math.min(1, e.intersectionRatio * 1.25)) : '0'
          const gone = !e.isIntersecting && e.boundingClientRect.top < top
          setState((s) => (s?.path === pathname && s.title === title && s.shown === gone ? s : { path: pathname, title, shown: gone }))
        },
        { rootMargin: `-${top}px 0px 0px 0px`, threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
      )
      io.observe(el)
    }
    raf = requestAnimationFrame(find)
    return () => {
      cancelAnimationFrame(raf)
      io?.disconnect()
      if (h1) h1.style.opacity = ''
    }
  }, [pathname])

  const current = state?.path === pathname ? state : null
  return (
    <div
      ref={barRef}
      className="compact-title safe-top fixed inset-x-0 top-0 z-30 lg:hidden"
      data-shown={current?.shown || undefined}
      aria-hidden
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
    >
      <span className="block truncate px-16 text-center text-base leading-11 font-semibold text-text">{current?.title}</span>
    </div>
  )
}
