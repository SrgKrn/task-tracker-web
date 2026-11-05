/**
 * Заголовок вкладки браузера (0.60): экран или задача, а пока идёт учёт — время впереди.
 * С пятью открытыми вкладками все назывались «Semternity».
 */
const SCREENS: [RegExp, string][] = [
  [/^\/$/, 'Сегодня'],
  [/^\/tasks\/new$/, 'Новая задача'],
  [/^\/tasks/, 'Задачи'],
  [/^\/dashboard/, 'Сводка'],
  [/^\/focus/, 'Фокус'],
  [/^\/history/, 'Хронология'],
  [/^\/mosaic/, 'Мозаика'],
  [/^\/(groups|items|sections|projects)/, 'Группы'],
  [/^\/statuses/, 'Этапы'],
  [/^\/changelog/, 'История изменений'],
  [/^\/admin/, 'Админка'],
  [/^\/settings/, 'Профиль'],
]

const APP = 'Semternity'

/** минуты учёта — без секунд: заголовок не должен мигать каждую секунду в списке вкладок */
export function timerLabel(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

export function documentTitle(pathname: string, taskName?: string | null, timerSeconds?: number | null): string {
  const screen = taskName?.trim() || SCREENS.find(([re]) => re.test(pathname))?.[1]
  const base = screen ? `${screen} — ${APP}` : APP
  return timerSeconds == null ? base : `▶ ${timerLabel(timerSeconds)} · ${base}`
}
