import type { FocusMode, LabelColor, PriorityMethod } from './types'

/**
 * Пресеты — заготовки под то, для чего человеку трекер. Применяет их база одной функцией
 * apply_preset: группы, значения, этапы и настройки пространства. Поля example/parent и
 * примеры задач функция по-прежнему понимает, но заготовки 0.43 ими не пользуются.
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
  /** что внутри — одной строкой на экране входа */
  inside: string
  groups: PresetGroup[]
  stages: { label: string; is_final?: boolean }[]
  settings: {
    priority_method: PriorityMethod
    focus_mode: FocusMode
    planned_hours_per_day: number | null
    planned_hours_per_month: number | null
    work_days_per_week: number
  }
  examples: { name: string; planned_hours: number; is_daily?: boolean; today?: boolean; values: { group: string; value: string }[] }[]
}

/*
 * 0.43: заготовки упрощены по образцу того, как владелец сам переделал «Свой проект» под
 * себя — убрал вложенные «Вехи», снял связь и оставил две плоские группы. Теперь у каждой
 * заготовки одна-две группы, ни одной обязательной, без связей; значения — только те, что
 * подходят почти всем (выдуманных клиентов нет). Норму, методику и примеры задач человек
 * включит сам, когда до них дойдёт: об этом расскажут подсказки.
 */
const STAGES: Preset['stages'] = [{ label: 'Надо' }, { label: 'В работе' }, { label: 'Готово', is_final: true }]
const SETTINGS: Preset['settings'] = {
  priority_method: 'none',
  focus_mode: 'pomodoro',
  planned_hours_per_day: null,
  planned_hours_per_month: null,
  work_days_per_week: 5,
}
const group = (key: string, name: string, item_name: string, values: PresetValue[] = [], show_in_list = true): PresetGroup => ({
  key,
  name,
  item_name,
  required: false,
  show_in_list,
  parent: null,
  values,
})

export const PRESETS: Preset[] = [
  {
    code: 'clients',
    title: 'Работа на клиентов',
    inside: 'Группа «Клиенты»; ставка и отчёт клиенту — в «Про»',
    groups: [group('clients', 'Клиенты', 'Клиент')],
    stages: STAGES,
    settings: SETTINGS,
    examples: [],
  },
  {
    code: 'team',
    title: 'Работа в команде',
    inside: 'Группа «Проекты»',
    groups: [group('projects', 'Проекты', 'Проект')],
    stages: STAGES,
    settings: SETTINGS,
    examples: [],
  },
  {
    code: 'study',
    title: 'Учёба',
    inside: 'Группа «Предметы»',
    groups: [group('subjects', 'Предметы', 'Предмет')],
    stages: STAGES,
    settings: SETTINGS,
    examples: [],
  },
  {
    code: 'personal',
    title: 'Личные дела',
    inside: '«Сферы»: здоровье, дом, финансы…',
    groups: [
      group('spheres', 'Сферы', 'Сфера', [
        { name: 'Здоровье', color: 'label-6' },
        { name: 'Дом', color: 'label-5' },
        { name: 'Финансы', color: 'label-2' },
        { name: 'Близкие', color: 'label-4' },
        { name: 'Развитие', color: 'label-3' },
      ]),
    ],
    stages: STAGES,
    settings: SETTINGS,
    examples: [],
  },
  {
    code: 'project',
    title: 'Свой проект',
    inside: '«Направления» и «Цели»',
    groups: [
      group('areas', 'Направления', 'Направление', [
        { name: 'Продукт', color: 'label-1' },
        { name: 'Маркетинг', color: 'label-2' },
        { name: 'Контент', color: 'label-4' },
        { name: 'Финансы', color: 'label-6' },
      ]),
      group('goals', 'Цели', 'Цель', [], false),
    ],
    stages: STAGES,
    settings: SETTINGS,
    examples: [],
  },
  {
    code: 'sport',
    title: 'Спорт',
    inside: '«Тренировки»: бег, сила, растяжка',
    groups: [
      group('workouts', 'Тренировки', 'Тренировка', [
        { name: 'Бег', color: 'label-6' },
        { name: 'Сила', color: 'label-1' },
        { name: 'Растяжка', color: 'label-3' },
      ]),
    ],
    stages: STAGES,
    settings: SETTINGS,
    examples: [],
  },
]

/** «Начать» — пустой лист: ни одной группы, три этапа, без нормы и методики. */
export const BLANK_PRESET: Preset = {
  code: 'blank',
  title: 'С чистого листа',
  inside: 'Без групп — добавите, когда понадобятся',
  groups: [],
  stages: STAGES,
  settings: SETTINGS,
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
