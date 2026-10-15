import { useNavigate } from 'react-router-dom'
import { TaskForm, type TaskFormValues } from '../components/TaskForm'
import { describeError, useToast } from '../lib/Toast'
import { useStatuses } from '../lib/queries/statuses'
import { useCreateTask } from '../lib/queries/tasks'
import { ArrowLeft } from '../components/Icon'

const empty: TaskFormValues = {
  name: '',
  item_ids: [],
  status_id: null,
  planned_hours: 0,
  start_date: null,
  end_date: null,
  is_daily: false,
}

export function NewTask() {
  const navigate = useNavigate()
  const { data: statuses = [] } = useStatuses()
  const createTask = useCreateTask()
  const { showError } = useToast()

  return (
    <div className="safe-top-page page mx-auto max-w-lg px-5 pt-4 pb-6">
      <button type="button" onClick={() => navigate('/tasks')} className="mb-4 flex items-center gap-2 text-base text-text-secondary">
        <ArrowLeft size={15} />Назад
      </button>
      <h1 className="mb-4 text-xl font-semibold leading-[1.2] tracking-[-.02em] text-text">
        Новая задача
      </h1>
      <TaskForm
        initial={empty}
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
