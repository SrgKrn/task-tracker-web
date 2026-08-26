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
}

export function NewTask() {
  const navigate = useNavigate()
  const { data: projects = [] } = useProjects()
  const { data: sections = [] } = useSections()
  const { data: statuses = [] } = useStatuses()
  const createTask = useCreateTask()
  const { showError } = useToast()

  return (
    <div className="mx-auto max-w-lg px-4 py-6 safe-top safe-bottom">
      <h1 className="mb-4 text-xl font-semibold text-slate-100">Новая задача</h1>
      <TaskForm
        initial={empty}
        projects={projects}
        sections={sections}
        statuses={statuses}
        submitLabel="Создать"
        onSubmit={(values) =>
          createTask.mutate(values, {
            onSuccess: () => navigate('/'),
            onError: (error) => showError(describeError(error)),
          })
        }
      />
    </div>
  )
}
