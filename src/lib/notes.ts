import type { TimeEntry } from './types'

/**
 * Старые версии приложения сами подписывали каждую ручную правку «Manual correction».
 * Это не комментарий пользователя — такие записи считаем пустыми, иначе служебная
 * пометка всплыла бы под каждой правкой в таймлайне, хронологии и журнале отчёта.
 */
const SERVICE_NOTES = new Set(['Manual correction'])

/** комментарий к сессии учёта или правке — или null, если его нет */
export function entryNote(entry: Pick<TimeEntry, 'note'>): string | null {
  const note = entry.note?.trim()
  return note && !SERVICE_NOTES.has(note) ? note : null
}
