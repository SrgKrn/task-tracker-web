import { useSyncExternalStore } from 'react'
import { compareManual } from './dragSort'
import { comparePriority } from './priority'
import type { PriorityMethod, Task } from './types'


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

/** «По методике» без выбранной методики ничего не значит — тогда по сроку. */
export function effectiveSort(sort: TaskSort, method: PriorityMethod): TaskSort {
  return sort === 'method' && method === 'none' ? 'due' : sort
}

const byDue = (a: Task, b: Task) => {
  if (!a.end_date && !b.end_date) return 0
  if (!a.end_date) return 1
  if (!b.end_date) return -1
  return a.end_date.localeCompare(b.end_date)
}

/**
 * Головные задачи в порядке выбранного режима — тот же, что видит человек в «Задачах».
 * На входе — задачи в порядке загрузки (новые выше), это и есть «по созданию».
 */
export function sortHeads(list: Task[], sort: TaskSort, method: PriorityMethod, today: string): Task[] {
  if (sort === 'created') return list
  if (sort === 'manual') return [...list].sort(compareManual)
  // по методике — внутри равных по приоритету задач порядок по сроку
  const byMethod = comparePriority(method, today)
  return [...list].sort(sort === 'method' ? (a, b) => byMethod(a, b) || byDue(a, b) : byDue)
}

export const TASK_SORT_LABEL: Record<TaskSort, string> = {
  due: 'По сроку',
  created: 'По созданию',
  method: 'По методике',
  manual: 'Свой порядок',
}

/* Подсказка «Удерживайте задачу…» — до первого перетаскивания, потом больше не нужна. */
const HINT_KEY = 'semternity.dragHintSeen'
const hintListeners = new Set<() => void>()
let hintSeen = (() => {
  try {
    return typeof window !== 'undefined' && localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
})()

export function markDragHintSeen() {
  if (hintSeen) return
  hintSeen = true
  try {
    localStorage.setItem(HINT_KEY, '1')
  } catch {
    // не запомнили — подсказка покажется ещё раз после перезапуска
  }
  hintListeners.forEach((l) => l())
}

export function useDragHintSeen(): boolean {
  return useSyncExternalStore(
    (l) => {
      hintListeners.add(l)
      return () => hintListeners.delete(l)
    },
    () => hintSeen,
    () => hintSeen,
  )
}
