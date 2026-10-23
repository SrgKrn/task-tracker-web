import { useEffect, useSyncExternalStore } from 'react'
import type { HelpId } from './help'

/**
 * Подсказки рядом с функциями (0.43 «Первые шаги»).
 *
 * Как работает: экран, где живёт функция, говорит «условие подсказки выполнено» —
 * useTip(id, условие), а саму кнопку помечает атрибутом data-tip="id". TipHost берёт
 * первую в порядке TIP_IDS подсказку, у которой условие выполнено, она ещё не закрыта и её
 * кнопка видна, — и показывает рядом. Лимита в день нет (решение владельца): дошёл до
 * функции — показываем. На экране одна подсказка за раз, остальные ждут своей очереди.
 *
 * Отметки «закрыта» — в user_settings.tips (одни на все устройства). Список ниже должен
 * совпадать с миграцией 0039 — её отметки для старых аккаунтов (тест сверяет).
 */
export const TIP_IDS = [
  'new-task',
  'timer',
  'ring',
  'timer-note',
  'stage',
  'groups',
  'subtasks',
  'drag',
  'summary',
  'focus',
  'tile',
  'method',
  'history',
  'telegram',
  'workspaces',
  'export',
] as const

export type TipId = (typeof TIP_IDS)[number]

export interface TipDef {
  title: string
  text: string
  /** статья справки для «Подробнее» */
  help: HelpId
  /** вместо «Понятно» — кнопка следующего шага */
  action?: { label: string; to: string }
}

/** первые шаги первого дня — с подписью «1 из 3» */
export const FIRST_STEPS: TipId[] = ['new-task', 'timer', 'ring']

export const TIPS: Record<TipId, TipDef> = {
  'new-task': {
    title: 'Новая задача',
    text: 'Здесь создаются задачи. Достаточно названия, остальное можно добавить потом.',
    help: 'tasks',
  },
  timer: {
    title: 'Учёт времени',
    text: 'Нажмите, когда начинаете. Время пойдёт само, даже если закрыть приложение, и запишется в историю задачи.',
    help: 'timer',
  },
  ring: {
    title: 'Кольцо дня',
    text: 'Здесь копится всё время за день. Задайте норму, например 6 ч, и кольцо покажет, сколько осталось.',
    help: 'ring',
    action: { label: 'Задать норму', to: '/settings/plan' },
  },
  'timer-note': {
    title: 'Комментарий к учёту',
    text: 'Запишите, что делаете сейчас. Комментарий сохранится в истории задачи и попадёт в отчёт.',
    help: 'timer-note',
  },
  stage: {
    title: 'Этап',
    text: 'Этап показывает, где сейчас задача. Последний этап закрывает её — она уйдёт из списков дня.',
    help: 'stages',
  },
  groups: {
    title: 'Группы',
    text: 'Разложите задачи по проектам, клиентам или сферам. Появятся цвета, итоги по каждой группе и отчёт по клиенту.',
    help: 'groups',
    action: { label: 'Создать группу', to: '/groups' },
  },
  subtasks: {
    title: 'Подзадачи',
    text: 'Большую задачу можно разбить на шаги. Часы подзадач сойдутся в эту задачу.',
    help: 'subtasks',
  },
  drag: {
    title: 'Свой порядок',
    text: 'Удерживайте задачу и перетащите её на другое место — список запомнит ваш порядок.',
    help: 'tasks',
  },
  summary: {
    title: 'Сводка',
    text: 'Часы за неделю, месяц или свой период: по задачам и группам, план рядом с фактом. Отсюда же — отчёт.',
    help: 'summary',
  },
  focus: {
    title: 'Фокус',
    text: 'Работа отрезками с перерывами: Pomodoro или 90/30. Рабочие отрезки сами пишутся в учёт задачи.',
    help: 'focus',
  },
  tile: {
    title: 'Плитка дня',
    text: 'Ваш день из цветных пятен: каждое — заход учёта, цвет — группа. Из плиток складывается мозаика месяца.',
    help: 'tile',
  },
  method: {
    title: 'Что делать первым',
    text: 'Методика помогает выбрать главное на день: Эйзенхауэр, «лягушка», 1-3-5 или ABCDE.',
    help: 'method',
    action: { label: 'Выбрать методику', to: '/settings/method' },
  },
  history: {
    title: 'Хронология',
    text: 'Что и когда менялось: учёт, этапы, сроки и правки по дням. Удобно, если надо вспомнить, где ушло время.',
    help: 'history',
  },
  telegram: {
    title: 'Telegram',
    text: 'Итоги дня, напоминания о забытом учёте и команды /timer, /today — прямо в Telegram.',
    help: 'integrations',
  },
  workspaces: {
    title: 'Пространства',
    text: 'Держите личное отдельно от работы: у каждого пространства свои задачи, группы, этапы и норма.',
    help: 'workspaces',
  },
  export: {
    title: 'Отчёт',
    text: 'PDF или Excel за любой период, а клиенту — ссылка на отчёт без входа в приложение.',
    help: 'summary',
  },
}

/** Что показывать: первая по порядку подсказка, чьё условие выполнено и которую ещё не закрыли. */
export function pickTip(candidates: ReadonlySet<TipId>, seen: Readonly<Record<string, unknown>>, enabled: boolean): TipId[] {
  if (!enabled) return []
  return TIP_IDS.filter((id) => candidates.has(id) && !(id in seen))
}

/** «1 из 3 · первые шаги» — только у цепочки первого дня */
export function stepLabel(id: TipId): string | null {
  const i = FIRST_STEPS.indexOf(id)
  return i < 0 ? null : `${i + 1} из ${FIRST_STEPS.length} · первые шаги`
}

/* ── кто сейчас готов показать подсказку ─────────────────────────────── */

const counts = new Map<TipId, number>()
const listeners = new Set<() => void>()
let snapshot: ReadonlySet<TipId> = new Set()

function emit() {
  snapshot = new Set([...counts].filter(([, n]) => n > 0).map(([id]) => id))
  listeners.forEach((l) => l())
}

/** Экран сообщает: условие подсказки выполнено. Кнопку помечает data-tip="id". */
export function useTip(id: TipId, when: boolean) {
  useEffect(() => {
    if (!when) return
    counts.set(id, (counts.get(id) ?? 0) + 1)
    emit()
    return () => {
      counts.set(id, (counts.get(id) ?? 1) - 1)
      emit()
    }
  }, [id, when])
}

export function useTipCandidates(): ReadonlySet<TipId> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => snapshot,
    () => snapshot,
  )
}

/** Подсказка по условию — для мест, где хук в цикле не вызвать (пункты меню). */
export function TipWhen({ id, when }: { id: TipId; when: boolean }) {
  useTip(id, when)
  return null
}
