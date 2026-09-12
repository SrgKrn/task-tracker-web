import { useMemo, useState } from 'react'
import { DatePicker } from './DatePicker'
import { ChipPicker } from './ChipPicker'
import { DurationSheet } from './DurationSheet'
import { ChevronDown } from './Icon'
import { PickerField } from './PickerField'
import { FieldLabel, fieldClass } from './ui'
import { formatHoursMinutes } from '../lib/time'
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
  const [editingPlan, setEditingPlan] = useState(false)

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

      {/* тот же ввод длительности, что у факта и у плана в листе создания:
          раньше здесь одиноко оставались два голых числовых поля */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <FieldLabel>План</FieldLabel>
        <button
          type="button"
          onClick={() => setEditingPlan(true)}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left"
          style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
        >
          <span className="tabular font-mono text-sm text-slate-100">
            {values.planned_hours > 0 ? formatHoursMinutes(values.planned_hours) : 'не задан'}
          </span>
          <ChevronDown size={14} className="text-slate-600" />
        </button>
      </div>

      <DurationSheet
        open={editingPlan}
        title="Плановое время"
        hours={values.planned_hours}
        onCancel={() => setEditingPlan(false)}
        onSubmit={(value) => {
          setEditingPlan(false)
          set('planned_hours', value)
        }}
      />

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

      {/* компактные строки с поиском, а не ряды чипов: на тринадцати проектах чипы
          занимали пятую часть экрана и форму приходилось прокручивать целиком */}
      <div className="flex gap-[9px]">
        <PickerField
          label="Проект"
          items={pickableProjects.map((p) => ({
            id: p.id,
            name: p.archived ? `${p.name} (в архиве)` : p.name,
          }))}
          value={values.project_id || null}
          onChange={(id) => id && set('project_id', id)}
          placeholder="Название проекта"
          onCreate={(name, onCreated) =>
            createProject.mutate(name, { onError, onSuccess: (row) => onCreated(row.id) })
          }
        />
        <PickerField
          label="Раздел"
          items={pickableSections.map((s) => ({
            id: s.id,
            name: s.archived ? `${s.name} (в архиве)` : s.name,
          }))}
          value={values.section_id || null}
          onChange={(id) => id && set('section_id', id)}
          placeholder="Название раздела"
          onCreate={(name, onCreated) =>
            createSection.mutate(name, { onError, onSuccess: (row) => onCreated(row.id) })
          }
        />
      </div>

      {/* статусов обычно единицы — их держим чипами, выбор виден без лишнего касания */}
      <ChipPicker
        label="Статус"
        items={statuses.map((s) => ({ id: s.id, name: s.label }))}
        value={values.status_id}
        onChange={(id) => set('status_id', id)}
        placeholder="Название статуса"
        noneLabel="Без статуса"
        onCreate={(name, onCreated) =>
          createStatus.mutate(name, { onError, onSuccess: (row) => onCreated(row.id) })
        }
      />

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
