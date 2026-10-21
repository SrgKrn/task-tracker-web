import { useEffect, useState } from 'react'

function typing(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true
  if (el.tagName !== 'INPUT') return false
  const type = (el as HTMLInputElement).type
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'file', 'date', 'color'].includes(type)
}

/**
 * Открыта ли экранная клавиатура. На iPhone клавиатура сжимает видимую часть экрана
 * (visualViewport), а не саму страницу, и после её закрытия Safari не всегда
 * возвращает страницу на место — закреплённая внизу панель «висела» посреди экрана,
 * пока не прокрутишь. Поэтому на закрытие клавиатуры страница пересчитывается
 * прокруткой на то же место.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let wasOpen = false
    let timer = 0
    const check = () => {
      const now = typing() && window.innerHeight - vv.height > 120
      if (wasOpen && !now) {
        // пересчёт положения закреплённых элементов после клавиатуры
        requestAnimationFrame(() => window.scrollTo(window.scrollX, window.scrollY))
      }
      wasOpen = now
      setOpen(now)
    }
    // поле потеряло фокус — клавиатура уезжает чуть позже события
    const later = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(check, 150)
    }
    vv.addEventListener('resize', check)
    vv.addEventListener('scroll', check)
    document.addEventListener('focusin', later)
    document.addEventListener('focusout', later)
    return () => {
      window.clearTimeout(timer)
      vv.removeEventListener('resize', check)
      vv.removeEventListener('scroll', check)
      document.removeEventListener('focusin', later)
      document.removeEventListener('focusout', later)
    }
  }, [])

  return open
}
