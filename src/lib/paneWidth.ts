/** Ширина списка задач на компьютере (0.60): тянется границей, запоминается на устройстве. */
/** 0.62: под таблицу с колонками — шире, чем строки телефона; карточке на 1440 остаётся ~630 */
export const LIST_WIDTH_DEFAULT = 560
const MIN = 320
const MAX = 720
const KEY = 'semternity.listWidth'

export function clampListWidth(w: number): number {
  return Math.round(Math.min(MAX, Math.max(MIN, w)))
}

export function loadListWidth(): number {
  try {
    const raw = Number(localStorage.getItem(KEY))
    return raw ? clampListWidth(raw) : LIST_WIDTH_DEFAULT
  } catch {
    return LIST_WIDTH_DEFAULT
  }
}

export function saveListWidth(w: number) {
  try {
    localStorage.setItem(KEY, String(clampListWidth(w)))
  } catch {
    // приватный режим — просто не запоминаем
  }
}
