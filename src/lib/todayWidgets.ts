/** виджеты «Сегодня» (0.57): что на экране и в каком порядке — на устройстве */
export type TodayWidget = 'day' | 'tile' | 'week' | 'overdue' | 'meetings' | 'plan' | 'recent'
/** ширина виджета в сетке на компьютере (0.65): половина строки или вся */
export type WidgetSize = 'half' | 'full'

export const WIDGET_LABEL: Record<TodayWidget, { title: string; hint: string }> = {
  day: { title: 'День', hint: 'кольцо нормы, сколько осталось' },
  tile: { title: 'Плитка дня', hint: 'в карточке дня, справа' },
  week: { title: 'Неделя', hint: 'столбики по дням' },
  overdue: { title: 'Просрочено', hint: 'перенести срок в одно касание' },
  meetings: { title: 'Встречи', hint: 'из Google Календаря' },
  plan: { title: 'План дня', hint: 'задачи на сегодня' },
  recent: { title: 'Недавние', hint: 'продолжить начатое' },
}
export const ALL_WIDGETS: TodayWidget[] = ['day', 'tile', 'overdue', 'meetings', 'plan', 'week', 'recent']

export type WidgetPrefs = { order: TodayWidget[]; on: TodayWidget[]; size?: Partial<Record<TodayWidget, WidgetSize>> }
export const DEFAULT_WIDGETS: WidgetPrefs = { order: ALL_WIDGETS, on: ALL_WIDGETS, size: {} }

/** списки — широкие, сводки (день, неделя, встречи, просрочено) — по половине */
const DEFAULT_SIZE: Record<TodayWidget, WidgetSize> = {
  day: 'half',
  tile: 'half',
  week: 'half',
  overdue: 'half',
  meetings: 'half',
  plan: 'full',
  recent: 'full',
}

/** сохранённое — к текущему набору: новые виджеты дописываются в конец, неизвестные отбрасываются */
export function normalizeWidgets(stored: WidgetPrefs): Required<WidgetPrefs> {
  return {
    order: [...stored.order.filter((w) => ALL_WIDGETS.includes(w)), ...ALL_WIDGETS.filter((w) => !stored.order.includes(w))],
    on: stored.on.filter((w) => ALL_WIDGETS.includes(w)),
    size: stored.size ?? {},
  }
}

export function widgetSize(prefs: WidgetPrefs, id: TodayWidget): WidgetSize {
  return prefs.size?.[id] ?? DEFAULT_SIZE[id]
}

/** виджет id встаёт на место target (target сдвигается дальше или ближе — как при перетаскивании) */
export function moveWidget(order: TodayWidget[], id: TodayWidget, target: TodayWidget): TodayWidget[] {
  const from = order.indexOf(id)
  const to = order.indexOf(target)
  if (from < 0 || to < 0 || from === to) return order
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/** на шаг раньше или позже среди видимых (клавиатурой); скрытые остаются где были */
export function stepWidget(order: TodayWidget[], visible: TodayWidget[], id: TodayWidget, step: -1 | 1): TodayWidget[] {
  const i = visible.indexOf(id)
  const target = visible[i + step]
  return i < 0 || !target ? order : moveWidget(order, id, target)
}
