import { useEffect, useSyncExternalStore } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'
import type { ActiveTimer } from './types'

/*
 * Комментарий к идущему учёту. Пока учёт идёт, текст лежит черновиком на устройстве и
 * через полсекунды после ввода уходит в active_timers.note. При остановке или переключении
 * задачи последний текст едет вместе с нажатием (p_note), поэтому ничего не теряется: ни
 * без сети, ни если «Стоп» нажали раньше, чем сработало автосохранение.
 *
 * Черновик привязан к началу учёта: комментарий к прошлой сессии в новую не перетечёт.
 */

export const TIMER_NOTE_MAX = 2000
const KEY = 'semternity.timerNote'
const DELAY = 500

export type NoteStatus = 'idle' | 'saving' | 'saved' | 'offline'

interface Draft {
  startedAt: string
  text: string
  /** текст уже записан в базу */
  synced: boolean
}

const listeners = new Set<() => void>()
let draft: Draft | null = readDraft()
let status: NoteStatus = 'idle'
let debounce: ReturnType<typeof setTimeout> | null = null

function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY)
    const d = raw ? JSON.parse(raw) : null
    return d && typeof d.startedAt === 'string' && typeof d.text === 'string' ? { synced: false, ...d } : null
  } catch {
    return null
  }
}

function emit() {
  try {
    if (draft) localStorage.setItem(KEY, JSON.stringify(draft))
    else localStorage.removeItem(KEY)
  } catch {
    // хранилище недоступно — черновик живёт до перезагрузки
  }
  listeners.forEach((l) => l())
}

function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

const sameStart = (a: string, b: string) => Math.floor(new Date(a).getTime() / 1000) === Math.floor(new Date(b).getTime() / 1000)

/** Текст комментария идущего учёта: черновик этого устройства, иначе сохранённый в базе. */
export function timerNoteText(timer: Pick<ActiveTimer, 'started_at' | 'note'> | null | undefined): string {
  if (!timer) return ''
  if (draft && sameStart(draft.startedAt, timer.started_at)) return draft.text
  return timer.note ?? ''
}

async function push(qc: QueryClient) {
  const d = draft
  if (!d || d.synced) return
  if (!navigator.onLine) {
    status = 'offline'
    emit()
    return
  }
  status = 'saving'
  emit()
  const { data, error } = await supabase
    .from('active_timers')
    .update({ note: d.text.trim() ? d.text : null })
    .eq('started_at', d.startedAt)
    .select('started_at')
  if (draft !== d) return // пока ждали ответа, текст изменился — отправит следующий вызов
  if (error) {
    status = 'offline'
    emit()
    return
  }
  if (!data?.length) {
    // учёт уже остановлен (в другом месте) — комментарий ушёл бы в никуда
    draft = null
    status = 'idle'
    emit()
    return
  }
  draft = { ...d, synced: true }
  status = 'saved'
  qc.setQueryData<ActiveTimer | null>(['active_timer'], (t) => (t && sameStart(t.started_at, d.startedAt) ? { ...t, note: d.text.trim() ? d.text : null } : t))
  emit()
}

/** Записать новый текст; в базу он уйдёт через полсекунды тишины. */
export function setTimerNote(qc: QueryClient, startedAt: string, text: string) {
  draft = { startedAt, text: text.slice(0, TIMER_NOTE_MAX), synced: false }
  status = 'saving'
  emit()
  if (debounce) clearTimeout(debounce)
  debounce = setTimeout(() => {
    debounce = null
    void push(qc)
  }, DELAY)
}

/**
 * Забрать черновик для нажатия «Стоп» или переключения задачи. undefined — на этом
 * устройстве комментарий не трогали: сервер оставит тот, что сохранён.
 */
export function takeTimerNote(startedAt: string | null | undefined): string | undefined {
  if (!startedAt || !draft || !sameStart(draft.startedAt, startedAt)) return undefined
  const text = draft.text
  if (debounce) clearTimeout(debounce)
  debounce = null
  draft = null
  status = 'idle'
  emit()
  return text
}

export function useTimerNote(timer: Pick<ActiveTimer, 'started_at' | 'note'> | null | undefined) {
  const qc = useQueryClient()
  useSyncExternalStore(subscribe, () => draft)
  const s = useSyncExternalStore(subscribe, () => status)
  // черновик чужой сессии (учёт сменился на другом устройстве) — выбрасываем
  useEffect(() => {
    if (draft && (!timer || !sameStart(draft.startedAt, timer.started_at)) && draft.synced) {
      draft = null
      status = 'idle'
      emit()
    }
  }, [timer])
  // вернулась сеть или приложение открыли заново — дослать несохранённое
  useEffect(() => {
    const onOnline = () => void push(qc)
    window.addEventListener('online', onOnline)
    if (timer && draft && !draft.synced && !debounce) void push(qc)
    return () => window.removeEventListener('online', onOnline)
  }, [qc, timer])
  return {
    text: timerNoteText(timer),
    status: s,
    setText: (text: string) => timer && setTimerNote(qc, timer.started_at, text),
  }
}


/** Первая строка комментария — подписью в плашке учёта. */
export function useTimerNotePreview(timer: Pick<ActiveTimer, 'started_at' | 'note'> | null | undefined): string {
  const { text } = useTimerNote(timer)
  return text.trim().split('\n')[0] ?? ''
}
