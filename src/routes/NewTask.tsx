import { useNavigate } from 'react-router-dom'
import { TaskForm, type TaskFormValues } from '../components/TaskForm'
import { describeError, useToast } from '../lib/Toast'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useCreateTask } from '../lib/queries/tasks'

const empty: TaskFormValues = {
  name: '',
  project_id: '',
  section_id: '',
  status_id: null,
  planned_hours: 0,
  start_date: null,
  end_date: null,
  is_daily: false,
}

export function NewTask() {
  const navigate = useNavigate()
  const { data: projects = [] } = useProjects()
  const { data: sections = [] } = useSections()
  const { data: statuses = [] } = useStatuses()
  const createTask = useCreateTask()
  const { showError } = useToast()

  return (
    <div className="safe-top mx-auto max-w-lg px-5 pt-4 pb-6 lg:mx-0 lg:w-full lg:max-w-none">
      <button type="button" onClick={() => navigate('/tasks')} className="mb-4 flex items-center gap-2 text-sm text-slate-400">
        <span className="text-base">←</span>Назад
      </button>
      <h1 className="mb-4 text-2xl font-semibold leading-[1.2] tracking-[-.02em] text-slate-100">
        Новая задача
      </h1>
      <TaskForm
        initial={empty}
        projects={projects}
        sections={sections}
        statuses={statuses}
        submitLabel="Создать"
        onSubmit={(values) =>
          createTask.mutate(values, {
            onSuccess: (row) => navigate(`/tasks/${row.id}`),
            onError: (error) => showError(describeError(error)),
          })
        }
      />
    </div>
  )
}
