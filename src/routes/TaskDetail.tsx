import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { TaskForm, type TaskFormValues } from '../components/TaskForm'
import { TaskTimeline } from '../components/TaskTimeline'
import { TimerButton } from '../components/TimerButton'
import { describeError, useToast } from '../lib/Toast'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useCreateTask, useDeleteTask, useTask, useUpdateTask } from '../lib/queries/tasks'
import { useActiveTimer, useAdjustFactHours, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { formatHours } from '../lib/time'

export function TaskDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  const { data: task } = useTask(id)
  const { data: projects = [] } = useProjects()
  const { data: sections = [] } = useSections()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()

  const updateTask = useUpdateTask()
  const deleteTask = useDeleteTask()
  const createTask = useCreateTask()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const adjustFactHours = useAdjustFactHours()

  const [factInput, setFactInput] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (!task) return null

  const values: TaskFormValues = {
    name: task.name,
    project_id: task.project_id,
    section_id: task.section_id,
    status_id: task.status_id,
    planned_hours: task.planned_hours,
    start_date: task.start_date,
    end_date: task.end_date,
  }

  function commitFactHours() {
    if (factInput === null) return
    const parsed = Number(factInput)
    if (!Number.isNaN(parsed) && task && parsed !== task.fact_hours) {
      adjustFactHours.mutate({ taskId: task.id, currentFactHours: task.fact_hours, newFactHours: parsed }, { onError })
    }
    setFactInput(null)
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 safe-top">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-slate-400">
        ← Назад
      </button>

      <div className="mb-5">
        <TimerButton
          taskId={task.id}
          activeTimer={activeTimer}
          onStart={() => startTimer.mutate(task.id, { onError })}
          onStop={() => stopTimer.mutate(undefined, { onError })}
        />
      </div>

      <div className="mb-5">
        <label className="mb-1 block text-sm text-slate-400">Факт, часы (можно исправить вручную)</label>
        <input
          type="number"
          step="0.25"
          value={factInput ?? formatHours(task.fact_hours)}
          onChange={(e) => setFactInput(e.target.value)}
          onBlur={commitFactHours}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 focus:border-sky-500 focus:outline-none"
        />
      </div>

      <TaskForm
        initial={values}
        projects={projects}
        sections={sections}
        statuses={statuses}
        submitLabel="Сохранить"
        onSubmit={(fields) => updateTask.mutate({ id: task.id, fields }, { onError })}
      />

      <TaskTimeline taskId={task.id} />

      <button
        onClick={() =>
          createTask.mutate(
            {
              name: `${task.name} (копия)`,
              project_id: task.project_id,
              section_id: task.section_id,
              status_id: task.status_id,
              planned_hours: task.planned_hours,
              start_date: task.start_date,
              end_date: task.end_date,
            },
            { onError, onSuccess: (row) => navigate(`/tasks/${row.id}`) },
          )
        }
        className="mt-6 w-full rounded-lg border border-slate-700 px-4 py-2.5 font-medium text-slate-300 active:bg-slate-700"
      >
        Дублировать задачу
      </button>

      <button
        onClick={() => setConfirmingDelete(true)}
        className="mt-6 w-full rounded-lg border border-red-800 px-4 py-2.5 font-medium text-red-400 active:bg-red-950"
      >
        Удалить задачу
      </button>

      <ConfirmDialog
        open={confirmingDelete}
        title="Удалить задачу?"
        description="Вместе с ней удалится вся история трекинга по ней."
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false)
          deleteTask.mutate(task.id, { onSuccess: () => navigate('/'), onError })
        }}
      />
    </div>
  )
}
