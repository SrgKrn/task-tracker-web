import { useSyncExternalStore } from 'react'

/**
 * Порядок задач — один на устройство и общий для списка и состава спринтов: «свой
 * порядок» включает перетаскивание и там, и там. Выбор запоминается: раньше после
 * перезапуска список всегда открывался «по сроку».
 */
export type TaskSort = 'manual' | 'due' | 'created' | 'method'

const KEY = 'semternity.taskSort'
const listeners = new Set<() => void>()

function read(): TaskSort {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'manual' || v === 'due' || v === 'created' || v === 'method') return v
  } catch {
    // нет хранилища — порядок по умолчанию
  }
  return 'due'
}

let current: TaskSort = typeof window === 'undefined' ? 'due' : read()

export function setTaskSort(next: TaskSort) {
  current = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // не запомнили — до перезапуска всё равно работает
  }
  listeners.forEach((l) => l())
}

export function useTaskSort(): TaskSort {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
    () => current,
  )
}
