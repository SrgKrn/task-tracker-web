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
    <div className="safe-top mx-auto max-w-lg px-5 pt-3.5 pb-2">
      <button onClick={() => navigate(-1)} className="mb-4 flex items-center gap-2 text-sm text-slate-400">
        <span className="text-base">←</span>Назад
      </button>
      <h1 className="mb-4 text-2xl font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">
        {section.name}
      </h1>

      <div className="flex flex-col gap-[9px]">
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
        {sectionTasks.length === 0 && <EmptyState>В этом разделе пока нет задач.</EmptyState>}
      </div>
    </div>
  )
}
