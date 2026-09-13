import { useCallback, useSyncExternalStore } from 'react'

/**
 * Какие спринты раскрыты в списке. Живёт в localStorage: ушли в карточку, вернулись —
 * спринт всё ещё раскрыт, а не схлопнулся обратно. Хранилище общее для всех экранов,
 * поэтому раскрытие в «Задачах» совпадает с раскрытием на странице проекта.
 */
const KEY = 'semternity.expanded'

function read(): Record<string, true> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, true>) : {}
  } catch {
    return {}
  }
}

let state = read()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function setOpen(id: string, open: boolean) {
  if (!!state[id] === open) return
  const next = { ...state }
  if (open) next[id] = true
  else delete next[id]
  state = next
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // приватный режим или запрет на хранение — раскрытие просто не переживёт перезагрузку
  }
  listeners.forEach((l) => l())
}

export function useExpanded(id: string): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(subscribe, () => !!state[id])
  const set = useCallback((value: boolean) => setOpen(id, value), [id])
  return [open, set]
}

/**
 * Для какой подзадачи спринт уже раскрывался сам. Без этой памяти спринт раскрывался бы
 * заново при каждом возврате на экран, и свернуть его, пока идёт учёт, было бы невозможно.
 * Живёт до перезагрузки: после неё раскрыть один раз снова — нормально.
 */
const autoOpenedFor = new Map<string, string>()

/** раскрывает спринт, когда учёт начался по новой его подзадаче; повторно — не трогает */
export function autoExpandFor(headId: string, runningChildId: string | null | undefined) {
  if (!runningChildId || autoOpenedFor.get(headId) === runningChildId) return
  autoOpenedFor.set(headId, runningChildId)
  setOpen(headId, true)
}
