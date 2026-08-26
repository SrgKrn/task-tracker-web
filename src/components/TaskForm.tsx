import { useState } from 'react'
import type { Project, Section, Status } from '../lib/types'

export interface TaskFormValues {
  name: string
  project_id: string
  section_id: string
  status_id: string | null
  planned_hours: number
  start_date: string | null
  end_date: string | null
}

interface TaskFormProps {
  initial: TaskFormValues
  projects: Project[]
  sections: Section[]
  statuses: Status[]
  submitLabel: string
  onSubmit: (values: TaskFormValues) => void
}

export function TaskForm({ initial, projects, sections, statuses, submitLabel, onSubmit }: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>(initial)

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.name.trim() || !values.project_id || !values.section_id) return
    onSubmit(values)
  }

  const fieldClass =
    'w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-sm text-slate-400">Название задачи</label>
        <input
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          className={fieldClass}
          placeholder="Что нужно сделать"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Проект</label>
        <select
          value={values.project_id}
          onChange={(e) => set('project_id', e.target.value)}
          className={fieldClass}
          required
        >
          <option value="" disabled>
            Выберите проект
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Раздел</label>
        <select
          value={values.section_id}
          onChange={(e) => set('section_id', e.target.value)}
          className={fieldClass}
          required
        >
          <option value="" disabled>
            Выберите раздел
          </option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Статус</label>
        <select
          value={values.status_id ?? ''}
          onChange={(e) => set('status_id', e.target.value || null)}
          className={fieldClass}
        >
          <option value="">Без статуса</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">План, часы</label>
        <input
          type="number"
          min="0"
          step="0.25"
          value={values.planned_hours}
          onChange={(e) => set('planned_hours', Number(e.target.value))}
          className={fieldClass}
        />
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-400">Срок с</label>
          <input
            type="date"
            value={values.start_date ?? ''}
            onChange={(e) => set('start_date', e.target.value || null)}
            className={fieldClass}
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-sm text-slate-400">Срок до</label>
          <input
            type="date"
            value={values.end_date ?? ''}
            onChange={(e) => set('end_date', e.target.value || null)}
            className={fieldClass}
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-sky-600 px-4 py-2.5 font-medium text-white active:bg-sky-700"
      >
        {submitLabel}
      </button>
    </form>
  )
}
