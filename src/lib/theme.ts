import { useEffect, useSyncExternalStore } from 'react'

/**
 * Тема оформления — настройка этого устройства: на телефоне может быть светлая, на
 * ноутбуке тёмная. Первую отрисовку тему ставит скрипт в index.html, ещё до React,
 * иначе при запуске на долю секунды мигало бы тёмным.
 */
export type ThemeChoice = 'dark' | 'light' | 'system'

const KEY = 'semternity.theme'
const COLORS = { dark: '#0d0d0f', light: '#f6f5f2' }

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'system' ? v : 'dark'
  } catch {
    return 'dark'
  }
}

function resolve(choice: ThemeChoice): 'dark' | 'light' {
  if (choice !== 'system') return choice
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function apply(choice: ThemeChoice) {
  const theme = resolve(choice)
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme])
  // строка состояния iPhone: белые значки на тёмном, чёрные на светлом. Сам iOS читает
  // это при запуске, поэтому после смены темы она обновится со следующего открытия
  document
    .querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content', theme === 'light' ? 'default' : 'black-translucent')
}

let choice = read()
const listeners = new Set<() => void>()

export function setTheme(next: ThemeChoice) {
  choice = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // не запомнили — тема продержится до перезапуска
  }
  apply(next)
  listeners.forEach((l) => l())
}

export function useTheme(): ThemeChoice {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => choice,
  )

  // «как в системе» следит за переключением системы прямо на ходу
  useEffect(() => {
    if (value !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => apply('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [value])

  return value
}
