import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TaskListItem } from '../components/TaskListItem'
import { describeError, useToast } from '../lib/Toast'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: projects = [] } = useProjects()
  const { data: tasks = [] } = useTasks()
  const { data: sections = [] } = useSections()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  const project = projects.find((p) => p.id === id)
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const projectTasks = useMemo(() => tasks.filter((t) => t.project_id === id), [tasks, id])

  if (!project) return null

  return (
    <div className="mx-auto max-w-lg px-4 py-6 safe-top">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-slate-400">
        ← Назад
      </button>
      <h1 className="mb-4 text-xl font-semibold text-slate-100">{project.name}</h1>

      <div className="space-y-2">
        {projectTasks.map((task) => (
          <TaskListItem
            key={task.id}
            task={task}
            status={task.status_id ? statusById.get(task.status_id) : undefined}
            project={project}
            section={sectionById.get(task.section_id)}
            activeTimer={activeTimer}
            onStartTimer={() => startTimer.mutate(task.id, { onError })}
            onStopTimer={() => stopTimer.mutate(undefined, { onError })}
          />
        ))}
        {projectTasks.length === 0 && <p className="text-slate-500">В этом проекте пока нет задач.</p>}
      </div>
    </div>
  )
}
