import { useState } from 'react'
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
}

interface TaskFormProps {
  initial: TaskFormValues
  projects: Project[]
  sections: Section[]
  statuses: Status[]
  submitLabel: string
  onSubmit: (values: TaskFormValues) => void
}

const NEW_OPTION = '__new__'

export function TaskForm({ initial, projects, sections, statuses, submitLabel, onSubmit }: TaskFormProps) {
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

  function handleStatusChange(value: string) {
    if (value !== NEW_OPTION) return set('status_id', value || null)
    const name = window.prompt('Название нового статуса (например: 25%, В работе, Готово)')?.trim()
    if (!name) return
    createStatus.mutate(name, { onError, onSuccess: (row) => set('status_id', row.id) })
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
        <select value={values.project_id} onChange={(e) => handleProjectChange(e.target.value)} className={fieldClass} required>
          <option value="" disabled>
            Выберите проект
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
          <option value={NEW_OPTION}>+ Новый проект…</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Раздел</label>
        <select value={values.section_id} onChange={(e) => handleSectionChange(e.target.value)} className={fieldClass} required>
          <option value="" disabled>
            Выберите раздел
          </option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          <option value={NEW_OPTION}>+ Новый раздел…</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">Статус</label>
        <select value={values.status_id ?? ''} onChange={(e) => handleStatusChange(e.target.value)} className={fieldClass}>
          <option value="">Без статуса</option>
          {statuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
          <option value={NEW_OPTION}>+ Новый статус…</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm text-slate-400">План</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            value={plannedH}
            onChange={(e) => setPlanned(Math.max(0, Number(e.target.value)), plannedM)}
            className={fieldClass}
          />
          <span className="shrink-0 text-sm text-slate-400">ч</span>
          <input
            type="number"
            min="0"
            max="59"
            value={plannedM}
            onChange={(e) => setPlanned(plannedH, Math.min(59, Math.max(0, Number(e.target.value))))}
            className={fieldClass}
          />
          <span className="shrink-0 text-sm text-slate-400">мин</span>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-sm text-slate-400">Срок с</label>
          <input
            type="date"
            value={values.start_date ?? ''}
            onChange={(e) => set('start_date', e.target.value || null)}
            className={`${fieldClass} min-w-0`}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-sm text-slate-400">Срок до</label>
          <input
            type="date"
            value={values.end_date ?? ''}
            onChange={(e) => set('end_date', e.target.value || null)}
            className={`${fieldClass} min-w-0`}
          />
        </div>
      </div>

      <button
        type="submit"
        className="w-full rounded-lg bg-sky-600 px-4 py-2.5 font-medium text-slate-900 active:bg-sky-700"
      >
        {submitLabel}
      </button>
    </form>
  )
}
