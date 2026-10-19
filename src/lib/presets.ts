import type { FocusMode, LabelColor, PriorityMethod } from './types'

/**
 * Пресеты — готовые настройки под то, для чего человеку трекер. Применяет их база одной
 * функцией apply_preset: группы со связями, значения, этапы, норма, методика, фокус и
 * примеры задач. Значения с example — только вместе с примерами задач: «Студия Север»
 * в живом списке клиентов была бы мусором.
 */

export interface PresetValue {
  name: string
  color?: LabelColor
  /** название значения родительской группы, в которое это входит */
  parent?: string
  example?: boolean
}

export interface PresetGroup {
  key: string
  name: string
  item_name: string
  required: boolean
  show_in_list: boolean
  parent: string | null
  values: PresetValue[]
}

export interface Preset {
  code: string
  title: string
  sub: string
  groups: PresetGroup[]
  stages: { label: string; is_final?: boolean }[]
  settings: {
    priority_method: PriorityMethod
    focus_mode: FocusMode
    planned_hours_per_day: number | null
    planned_hours_per_month: number | null
    work_days_per_week: number
  }
  /** как норма звучит человеку */
  normLabel: string
  extras: string[]
  examples: { name: string; planned_hours: number; is_daily?: boolean; today?: boolean; values: { group: string; value: string }[] }[]
}

export const PRESETS: Preset[] = [
  {
    code: 'clients',
    title: 'Работа на клиентов',
    sub: 'Фриланс, агентство, почасовая оплата',
    groups: [
      { key: 'clients', name: 'Клиенты', item_name: 'Клиент', required: true, show_in_list: true, parent: null,
        values: [{ name: 'Студия Север', color: 'label-1', example: true }, { name: 'Кофейня Зерно', color: 'label-2', example: true }] },
      { key: 'projects', name: 'Проекты', item_name: 'Проект', required: true, show_in_list: true, parent: 'clients',
        values: [{ name: 'Сайт', parent: 'Студия Север', example: true }, { name: 'Меню', parent: 'Кофейня Зерно', example: true }] },
      { key: 'kinds', name: 'Виды работ', item_name: 'Вид работ', required: false, show_in_list: false, parent: null,
        values: [{ name: 'Дизайн' }, { name: 'Разработка' }, { name: 'Встречи' }, { name: 'Правки' }] },
    ],
    stages: [{ label: 'Бриф' }, { label: 'В работе' }, { label: 'Согласование' }, { label: 'Сдано', is_final: true }],
    settings: { priority_method: 'abcde', focus_mode: '9030', planned_hours_per_day: null, planned_hours_per_month: 140, work_days_per_week: 5 },
    normLabel: '140 ч в месяц, 5 дней в неделю',
    extras: ['Месячные спринты с планом часов', 'PDF-отчёт клиенту за период'],
    examples: [
      { name: 'Спринт 1 · Студия Север', planned_hours: 40, values: [{ group: 'projects', value: 'Сайт' }] },
      { name: 'Правки по макету', planned_hours: 2, today: true, values: [{ group: 'projects', value: 'Сайт' }, { group: 'kinds', value: 'Правки' }] },
      { name: 'Счёт за месяц', planned_hours: 0.25, today: true, values: [{ group: 'projects', value: 'Меню' }] },
    ],
  },
  {
    code: 'team',
    title: 'Работа в команде',
    sub: 'Офис, найм, проекты внутри компании',
    groups: [
      { key: 'areas', name: 'Направления', item_name: 'Направление', required: false, show_in_list: true, parent: null,
        values: [{ name: 'Маркетинг', color: 'label-4' }, { name: 'Продажи', color: 'label-2' }, { name: 'Внутреннее', color: 'label-8' }] },
      { key: 'projects', name: 'Проекты', item_name: 'Проект', required: true, show_in_list: true, parent: 'areas',
        values: [{ name: 'Запуск акции', parent: 'Маркетинг', example: true }, { name: 'CRM', parent: 'Продажи', example: true }, { name: 'Отчётность', parent: 'Внутреннее', example: true }] },
      { key: 'types', name: 'Тип задачи', item_name: 'Тип', required: false, show_in_list: false, parent: null,
        values: [{ name: 'Встреча' }, { name: 'Документ' }, { name: 'Разработка' }, { name: 'Ревью' }] },
    ],
    stages: [{ label: 'Бэклог' }, { label: 'В работе' }, { label: 'На проверке' }, { label: 'Готово', is_final: true }],
    settings: { priority_method: 'eisenhower', focus_mode: 'pomodoro', planned_hours_per_day: 8, planned_hours_per_month: null, work_days_per_week: 5 },
    normLabel: '8 ч в день, 5 дней в неделю',
    extras: ['Встречи из Google Календаря в «Сегодня»', 'Итоги дня в Telegram'],
    examples: [
      { name: 'Квартальный отчёт', planned_hours: 3, today: true, values: [{ group: 'projects', value: 'Отчётность' }, { group: 'types', value: 'Документ' }] },
      { name: 'Созвон с подрядчиком', planned_hours: 0.5, today: true, values: [{ group: 'projects', value: 'CRM' }, { group: 'types', value: 'Встреча' }] },
      { name: 'Ревью макета акции', planned_hours: 1, values: [{ group: 'projects', value: 'Запуск акции' }, { group: 'types', value: 'Ревью' }] },
    ],
  },
  {
    code: 'study',
    title: 'Учёба',
    sub: 'Школа, вуз, курсы, подготовка к экзамену',
    groups: [
      { key: 'subjects', name: 'Предметы', item_name: 'Предмет', required: true, show_in_list: true, parent: null,
        values: [{ name: 'Математика', color: 'label-2', example: true }, { name: 'Английский', color: 'label-6', example: true }, { name: 'История', color: 'label-5', example: true }] },
      { key: 'topics', name: 'Темы', item_name: 'Тема', required: false, show_in_list: true, parent: 'subjects',
        values: [{ name: 'Производные', parent: 'Математика', example: true }, { name: 'Эссе', parent: 'Английский', example: true }] },
      { key: 'kinds', name: 'Тип занятия', item_name: 'Тип', required: false, show_in_list: false, parent: null,
        values: [{ name: 'Лекция' }, { name: 'Домашка' }, { name: 'Конспект' }, { name: 'Экзамен' }] },
    ],
    stages: [{ label: 'Не начато' }, { label: 'Изучаю' }, { label: 'Повторить' }, { label: 'Сдано', is_final: true }],
    settings: { priority_method: '135', focus_mode: 'pomodoro', planned_hours_per_day: 4, planned_hours_per_month: null, work_days_per_week: 6 },
    normLabel: '4 ч в день, 6 дней в неделю',
    extras: ['Срок сдачи — в строке задачи', 'Подзадачи — темы внутри модуля'],
    examples: [
      { name: 'Домашка по производным', planned_hours: 2, today: true, values: [{ group: 'topics', value: 'Производные' }, { group: 'kinds', value: 'Домашка' }] },
      { name: 'Эссе по английскому', planned_hours: 1.5, today: true, values: [{ group: 'topics', value: 'Эссе' }] },
      { name: 'Подготовка к экзамену по истории', planned_hours: 3, values: [{ group: 'subjects', value: 'История' }, { group: 'kinds', value: 'Экзамен' }] },
    ],
  },
  {
    code: 'personal',
    title: 'Личные дела',
    sub: 'Дом, здоровье, финансы, привычки',
    groups: [
      { key: 'spheres', name: 'Сферы', item_name: 'Сфера', required: false, show_in_list: true, parent: null,
        values: [{ name: 'Здоровье', color: 'label-6' }, { name: 'Дом', color: 'label-5' }, { name: 'Финансы', color: 'label-2' }, { name: 'Близкие', color: 'label-4' }, { name: 'Развитие', color: 'label-3' }] },
      { key: 'places', name: 'Места', item_name: 'Где', required: false, show_in_list: false, parent: null,
        values: [{ name: 'Дома' }, { name: 'В городе' }, { name: 'Онлайн' }] },
    ],
    stages: [{ label: 'Надо' }, { label: 'Делаю' }, { label: 'Готово', is_final: true }],
    settings: { priority_method: 'frog', focus_mode: 'pomodoro', planned_hours_per_day: null, planned_hours_per_month: null, work_days_per_week: 7 },
    normLabel: 'Без нормы — кольцо просто копит время',
    extras: ['Ежедневные дела: зарядка, чтение', 'Ни одного обязательного поля — задача за одно касание'],
    examples: [
      { name: 'Записаться к стоматологу', planned_hours: 0.25, today: true, values: [{ group: 'spheres', value: 'Здоровье' }, { group: 'places', value: 'Онлайн' }] },
      { name: 'Оплатить коммуналку', planned_hours: 0.2, today: true, values: [{ group: 'spheres', value: 'Финансы' }] },
      { name: 'Зарядка', planned_hours: 0.3, is_daily: true, values: [{ group: 'spheres', value: 'Здоровье' }] },
    ],
  },
  {
    code: 'project',
    title: 'Свой проект',
    sub: 'Стартап, блог, творчество, pet-проект',
    groups: [
      { key: 'goals', name: 'Цели', item_name: 'Цель', required: false, show_in_list: true, parent: null,
        values: [{ name: 'Запуск MVP', color: 'label-1', example: true }, { name: 'Первые 100 пользователей', color: 'label-6', example: true }] },
      { key: 'milestones', name: 'Вехи', item_name: 'Веха', required: false, show_in_list: true, parent: 'goals',
        values: [{ name: 'Лендинг', parent: 'Запуск MVP', example: true }, { name: 'Оплата', parent: 'Запуск MVP', example: true }, { name: 'Пост о запуске', parent: 'Первые 100 пользователей', example: true }] },
      { key: 'areas', name: 'Направления', item_name: 'Направление', required: false, show_in_list: false, parent: null,
        values: [{ name: 'Продукт' }, { name: 'Маркетинг' }, { name: 'Контент' }, { name: 'Финансы' }] },
    ],
    stages: [{ label: 'Идея' }, { label: 'В работе' }, { label: 'Запущено', is_final: true }],
    settings: { priority_method: 'eisenhower', focus_mode: '9030', planned_hours_per_day: 2, planned_hours_per_month: null, work_days_per_week: 7 },
    normLabel: '2 ч в день, без выходных',
    extras: ['Вехи внутри целей — видно, что двигает главное', 'Итоги дня в Telegram'],
    examples: [
      { name: 'Собрать лендинг', planned_hours: 4, today: true, values: [{ group: 'milestones', value: 'Лендинг' }, { group: 'areas', value: 'Продукт' }] },
      { name: 'Подключить оплату', planned_hours: 2, values: [{ group: 'milestones', value: 'Оплата' }] },
      { name: 'Написать пост о запуске', planned_hours: 1, values: [{ group: 'milestones', value: 'Пост о запуске' }, { group: 'areas', value: 'Контент' }] },
    ],
  },
  {
    code: 'sport',
    title: 'Спорт',
    sub: 'Тренировки, подготовка к старту, восстановление',
    groups: [
      { key: 'goals', name: 'Цели', item_name: 'Цель', required: false, show_in_list: true, parent: null,
        values: [{ name: 'Полумарафон', color: 'label-6', example: true }, { name: '10 подтягиваний', color: 'label-1', example: true }] },
      { key: 'workouts', name: 'Тренировки', item_name: 'Тренировка', required: false, show_in_list: true, parent: 'goals',
        values: [{ name: 'Длинный бег', parent: 'Полумарафон', example: true }, { name: 'Интервалы', parent: 'Полумарафон', example: true }, { name: 'Верх тела', parent: '10 подтягиваний', example: true }] },
      { key: 'load', name: 'Нагрузка', item_name: 'Нагрузка', required: false, show_in_list: false, parent: null,
        values: [{ name: 'Лёгкая' }, { name: 'Средняя' }, { name: 'Тяжёлая' }, { name: 'Восстановление' }] },
    ],
    stages: [{ label: 'Запланировано' }, { label: 'Пропущено' }, { label: 'Выполнено', is_final: true }],
    settings: { priority_method: 'frog', focus_mode: 'pomodoro', planned_hours_per_day: 0.75, planned_hours_per_month: null, work_days_per_week: 6 },
    normLabel: '45 мин в день, 6 дней в неделю',
    extras: ['Лягушка дня — самая тяжёлая тренировка, до работы', 'Ежедневные: растяжка, шаги'],
    examples: [
      { name: 'Длинный бег 15 км', planned_hours: 1.5, today: true, values: [{ group: 'workouts', value: 'Длинный бег' }, { group: 'load', value: 'Тяжёлая' }] },
      { name: 'Верх тела: подтягивания', planned_hours: 0.8, values: [{ group: 'workouts', value: 'Верх тела' }, { group: 'load', value: 'Средняя' }] },
      { name: 'Растяжка', planned_hours: 0.25, is_daily: true, values: [{ group: 'load', value: 'Восстановление' }] },
    ],
  },
]

/** «С чистого листа»: одна группа «Проекты» и два этапа — остальное человек соберёт сам. */
export const BLANK_PRESET: Preset = {
  code: 'blank',
  title: 'С чистого листа',
  sub: 'Одна группа «Проекты», остальное настрою сам',
  groups: [{ key: 'projects', name: 'Проекты', item_name: 'Проект', required: false, show_in_list: true, parent: null, values: [] }],
  stages: [{ label: 'Надо' }, { label: 'Готово', is_final: true }],
  settings: { priority_method: 'none', focus_mode: 'pomodoro', planned_hours_per_day: 8, planned_hours_per_month: null, work_days_per_week: 5 },
  normLabel: '8 ч в день, 5 дней в неделю',
  extras: [],
  examples: [],
}

export function presetByCode(code: string): Preset | undefined {
  return code === 'blank' ? BLANK_PRESET : PRESETS.find((p) => p.code === code)
}

/**
 * Что уйдёт в базу: методику и фокус человек мог поменять на экране «Что получится» —
 * они подменяют значения пресета. merge — добавление к своей структуре: новые группы не
 * обязательные, иначе пустые «Клиенты» запретили бы создавать задачи.
 */
export function presetPayload(
  p: Preset,
  overrides: { method?: PriorityMethod; focus?: FocusMode } = {},
  { merge = false }: { merge?: boolean } = {},
) {
  return {
    groups: merge ? p.groups.map((g) => ({ ...g, required: false })) : p.groups,
    stages: p.stages,
    settings: {
      ...p.settings,
      priority_method: overrides.method ?? p.settings.priority_method,
      focus_mode: overrides.focus ?? p.settings.focus_mode,
    },
    examples: p.examples,
  }
}

/** Проверка каталога: ссылки на родительские группы и значения, на значения в примерах. */
export function presetProblems(p: Preset): string[] {
  const out: string[] = []
  const keys = new Map(p.groups.map((g) => [g.key, g]))
  for (const g of p.groups) {
    if (g.parent && !keys.has(g.parent)) out.push(`${p.code}: у «${g.name}» нет родителя ${g.parent}`)
    const parent = g.parent ? keys.get(g.parent) : undefined
    for (const v of g.values) {
      if (v.parent && !parent?.values.some((x) => x.name === v.parent)) out.push(`${p.code}: «${v.name}» входит в несуществующее «${v.parent}»`)
      if (v.parent && !v.example && parent?.values.find((x) => x.name === v.parent)?.example)
        out.push(`${p.code}: постоянное «${v.name}» входит в примерное «${v.parent}»`)
    }
  }
  for (const e of p.examples)
    for (const r of e.values) {
      if (!keys.get(r.group)?.values.some((v) => v.name === r.value)) out.push(`${p.code}: пример «${e.name}» ссылается на «${r.value}»`)
    }
  const required = p.groups.filter((g) => g.required)
  for (const e of p.examples) {
    for (const g of required) {
      // обязательную группу закрывает либо её значение, либо значение группы, что в неё входит
      const covers = (key: string): boolean =>
        e.values.some((r) => r.group === key) || p.groups.some((c) => c.parent === key && covers(c.key))
      if (!covers(g.key)) out.push(`${p.code}: пример «${e.name}» без обязательной «${g.name}»`)
    }
  }
  if (!p.stages.some((s) => s.is_final)) out.push(`${p.code}: нет финального этапа`)
  return out
}
