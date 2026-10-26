import { useSyncExternalStore } from 'react'

/**
 * Настройки устройства в localStorage с подпиской — для вида экранов (папки «Задач»,
 * виджеты «Сегодня»). В базу не пишем: это вкус конкретного телефона, а не данные.
 */
const listeners = new Map<string, Set<() => void>>()
const cache = new Map<string, unknown>()

function read<T>(key: string, fallback: T): T {
  if (cache.has(key)) return cache.get(key) as T
  let value = fallback
  try {
    const raw = localStorage.getItem(key)
    if (raw !== null) {
      const parsed = JSON.parse(raw)
      value = (Array.isArray(fallback) ? parsed : { ...(fallback as object), ...parsed }) as T
    }
  } catch {
    // нет хранилища или мусор в нём — значения по умолчанию
  }
  cache.set(key, value)
  return value
}

export function setPref<T>(key: string, value: T) {
  cache.set(key, value)
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // не запомнили — до перезапуска всё равно работает
  }
  listeners.get(key)?.forEach((l) => l())
}

export function usePref<T extends object>(key: string, fallback: T): [T, (next: T) => void] {
  const value = useSyncExternalStore(
    (l) => {
      const set = listeners.get(key) ?? new Set()
      set.add(l)
      listeners.set(key, set)
      return () => set.delete(l)
    },
    () => read(key, fallback),
    () => fallback,
  )
  return [value, (next: T) => setPref(key, next)]
}
