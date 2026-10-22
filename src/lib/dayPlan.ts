import { addDays } from './period'
import type { Task } from './types'

/**
 * План дня. Задача в «Сегодня», если она выбрана на этот день (plan_date), ежедневная,
 * лягушка этого дня (frog_date) или по ней идёт либо шёл учёт сегодня — последние
 * подтягиваются сами, выбирать их не нужно.
 */
export function isInDay(
  task: Task,
  today: string,
  activeTaskId: string | null | undefined,
  trackedTodayIds: ReadonlySet<string>,
): boolean {
  return (
    task.is_daily ||
    task.plan_date === today ||
    task.frog_date === today ||
    activeTaskId === task.id ||
    trackedTodayIds.has(task.id)
  )
}

export type PlanSectionKey = 'planned' | 'carry' | 'due' | 'recent' | 'rest'

export interface PlanSection {
  key: PlanSectionKey
  title: string
  tasks: Task[]
}

export const PLAN_SECTION_TITLE: Record<PlanSectionKey, string> = {
  planned: 'Уже в плане',
  carry: 'Не закончено со вчера',
  due: 'Срок подошёл',
  recent: 'Недавно в работе',
  rest: 'Остальные',
}

/** сколько дней назад выбранная и не закрытая задача ещё считается «с прошлых дней» */
const CARRY_DAYS = 3

interface CandidateInput {
  tasks: Task[]
  childrenOf: Map<string, Task[]>
  isDone: (t: Task) => boolean
  today: string
  /** задачи с учётом за последние недели, свежие первыми */
  recentTaskIds: string[]
  /** уже в дне без выбора (идёт учёт, был сегодня, ежедневные) — предлагать не нужно */
  lockedIds: ReadonlySet<string>
}

/**
 * Что предложить при выборе: сначала то, что вероятнее всего пойдёт в работу, дальше всё
 * остальное. Спринт с подзадачами сам не предлагается — в день идут его подзадачи.
 */
export function planSections(input: CandidateInput): PlanSection[] {
  const { tasks, childrenOf, isDone, today, recentTaskIds, lockedIds } = input
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const carryFrom = addDays(today, -CARRY_DAYS)

  const open = tasks.filter((t) => {
    if (lockedIds.has(t.id) || isDone(t)) return false
    const parent = t.parent_id ? byId.get(t.parent_id) : undefined
    return !(parent && isDone(parent))
  })

  const used = new Set<string>()
  const take = (list: Task[]) => {
    const out = list.filter((t) => !used.has(t.id))
    for (const t of out) used.add(t.id)
    return out
  }

  const planned = take(open.filter((t) => t.plan_date === today))
  // дальше — только то, во что можно положить часы: у спринта с открытыми подзадачами работа
  // в них. Если все подзадачи закрыты, предлагаем сам спринт — иначе открытый спринт пропадал
  // из окна целиком: подзадачи скрыты как готовые, а он — как «имеющий подзадачи»
  const leaves = open.filter((t) => !(childrenOf.get(t.id) ?? []).some((c) => !isDone(c)))
  const carry = take(
    leaves
      .filter((t) => t.plan_date && t.plan_date < today && t.plan_date >= carryFrom)
      .sort((a, b) => (b.plan_date ?? '').localeCompare(a.plan_date ?? '')),
  )
  const due = take(
    leaves
      .filter((t) => {
        if (!t.start_date && !t.end_date) return false
        return (!t.start_date || t.start_date <= today) && (!t.end_date || t.end_date >= today) ||
          (!!t.end_date && t.end_date < today)
      })
      .sort((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999')),
  )
  const leafById = new Map(leaves.map((t) => [t.id, t]))
  const recent = take(recentTaskIds.map((id) => leafById.get(id)).filter((t): t is Task => !!t))
  const rest = take(leaves)

  const sections: PlanSection[] = [
    { key: 'planned', title: PLAN_SECTION_TITLE.planned, tasks: planned },
    { key: 'carry', title: PLAN_SECTION_TITLE.carry, tasks: carry },
    { key: 'due', title: PLAN_SECTION_TITLE.due, tasks: due },
    { key: 'recent', title: PLAN_SECTION_TITLE.recent, tasks: recent },
    { key: 'rest', title: PLAN_SECTION_TITLE.rest, tasks: rest },
  ]
  return sections.filter((s) => s.tasks.length > 0)
}

/** Что записать в базу после выбора: кто добавился в день и кто снят с него. */
export function planDiff(current: ReadonlySet<string>, draft: ReadonlySet<string>) {
  return {
    add: [...draft].filter((id) => !current.has(id)),
    remove: [...current].filter((id) => !draft.has(id)),
  }
}
