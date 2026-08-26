import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TaskListItem } from '../components/TaskListItem'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useActiveTimer } from '../lib/queries/timer'
import type { Task } from '../lib/types'

type GroupBy = 'section' | 'project' | 'none'

export function TaskList() {
  const { data: tasks = [] } = useTasks()
  const { data: sections = [] } = useSections()
  const { data: projects = [] } = useProjects()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()

  const [groupBy, setGroupBy] = useState<GroupBy>('section')
  const [search, setSearch] = useState('')

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return tasks
    return tasks.filter((t) => t.name.toLowerCase().includes(q))
  }, [tasks, search])

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ id: 'all', name: 'Все задачи', tasks: filtered }]
    }
    const buckets = groupBy === 'section' ? sections : projects
    const key = groupBy === 'section' ? 'section_id' : 'project_id'
    return buckets
      .map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        tasks: filtered.filter((t: Task) => t[key as 'section_id' | 'project_id'] === bucket.id),
      }))
      .filter((group) => group.tasks.length > 0)
  }, [groupBy, filtered, sections, projects])

  return (
    <div className="mx-auto max-w-lg px-4 py-4 safe-top safe-bottom">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-100">Задачи</h1>
        <Link
          to="/tasks/new"
          className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-medium text-slate-900 active:bg-sky-700"
        >
          + Задача
        </Link>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск по названию"
        className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
      />

      <div className="mb-4 flex gap-1 rounded-lg bg-slate-800 p-1 text-sm">
        {(
          [
            ['section', 'По разделам'],
            ['project', 'По проектам'],
            ['none', 'Все'],
          ] as [GroupBy, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setGroupBy(value)}
            className={`flex-1 rounded-md py-1.5 ${
              groupBy === value ? 'bg-sky-600 text-slate-900' : 'text-slate-400'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {groups.map((group) => (
          <div key={group.id}>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-slate-500">
              {group.name}
            </h2>
            <div className="space-y-2">
              {group.tasks.map((task) => (
                <TaskListItem
                  key={task.id}
                  task={task}
                  status={task.status_id ? statusById.get(task.status_id) : undefined}
                  isTracking={activeTimer?.task_id === task.id}
                />
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="text-slate-500">Задачи не найдены.</p>}
      </div>
    </div>
  )
}
