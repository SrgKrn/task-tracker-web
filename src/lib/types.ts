/**
 * Группа — измерение, по которому раскладываются задачи: «Проекты», «Разделы», «Клиенты»…
 * Заводит и настраивает пользователь в конструкторе групп.
 */
export interface Group {
  id: string
  user_id: string
  /** «Проекты» — в меню, группировке, фильтрах и отчётах */
  name: string
  /** «Проект» — подпись поля в задаче */
  item_name: string
  sort_order: number
  /** без значения в этой группе задачу не создать */
  required: boolean
  /** значение видно в строке задачи в списках */
  show_in_list: boolean
  /** связь: каждое значение этой группы входит в значение родительской */
  parent_group_id: string | null
  /** пространство, в котором живёт группа */
  workspace_id: string
  /** место блока на холсте структуры; null — раскладывается сам */
  canvas_x: number | null
  canvas_y: number | null
  created_at: string
  updated_at: string
}

/** Значение группы: конкретный проект, раздел, клиент. */
/** метка дизайн-системы: цвет значения группы, сам цвет — из токенов --label-N */
export type LabelColor = 'label-1' | 'label-2' | 'label-3' | 'label-4' | 'label-5' | 'label-6' | 'label-7' | 'label-8'

export interface GroupItem {
  id: string
  user_id: string
  group_id: string
  name: string
  /** описание в карточке: клиент, договорённости, ссылки */
  description: string
  sort_order: number
  /** в архиве — не предлагается в новых задачах, но история по нему сохраняется */
  archived: boolean
  /** во что входит (значение родительской группы) */
  parent_item_id: string | null
  /** папка на Google Диске */
  drive_folder_id: string | null
  drive_folder_name: string | null
  /** метка дизайн-системы 'label-1' … 'label-8' (цвет — из токенов темы); null — без цвета */
  color: LabelColor | null
  workspace_id: string
  created_at: string
  updated_at: string
}

export interface Status {
  id: string
  user_id: string
  label: string
  sort_order: number
  is_final: boolean
  workspace_id: string
  created_at: string
  updated_at: string
}

export interface Task {
  id: string
  user_id: string
  name: string
  /**
   * Значения групп — по одному из каждой. У подзадачи всегда те же, что у спринта,
   * а значение связанной группы («клиент проекта») база подставляет сама.
   */
  item_ids: string[]
  status_id: string | null
  planned_hours: number
  fact_hours: number
  start_date: string | null
  end_date: string | null
  /** ежедневная (рутинная) задача — всегда попадает в «Сегодня» */
  is_daily: boolean
  /** день, на который задача выбрана в «Сегодня»; прошедшая дата — уже не в плане */
  plan_date: string | null
  /** id задачи-оригинала, если эта создана кнопкой «Дублировать» */
  duplicated_from: string | null
  /**
   * id головной задачи (спринта), если это подзадача. Уровней ровно два: у подзадачи
   * своих подзадач не бывает, а значения групп она всегда берёт у спринта — это держит база.
   */
  parent_id: string | null
  /** пространство задачи; у подзадачи — то же, что у спринта */
  workspace_id: string
  /* ── отметки методик приоритизации (см. lib/priority.ts) ── */
  /** Эйзенхауэр: null — срочность по сроку, true/false — решил пользователь */
  urgent: boolean | null
  /** Эйзенхауэр: null — задачу ещё не разобрали */
  important: boolean | null
  /** «Съешь лягушку»: день, на который задача — лягушка */
  frog_date: string | null
  /** 1-3-5: размер; null — по плану часов */
  effort: Effort | null
  /** ABCDE: буква и номер внутри неё */
  abc_letter: AbcLetter | null
  abc_rank: number | null
  /** кому поручено */
  delegated_to: string | null
  created_at: string
  updated_at: string
}

/**
 * Рабочее пространство: свои группы, этапы, задачи, учёт, норма, методика и фокус.
 * Общее на профиль — имя, фото, тема, уведомления, Telegram, Google.
 */
export interface Workspace {
  id: string
  user_id: string
  name: string
  color: LabelColor
  preset_code: string | null
  /** основное: сюда пишут старые версии приложения, его настройки видят серверные функции */
  is_default: boolean
  sort_order: number
  planned_hours_per_day: number | null
  planned_hours_per_month: number | null
  work_days_per_week: number
  priority_method: PriorityMethod
  focus_mode: FocusMode
  focus_settings: FocusSettings
  created_at: string
  updated_at: string
}

export type FocusMode = 'pomodoro' | '9030'
export interface FocusSettings {
  pomodoro?: { work: number; short: number; long: number; cycles: number }
  deep?: { work: number; rest: number }
}
export interface FocusPhase {
  kind: 'work' | 'break' | 'long'
  seconds: number
}
/** идущая фокус-сессия — одна на пользователя */
export interface FocusRun {
  user_id: string
  task_id: string | null
  mode: FocusMode
  plan: FocusPhase[]
  phase_index: number
  phase_kind: FocusPhase['kind']
  /** running — идёт; paused — пауза; ready — перерыв кончился, работа ждёт старта */
  state: 'running' | 'paused' | 'ready'
  phase_started_at: string | null
  phase_ends_at: string | null
  left_seconds: number | null
  updated_at: string
}
export interface FocusSession {
  id: number
  task_id: string | null
  mode: FocusMode
  started_at: string
  ended_at: string
  completed: boolean
}

export type PriorityMethod = 'none' | 'eisenhower' | 'frog' | '135' | 'abcde'
export type Effort = 'big' | 'medium' | 'small'
export type AbcLetter = 'A' | 'B' | 'C' | 'D' | 'E'

/** Запись о переходе задачи в статус — пишется триггером при смене status_id. */
export interface TaskStatusEvent {
  id: string
  user_id: string
  task_id: string
  status_id: string | null
  is_final: boolean
  created_at: string
}

export interface TimeEntry {
  id: string
  user_id: string
  task_id: string
  entry_type: 'timer' | 'manual_adjustment'
  started_at: string | null
  ended_at: string | null
  /** длительность с точностью до секунды; минуты — округлённая копия для старых клиентов */
  duration_seconds: number
  duration_minutes: number
  note: string | null
  /**
   * День, к которому относится запись (в местном времени), а не день сохранения.
   * По нему считаются кольцо «Сегодня» и сводка: правка старой задачи не должна
   * вычитаться из сегодняшнего дня, а работа после полуночи — уезжать во вчера.
   */
  effective_date: string
  created_at: string
}

export interface ActiveTimer {
  user_id: string
  task_id: string
  started_at: string
}

export interface Comment {
  id: string
  user_id: string
  task_id: string
  body: string
  created_at: string
}

export interface UserSettings {
  user_id: string
  planned_hours_per_day: number | null
  planned_hours_per_month: number | null
  /** рабочих дней в неделе с понедельника (5 — пн–пт): по ним считается норма периода */
  work_days_per_week: number
  /** часовой пояс: по нему считаются дни блока «Время» (вчера, серии, лучшие часы) */
  timezone: string
  /** показывать блок «Время» — факт дня и цитату — на «Сегодня» и в «Итогах дня» */
  show_time_block: boolean
  /** методика приоритизации — одна на всё приложение */
  priority_method: PriorityMethod
  /** имя — в приветствии, «Итогах дня» и отчётах */
  display_name: string | null
  /** путь фото профиля в бакете avatars */
  avatar_path: string | null
  focus_mode: FocusMode
  focus_settings: FocusSettings
  /** прошёл первый экран — выбор пресета; null — ещё нет */
  onboarded_at: string | null
  /** последняя версия, чью историю изменений пользователь уже видел */
  seen_release: string | null
  calendar_feed_token: string | null
  /** пуш в начале встречи из календаря, если учёт не идёт */
  meeting_reminders: boolean
  drive_reports_folder_id: string | null
  drive_reports_folder_name: string | null
  updated_at: string
}

/** Файл задачи или значения группы; сам файл — в хранилище attachments по пути path. */
export interface Attachment {
  id: string
  user_id: string
  /** файл значения целиком — его база знаний (у файла задачи пусто) */
  item_id: string | null
  /** файл задачи (у файла значения пусто) */
  task_id: string | null
  name: string
  /** путь в хранилище; у файла из Google Диска пусто — вместо него ссылка */
  path: string | null
  /** файл из Google Диска: ссылка на него, а не копия */
  drive_file_id: string | null
  url: string | null
  size: number
  mime: string
  created_at: string
}

/** Календарь: Google — через вход в Google; ics — по секретной iCal-ссылке. */
export interface CalendarSource {
  id: string
  user_id: string
  kind: 'google' | 'ics'
  /** у Google-календаря ссылки нет */
  url: string | null
  name: string
  last_synced_at: string | null
  last_error: string | null
  created_at: string
}

/** Встреча из календаря — её можно засчитать в учёт. */
export interface CalendarEvent {
  id: number
  user_id: string
  source_id: string
  uid: string
  starts_at: string
  ends_at: string
  title: string
  suggested_task_id: string | null
  status: 'new' | 'logged' | 'dismissed'
  task_id: string | null
  entry_id: string | null
  reminded: boolean
  created_at: string
}
