import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TaskListItem } from '../components/TaskListItem'
import { EmptyState } from '../components/ui'
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
    <div className="safe-top mx-auto max-w-lg px-5 pt-3.5 pb-2">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-[13px] text-slate-400">
        <span className="text-[15px]">←</span>Назад
      </button>
      <h1 className="mb-4 text-[26px] font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">
        {project.name}
      </h1>

      <div className="flex flex-col gap-[9px]">
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
        {projectTasks.length === 0 && <EmptyState>В этом проекте пока нет задач.</EmptyState>}
      </div>
    </div>
  )
}
