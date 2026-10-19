import { addDays } from './period'
import type { AbcLetter, Effort, PriorityMethod, Task } from './types'

/**
 * Методики приоритизации. Методика одна на всё приложение (user_settings.priority_method),
 * а отметки всех методик хранятся у задачи независимо — переключение ничего не стирает.
 */

/* ── Эйзенхауэр ─────────────────────────────────────────────────── */

export type Quadrant = 1 | 2 | 3 | 4

/** срок ближе стольких дней делает задачу срочной сам — пока пользователь не решил иначе */
export const AUTO_URGENT_DAYS = 2

/** «Срочно» по сроку: до конца два дня или меньше, просроченное — тоже. */
export function isAutoUrgent(task: Pick<Task, 'end_date'>, today: string): boolean {
  return !!task.end_date && task.end_date <= addDays(today, AUTO_URGENT_DAYS)
}

/** срочность с учётом выбора пользователя: null у задачи — решает срок */
export function isUrgent(task: Pick<Task, 'end_date' | 'urgent'>, today: string): boolean {
  return task.urgent ?? isAutoUrgent(task, today)
}

/**
 * Квадрант: 1 — срочно и важно, 2 — важно, 3 — срочно, 4 — ни то ни другое.
 * null — задачу ещё не разобрали (важность не отмечена): ей место в «Разобрать».
 */
export function quadrantOf(task: Pick<Task, 'end_date' | 'urgent' | 'important'>, today: string): Quadrant | null {
  if (task.important === null || task.important === undefined) return null
  const urgent = isUrgent(task, today)
  if (task.important) return urgent ? 1 : 2
  return urgent ? 3 : 4
}

export const QUADRANT: Record<Quadrant, { title: string; hint: string; short: string }> = {
  1: { title: 'Сделать сейчас', hint: 'Срочно и важно', short: 'Сейчас' },
  2: { title: 'Запланировать', hint: 'Важно, не срочно', short: 'План' },
  3: { title: 'Поручить', hint: 'Срочно, не важно', short: 'Поручить' },
  4: { title: 'Убрать', hint: 'Не срочно и не важно', short: 'Убрать' },
}

/* ── цвета отметок: смысловые тона дизайн-системы, не акцент ───────── */

export const QUADRANT_TONE: Record<Quadrant, string> = {
  1: 'bg-danger-soft text-danger-text',
  2: 'bg-info-soft text-info-text',
  3: 'bg-warning-soft text-warning-text',
  4: 'bg-surface-sunken text-text-secondary',
}

export const ABC_TONE: Record<AbcLetter, string> = {
  A: 'bg-danger-soft text-danger-text',
  B: 'bg-warning-soft text-warning-text',
  C: 'bg-info-soft text-info-text',
  D: 'bg-surface-sunken text-text-secondary',
  E: 'bg-surface-sunken text-text-tertiary',
}

/* ── правило 1-3-5 ──────────────────────────────────────────────── */

export const EFFORT_SLOTS: Record<Effort, number> = { big: 1, medium: 3, small: 5 }
export const EFFORT_ORDER: Effort[] = ['big', 'medium', 'small']
export const EFFORT_LABEL: Record<Effort, { title: string; one: string; hint: string }> = {
  big: { title: '1 большая', one: 'Большая', hint: '2–8 ч' },
  medium: { title: '3 средних', one: 'Средняя', hint: '30 мин – 2 ч' },
  small: { title: '5 мелких', one: 'Мелкая', hint: 'до 30 мин' },
}

/** больше рабочего дня — это проект (спринт клиента): в день идёт его кусок, а не он целиком */
export const PROJECT_HOURS = 8

/**
 * Размер по плану часов: от 2 до 8 ч — большая, от 30 мин — средняя, меньше — мелкая.
 * План больше 8 ч — у спринта это план на месяц, в день из него берётся кусок: средняя.
 */
export function suggestEffort(plannedHours: number): Effort {
  if (plannedHours > PROJECT_HOURS) return 'medium'
  if (plannedHours >= 2) return 'big'
  if (plannedHours > 0 && plannedHours < 0.5) return 'small'
  // без плана — средняя: о задаче ничего не известно, а средних мест больше всего
  return 'medium'
}

export function effortOf(task: Pick<Task, 'effort' | 'planned_hours'>): Effort {
  return task.effort ?? suggestEffort(task.planned_hours)
}

export interface DaySlots<T> {
  big: T[]
  medium: T[]
  small: T[]
  /** не влезло: мест этого размера больше нет — кандидаты на завтра */
  overflow: T[]
}

/**
 * Раскладка дня по местам 1-3-5. Порядок входа сохраняется: кто раньше, тот и занял место —
 * поэтому закрытые и идущие задачи стоит передавать первыми, их из дня уже не убрать.
 */
export function layoutDay<T extends Pick<Task, 'effort' | 'planned_hours'>>(tasks: T[]): DaySlots<T> {
  const out: DaySlots<T> = { big: [], medium: [], small: [], overflow: [] }
  for (const t of tasks) {
    const e = effortOf(t)
    if (out[e].length < EFFORT_SLOTS[e]) out[e].push(t)
    else out.overflow.push(t)
  }
  return out
}

/* ── ABCDE ──────────────────────────────────────────────────────── */

export const ABC_LETTERS: AbcLetter[] = ['A', 'B', 'C', 'D', 'E']
export const ABC_LABEL: Record<AbcLetter, { title: string; hint: string }> = {
  A: { title: 'A — обязательно', hint: 'Без неё будут серьёзные последствия' },
  B: { title: 'B — нужно', hint: 'Последствия мягкие' },
  C: { title: 'C — по желанию', hint: 'Приятно сделать, последствий нет' },
  D: { title: 'D — поручено', hint: 'Делает кто-то другой' },
  E: { title: 'E — вычеркнуть', hint: 'Можно не делать совсем' },
}

/** «A-1», «D» — у D и E номер не нужен */
export function abcLabel(task: Pick<Task, 'abc_letter' | 'abc_rank'>): string | null {
  if (!task.abc_letter) return null
  const ranked = task.abc_letter <= 'C' && task.abc_rank
  return ranked ? `${task.abc_letter}-${task.abc_rank}` : task.abc_letter
}

/** порядок ABCDE: буква, внутри буквы номер; без буквы и без номера — в конце */
export function compareAbc(a: Pick<Task, 'abc_letter' | 'abc_rank'>, b: Pick<Task, 'abc_letter' | 'abc_rank'>): number {
  const la = a.abc_letter ?? 'Z'
  const lb = b.abc_letter ?? 'Z'
  if (la !== lb) return la < lb ? -1 : 1
  return (a.abc_rank ?? 9999) - (b.abc_rank ?? 9999)
}

/** номер для задачи, которую только что отнесли к букве: следующий после последнего */
export function nextAbcRank(tasks: Pick<Task, 'id' | 'abc_letter' | 'abc_rank'>[], letter: AbcLetter, exceptId?: string): number {
  let max = 0
  for (const t of tasks) if (t.id !== exceptId && t.abc_letter === letter) max = Math.max(max, t.abc_rank ?? 0)
  return max + 1
}

/* ── лягушка ────────────────────────────────────────────────────── */

export function frogOf<T extends Pick<Task, 'frog_date'>>(tasks: T[], day: string): T | undefined {
  return tasks.find((t) => t.frog_date === day)
}

/* ── общий порядок для списков ─────────────────────────────────── */

/**
 * Сравнение по методике для списка «Задачи»: квадранты, буквы, крупные дела первыми,
 * лягушка сверху. 0 — методика порядка не задаёт, решает следующая сортировка.
 */
export function comparePriority(method: PriorityMethod, today: string) {
  return (a: Task, b: Task): number => {
    switch (method) {
      case 'eisenhower':
        return (quadrantOf(a, today) ?? 5) - (quadrantOf(b, today) ?? 5)
      case 'abcde':
        return compareAbc(a, b)
      case '135':
        return EFFORT_ORDER.indexOf(effortOf(a)) - EFFORT_ORDER.indexOf(effortOf(b))
      case 'frog':
        return Number(b.frog_date === today) - Number(a.frog_date === today)
      default:
        return 0
    }
  }
}

/* ── описания методик для экрана «Как работает» ─────────────────── */

export interface MethodInfo {
  name: string
  short: string
  origin: string
  lead: string
  /** шаги: метка слева (1, A, …) и текст */
  steps: [string, string][]
  fits: string
  changes: string[]
}

export const METHOD_ORDER: Exclude<PriorityMethod, 'none'>[] = ['eisenhower', 'frog', '135', 'abcde']

export const METHODS: Record<Exclude<PriorityMethod, 'none'>, MethodInfo> = {
  eisenhower: {
    name: 'Матрица Эйзенхауэра',
    short: 'Срочно × важно — четыре квадранта',
    origin:
      'Принцип приписывают Дуайту Эйзенхауэру, в систему его превратил Стивен Кови в «7 навыках высокоэффективных людей».',
    lead: 'Каждой задаче задаются два вопроса: срочно ли и важно ли. Ответы раскладывают дела по четырём квадрантам, и для каждого понятно, что делать.',
    steps: [
      ['1', 'Срочно и важно — сделать сегодня, первым делом.'],
      ['2', 'Важно, но не срочно — назначить день. Здесь растут клиенты и навыки.'],
      ['3', 'Срочно, но не важно — поручить или сделать быстро.'],
      ['4', 'Не срочно и не важно — убрать из списка.'],
    ],
    fits: 'Входящих много, и всё кажется горящим.',
    changes: [
      'В карточке задачи — «Срочно» и «Важно».',
      '«Сегодня» раскладывает день по квадрантам, начиная с первого.',
      'Срок ближе двух дней сам включает «Срочно» — можно снять вручную.',
      'Задачи без отметки важности ждут в «Разобрать».',
    ],
  },
  frog: {
    name: 'Съешь лягушку',
    short: 'Самое трудное — первым',
    origin:
      'Брайан Трейси, книга «Съешьте лягушку!». Название — по шутке, которую приписывают Марку Твену: съешь с утра живую лягушку, и худшее за день позади.',
    lead: 'Лягушка — самая трудная и важная задача дня, та, которую хочется отложить. Её делают первой, до почты и мелочей. Лягушка одна в день.',
    steps: [
      ['1', 'Вечером выбрать лягушку на завтра.'],
      ['2', 'Утром начать с неё, ничего не открывая перед этим.'],
      ['3', 'Не переключаться, пока она не сделана.'],
      ['4', 'Остальное — после.'],
    ],
    fits: 'Важное откладывается, а день уходит на мелочи.',
    changes: [
      'Сверху «Сегодня» — карточка лягушки, остальной план приглушён, пока она не начата.',
      '«Начать» сразу запускает учёт по ней.',
      'Когда лягушка готова, можно сразу выбрать лягушку на завтра — она сама попадёт в завтрашний день.',
    ],
  },
  '135': {
    name: 'Правило 1-3-5',
    short: '1 большое, 3 средних, 5 мелких',
    origin: 'Правило популяризировала Алекс Кавулакос, сооснователь карьерного сервиса The Muse.',
    lead: 'В рабочий день помещается одно большое дело, три средних и пять мелких — девять пунктов. План, собранный по этим местам, совпадает с реальной ёмкостью дня.',
    steps: [
      ['1', 'Выбрать одну большую задачу — то, что двигает главное.'],
      ['3', 'Добавить три средних — по часу-полтора.'],
      ['5', 'Заполнить пять мелких: звонки, счета, ответы.'],
      ['+', 'Не влезло — значит, завтра.'],
    ],
    fits: 'План на день всегда длиннее, чем сам день.',
    changes: [
      '«Сегодня» раскладывает задачи по девяти местам вместо одного списка.',
      'Размер подсказывается по плану часов: от 2 до 8 ч — большая, от 30 мин — средняя, меньше — мелкая. У спринта с планом на месяц в день идёт кусок — он средний. Можно поменять в карточке.',
      'То, что не влезло, видно отдельно — одной кнопкой переносится на завтра.',
    ],
  },
  abcde: {
    name: 'Метод ABCDE',
    short: 'Буква по последствиям',
    origin: 'Тоже Брайан Трейси: идея лягушки, разложенная на весь список.',
    lead: 'Каждой задаче ставится буква по тому, что будет, если её не сделать. Внутри буквы — номер по порядку: A-1 делается первой.',
    steps: [
      ['A', 'Обязательно: без неё будут серьёзные последствия.'],
      ['B', 'Нужно, но последствия мягкие.'],
      ['C', 'Приятно сделать, последствий нет.'],
      ['D', 'Поручить другому.'],
      ['E', 'Вычеркнуть.'],
    ],
    fits: 'Длинный список, где всё кажется одинаково нужным.',
    changes: [
      'В строке задачи — буква и номер: A-1, A-2, B-1.',
      '«Сегодня» и «Задачи» идут по буквам, внутри — по номеру.',
      'Пока есть невыполненные A, задачи B и C приглушены.',
      'У D можно записать, кому поручено.',
    ],
  },
}
