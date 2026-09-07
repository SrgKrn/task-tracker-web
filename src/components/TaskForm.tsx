import { useMemo, useState } from 'react'
import { DatePicker } from './DatePicker'
import { Chip, FieldLabel, fieldClass } from './ui'
import { describeError, useToast } from '../lib/Toast'
import { useCreateProject } from '../lib/queries/projects'
import { useCreateSection } from '../lib/queries/sections'
import { useCreateStatus } from '../lib/queries/statuses'
import type { Project, Section, Status } from '../lib/types'

export interface TaskFormValues {
  name: string
  project_id: string
  section_id: string
  status_id: string | null
  planned_hours: number
  start_date: string | null
  end_date: string | null
  is_daily: boolean
}

interface TaskFormProps {
  initial: TaskFormValues
  projects: Project[]
  sections: Section[]
  statuses: Status[]
  submitLabel: string
  /** карточка редактирует существующую задачу — название и статус живут в её шапке */
  compact?: boolean
  onSubmit: (values: TaskFormValues) => void
}

const NEW_OPTION = '__new__'

export function TaskForm({
  initial,
  projects,
  sections,
  statuses,
  submitLabel,
  compact = false,
  onSubmit,
}: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>(initial)
  const [plannedH, setPlannedH] = useState(Math.floor(initial.planned_hours))
  const [plannedM, setPlannedM] = useState(Math.round((initial.planned_hours % 1) * 60))

  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  const createProject = useCreateProject()
  const createSection = useCreateSection()
  const createStatus = useCreateStatus()

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  // архивные справочники не предлагаем, но уже выбранный оставляем — иначе у старой
  // задачи молча слетела бы привязка к проекту/разделу
  const pickableProjects = useMemo(
    () => projects.filter((p) => !p.archived || p.id === values.project_id),
    [projects, values.project_id],
  )
  const pickableSections = useMemo(
    () => sections.filter((s) => !s.archived || s.id === values.section_id),
    [sections, values.section_id],
  )

  function setPlanned(h: number, m: number) {
    setPlannedH(h)
    setPlannedM(m)
    set('planned_hours', h + m / 60)
  }

  function handleProjectChange(value: string) {
    if (value !== NEW_OPTION) return set('project_id', value)
    const name = window.prompt('Название нового проекта')?.trim()
    if (!name) return
    createProject.mutate(name, { onError, onSuccess: (row) => set('project_id', row.id) })
  }

  function handleSectionChange(value: string) {
    if (value !== NEW_OPTION) return set('section_id', value)
    const name = window.prompt('Название нового раздела')?.trim()
    if (!name) return
    createSection.mutate(name, { onError, onSuccess: (row) => set('section_id', row.id) })
  }

  function handleStatusChange(id: string | null) {
    set('status_id', id)
  }

  function handleNewStatus() {
    const name = window.prompt('Название нового статуса (например: 25%, В работе, Готово)')?.trim()
    if (!name) return
    createStatus.mutate(name, { onError, onSuccess: (row) => set('status_id', row.id) })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.name.trim() || !values.project_id || !values.section_id) return
    // В компактном режиме поля имени тут нет — им владеет заголовок карточки.
    // Если всё равно отправить своё values.name, форма затрёт свежее переименование
    // тем значением, с которым она смонтировалась.
    if (compact) {
      const { name: _ownedByHeader, ...rest } = values
      onSubmit({ ...rest, name: initial.name })
      return
    }
    onSubmit(values)
  }

  const selectClass = `${fieldClass} appearance-none pr-8`

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {!compact && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Название задачи</FieldLabel>
          <input
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            className={fieldClass}
            placeholder="Что нужно сделать"
            required
          />
        </div>
      )}

      <div className="flex gap-[9px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>План</FieldLabel>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min="0"
              value={plannedH}
              onChange={(e) => setPlanned(Math.max(0, Number(e.target.value)), plannedM)}
              className={`${fieldClass} tabular min-w-0 font-mono`}
            />
            <span className="shrink-0 font-mono text-2xs text-slate-500">ч</span>
            <input
              type="number"
              min="0"
              max="59"
              value={plannedM}
              onChange={(e) => setPlanned(plannedH, Math.min(59, Math.max(0, Number(e.target.value))))}
              className={`${fieldClass} tabular min-w-0 font-mono`}
            />
            <span className="shrink-0 font-mono text-2xs text-slate-500">мин</span>
          </div>
        </div>
      </div>

      <div className="flex gap-[9px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Срок с</FieldLabel>
          <DatePicker
            value={values.start_date}
            onChange={(v) => set('start_date', v)}
            ariaLabel="Срок с"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Срок до</FieldLabel>
          <DatePicker value={values.end_date} onChange={(v) => set('end_date', v)} ariaLabel="Срок до" />
        </div>
      </div>

      <div className="flex gap-[9px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Проект</FieldLabel>
          <select
            value={values.project_id}
            onChange={(e) => handleProjectChange(e.target.value)}
            className={selectClass}
            required
          >
            <option value="" disabled>
              Выберите проект
            </option>
            {pickableProjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.archived ? ' (в архиве)' : ''}
              </option>
            ))}
            <option value={NEW_OPTION}>+ Новый проект…</option>
          </select>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Раздел</FieldLabel>
          <select
            value={values.section_id}
            onChange={(e) => handleSectionChange(e.target.value)}
            className={selectClass}
            required
          >
            <option value="" disabled>
              Выберите раздел
            </option>
            {pickableSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.archived ? ' (в архиве)' : ''}
              </option>
            ))}
            <option value={NEW_OPTION}>+ Новый раздел…</option>
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel>Статус</FieldLabel>
        <div className="flex flex-wrap gap-2">
          <Chip active={values.status_id === null} onClick={() => handleStatusChange(null)}>
            Без статуса
          </Chip>
          {statuses.map((s) => (
            <Chip key={s.id} active={values.status_id === s.id} onClick={() => handleStatusChange(s.id)}>
              {s.label}
            </Chip>
          ))}
          <Chip onClick={handleNewStatus}>+ Новый…</Chip>
        </div>
      </div>

      {/* вся строка — цель нажатия: голый чекбокс был 13×13 */}
      <label className="-my-1 flex min-h-11 items-center gap-2.5 text-sm text-slate-400">
        <input
          type="checkbox"
          checked={values.is_daily}
          onChange={(e) => set('is_daily', e.target.checked)}
          className="h-[18px] w-[18px] shrink-0 accent-sky-600"
        />
        Ежедневная — всегда в списке дня
      </label>

      <button
        type="submit"
        className="mt-1 h-11 w-full rounded-[14px] text-sm font-semibold lg:w-auto lg:self-start lg:px-8"
        style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
      >
        {submitLabel}
      </button>
    </form>
  )
}
