import { frogOf, layoutDay, quadrantOf, compareAbc } from './priority'
import type { FocusMode, FocusPhase, FocusSettings, PriorityMethod, Task } from './types'

/**
 * Фокус: работа короткими отрезками. Рабочий отрезок — обычный учёт по задаче, перерыв
 * учёт не пишет. Смену отрезков делает база (focus_advance) — здесь план, настройки и
 * то, что нужно экрану.
 */

export const FOCUS_DEFAULTS: Required<FocusSettings> = {
  pomodoro: { work: 25, short: 5, long: 15, cycles: 4 },
  deep: { work: 90, rest: 30 },
}

/** настройки пользователя поверх значений по умолчанию; мусор в базе не ломает экран */
export function focusSettingsOf(raw: FocusSettings | null | undefined): Required<FocusSettings> {
  const p = { ...FOCUS_DEFAULTS.pomodoro, ...(raw?.pomodoro ?? {}) }
  const d = { ...FOCUS_DEFAULTS.deep, ...(raw?.deep ?? {}) }
  const clamp = (v: number, min: number, max: number, def: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : def)
  return {
    pomodoro: {
      work: clamp(p.work, 5, 90, 25),
      short: clamp(p.short, 1, 30, 5),
      long: clamp(p.long, 5, 60, 15),
      cycles: clamp(p.cycles, 2, 8, 4),
    },
    deep: { work: clamp(d.work, 30, 180, 90), rest: clamp(d.rest, 5, 60, 30) },
  }
}

/**
 * План отрезков одного круга. Pomodoro: работа и короткий перерыв, после последней работы
 * — длинный. 90/30: работа и отдых. После последнего отрезка план идёт по кругу.
 */
export function buildPlan(mode: FocusMode, settings: Required<FocusSettings>): FocusPhase[] {
  if (mode === '9030') {
    return [
      { kind: 'work', seconds: settings.deep.work * 60 },
      { kind: 'break', seconds: settings.deep.rest * 60 },
    ]
  }
  const p = settings.pomodoro
  const plan: FocusPhase[] = []
  for (let i = 0; i < p.cycles; i++) {
    plan.push({ kind: 'work', seconds: p.work * 60 })
    plan.push(i === p.cycles - 1 ? { kind: 'long', seconds: p.long * 60 } : { kind: 'break', seconds: p.short * 60 })
  }
  return plan
}

export function phaseAt(plan: FocusPhase[], index: number): FocusPhase {
  return plan[((index % plan.length) + plan.length) % plan.length]
}

/** номер рабочего отрезка в круге (1…N) и сколько их в круге */
export function workNumber(plan: FocusPhase[], index: number): { n: number; of: number } {
  const i = ((index % plan.length) + plan.length) % plan.length
  const of = plan.filter((p) => p.kind === 'work').length
  const n = plan.slice(0, i + 1).filter((p) => p.kind === 'work').length
  return { n: Math.max(1, n), of }
}

/** осталось секунд у отрезка: у идущего — до конца, у остановленного — запомненное */
export function secondsLeft(
  run: { state: string; phase_ends_at: string | null; left_seconds: number | null },
  now = Date.now(),
): number {
  if (run.state === 'running' && run.phase_ends_at) return Math.max(0, Math.ceil((new Date(run.phase_ends_at).getTime() - now) / 1000))
  return run.left_seconds ?? 0
}

export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

export interface FocusPick {
  task: Task
  /** почему эта задача — подпись под карточкой */
  reason: string
}

/**
 * Какую задачу предложить: ту, с которой методика велит начать — лягушку, первый
 * квадрант, A-1, большую задачу дня. Без методики — то, что уже в учёте, или первое
 * открытое из плана дня.
 */
export function suggestTask(
  dayTasks: Task[],
  method: PriorityMethod,
  today: string,
  activeTaskId: string | null | undefined,
): FocusPick | null {
  if (dayTasks.length === 0) return null
  if (method === 'frog') {
    const frog = frogOf(dayTasks, today)
    if (frog) return { task: frog, reason: 'лягушка дня' }
  }
  if (method === 'eisenhower') {
    const q1 = dayTasks.find((t) => quadrantOf(t, today) === 1)
    if (q1) return { task: q1, reason: 'срочно и важно' }
    const q2 = dayTasks.find((t) => quadrantOf(t, today) === 2)
    if (q2) return { task: q2, reason: 'важно' }
  }
  if (method === 'abcde') {
    const first = [...dayTasks].filter((t) => t.abc_letter && t.abc_letter <= 'C').sort(compareAbc)[0]
    if (first) return { task: first, reason: `первая по списку, ${first.abc_letter}${first.abc_rank ? '-' + first.abc_rank : ''}` }
  }
  if (method === '135') {
    const big = layoutDay(dayTasks).big[0]
    if (big) return { task: big, reason: 'большая задача дня' }
  }
  const active = activeTaskId ? dayTasks.find((t) => t.id === activeTaskId) : undefined
  if (active) return { task: active, reason: 'уже в учёте' }
  return { task: dayTasks[0], reason: 'из плана дня' }
}

/* ── описания режимов ───────────────────────────────────────────── */

export const FOCUS_INFO: Record<FocusMode, {
  name: string
  short: string
  origin: string
  lead: string
  steps: [string, string][]
  fits: string
}> = {
  pomodoro: {
    name: 'Pomodoro',
    short: '25 минут работы, 5 — перерыв',
    origin: 'Франческо Чирилло, конец 1980-х. Таймер был кухонный, в форме помидора, по-итальянски pomodoro — отсюда название.',
    lead: 'Работа отрезками по 25 минут с перерывами по 5. Каждый отрезок — один pomodoro. После четырёх — длинный перерыв 15–30 минут.',
    steps: [
      ['1', 'Выбрать задачу и запустить 25 минут.'],
      ['2', 'Работать только над ней. Отвлекли — pomodoro начинается заново.'],
      ['3', 'Сигнал — перерыв 5 минут: встать, отойти от экрана.'],
      ['4', 'После четвёртого pomodoro — длинный перерыв.'],
    ],
    fits: 'Трудно начать, задача пугает размером, много мелочей, учёба.',
  },
  '9030': {
    name: '90/30',
    short: '90 минут глубокой работы, 30 — отдых',
    origin:
      'Опирается на исследования Натаниэля Клейтмана о полуторачасовом цикле активности. Для работы метод популяризировал Тони Шварц.',
    lead: 'Пик концентрации держится около полутора часов, потом нужен настоящий отдых. 90 минут — одна сложная задача без переключений, затем 30 минут без экрана.',
    steps: [
      ['1', 'Выбрать одну сложную задачу и запустить 90 минут.'],
      ['2', 'Уведомления выключены, почта закрыта.'],
      ['3', 'Отдых 30 минут (в настройках можно 20): пройтись, поесть, ничего не читать.'],
      ['4', 'Два-три таких цикла — полноценный день глубокой работы.'],
    ],
    fits: 'Сложная работа, в которую долго входить: дизайн, код, тексты, аналитика.',
  },
}

export const FOCUS_CHANGES = [
  'Время работы пишется в учёт задачи, перерывы — нет.',
  'Конец отрезка — звук и вибрация; приложение закрыто — пуш и сообщение в Telegram.',
  'После перерыва работа сама не начинается: учёт без вас не идёт.',
  'Остановили раньше — время в учёте, но отрезок не засчитан.',
  'Задачу предлагает выбранная методика приоритизации.',
]

export const BREAK_TIPS = ['Встаньте и пройдитесь', 'Посмотрите в окно — вдаль', 'Налейте воды', 'Разомните плечи и шею']
