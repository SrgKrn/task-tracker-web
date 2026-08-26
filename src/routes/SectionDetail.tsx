import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TaskListItem } from '../components/TaskListItem'
import { describeError, useToast } from '../lib/Toast'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'

export function SectionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: sections = [] } = useSections()
  const { data: tasks = [] } = useTasks()
  const { data: projects = [] } = useProjects()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  const section = sections.find((s) => s.id === id)
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const sectionTasks = useMemo(() => tasks.filter((t) => t.section_id === id), [tasks, id])

  if (!section) return null

  return (
    <div className="mx-auto max-w-lg px-4 py-6 safe-top">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-slate-400">
        ← Назад
      </button>
      <h1 className="mb-4 text-xl font-semibold text-slate-100">{section.name}</h1>

      <div className="space-y-2">
        {sectionTasks.map((task) => (
          <TaskListItem
            key={task.id}
            task={task}
            status={task.status_id ? statusById.get(task.status_id) : undefined}
            project={projectById.get(task.project_id)}
            section={section}
            activeTimer={activeTimer}
            onStartTimer={() => startTimer.mutate(task.id, { onError })}
            onStopTimer={() => stopTimer.mutate(undefined, { onError })}
          />
        ))}
        {sectionTasks.length === 0 && <p className="text-slate-500">В этом разделе пока нет задач.</p>}
      </div>
    </div>
  )
}
