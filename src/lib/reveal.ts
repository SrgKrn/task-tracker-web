import { useLayoutEffect, useRef, type RefObject } from 'react'

/**
 * Данные пришли — строки проявляются лесенкой (0.60): по 40 мс, с подъёмом на 4 px.
 * Только после загрузки с заготовками: при возврате на экран из кэша строки стоят сразу.
 */
export function useRevealOnLoad(ref: RefObject<HTMLElement | null>, loading: boolean) {
  const was = useRef(loading)
  useLayoutEffect(() => {
    const came = was.current && !loading
    was.current = loading
    const box = ref.current
    if (!came || !box || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rows = [...box.querySelectorAll<HTMLElement>('.task-row')].slice(0, 12)
    const anims = rows.map((row, i) =>
      row.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], {
        duration: 320,
        delay: i * 40,
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
        fill: 'backwards',
      }),
    )
    return () => anims.forEach((a) => a.cancel())
  }, [ref, loading])
}
