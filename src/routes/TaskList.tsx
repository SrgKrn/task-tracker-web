import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TaskListItem } from '../components/TaskListItem'
import { describeError, useToast } from '../lib/Toast'
import { overlapsPeriod } from '../lib/period'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'
import type { Task } from '../lib/types'

type GroupBy = 'section' | 'project' | 'none'

/** toggles `id` in `set` (null means "everyone selected"); collapses back to null once everything is checked again */
function toggleMember(set: Set<string> | null, id: string, allIds: string[]): Set<string> | null {
  const current = set ?? new Set(allIds)
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next.size === allIds.length ? null : next
}

export function TaskList() {
  const { data: tasks = [], isLoading } = useTasks()
  const { data: sections = [] } = useSections()
  const { data: projects = [] } = useProjects()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [search, setSearch] = useState('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [hideCompleted, setHideCompleted] = useState(false)
  const [sortByDue, setSortByDue] = useState(true)
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<string> | null>(null)
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string> | null>(null)

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects])
  const sectionById = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections])

  const filtersActive =
    !!periodFrom || !!periodTo || selectedSectionIds !== null || selectedProjectIds !== null || hideCompleted

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tasks
      .filter(
        (t) =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          projectById.get(t.project_id)?.name.toLowerCase().includes(q) ||
          sectionById.get(t.section_id)?.name.toLowerCase().includes(q),
      )
      .filter((t) => overlapsPeriod(t, periodFrom, periodTo))
      .filter((t) => !hideCompleted || !(t.status_id && statusById.get(t.status_id)?.is_final))
      .filter((t) => selectedSectionIds === null || selectedSectionIds.has(t.section_id))
      .filter((t) => selectedProjectIds === null || selectedProjectIds.has(t.project_id))
  }, [
    tasks,
    search,
    periodFrom,
    periodTo,
    hideCompleted,
    statusById,
    projectById,
    sectionById,
    selectedSectionIds,
    selectedProjectIds,
  ])

  const sorted = useMemo(() => {
    if (!sortByDue) return filtered
    return [...filtered].sort((a, b) => {
      if (!a.end_date && !b.end_date) return 0
      if (!a.end_date) return 1
      if (!b.end_date) return -1
      return a.end_date.localeCompare(b.end_date)
    })
  }, [filtered, sortByDue])

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return sorted.length > 0 ? [{ id: 'all', name: 'Все задачи', tasks: sorted }] : []
    }
    const buckets = groupBy === 'section' ? sections : projects
    const key = groupBy === 'section' ? 'section_id' : 'project_id'
    return buckets
      .map((bucket) => ({
        id: bucket.id,
        name: bucket.name,
        tasks: sorted.filter((t: Task) => t[key as 'section_id' | 'project_id'] === bucket.id),
      }))
      .filter((group) => group.tasks.length > 0)
  }, [groupBy, sorted, sections, projects])

  return (
    <div className="mx-auto max-w-lg px-4 py-4 safe-top lg:mx-0 lg:max-w-none lg:w-full">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-slate-100">Задачи</h1>
        <Link
          to="/tasks/new"
          className="rounded-full bg-sky-600 px-4 py-1.5 text-sm font-medium text-slate-900 active:bg-sky-700"
        >
          + Задача
        </Link>
      </div>

      <div className="mb-3 flex gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по задаче, проекту, разделу"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`relative rounded-lg border px-3 text-sm ${
            filtersActive ? 'border-sky-600 text-sky-600' : 'border-slate-700 text-slate-400'
          }`}
        >
          Фильтры
          {filtersActive && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-sky-600" />}
        </button>
      </div>

      {showFilters && (
        <div className="mb-3 space-y-4 rounded-lg border border-slate-700 bg-slate-800/60 p-3">
          <div>
            <p className="mb-1.5 text-xs text-slate-500">
              Период — по сроку «с–до» задачи, а не по времени трекинга
            </p>
            <div className="flex gap-2">
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
              />
              {(periodFrom || periodTo) && (
                <button
                  onClick={() => {
                    setPeriodFrom('')
                    setPeriodTo('')
                  }}
                  className="shrink-0 text-sm text-slate-400"
                >
                  Сброс
                </button>
              )}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={sortByDue}
              onChange={(e) => setSortByDue(e.target.checked)}
              className="accent-sky-600"
            />
            Сортировать по сроку
          </label>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={hideCompleted}
              onChange={(e) => setHideCompleted(e.target.checked)}
              className="accent-sky-600"
            />
            Скрыть завершённые
          </label>

          {sections.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-slate-500">Разделы</p>
              <div className="flex flex-wrap gap-1.5">
                {sections.map((s) => {
                  const active = selectedSectionIds === null || selectedSectionIds.has(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() =>
                        setSelectedSectionIds(
                          toggleMember(
                            selectedSectionIds,
                            s.id,
                            sections.map((x) => x.id),
                          ),
                        )
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        active ? 'border-sky-600 text-sky-600' : 'border-slate-700 text-slate-500'
                      }`}
                    >
                      {s.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {projects.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-slate-500">Проекты</p>
              <div className="flex flex-wrap gap-1.5">
                {projects.map((p) => {
                  const active = selectedProjectIds === null || selectedProjectIds.has(p.id)
                  return (
                    <button
                      key={p.id}
                      onClick={() =>
                        setSelectedProjectIds(
                          toggleMember(
                            selectedProjectIds,
                            p.id,
                            projects.map((x) => x.id),
                          ),
                        )
                      }
                      className={`rounded-full border px-2.5 py-1 text-xs ${
                        active ? 'border-sky-600 text-sky-600' : 'border-slate-700 text-slate-500'
                      }`}
                    >
                      {p.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

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

      {isLoading ? (
        <p className="text-slate-500">Загрузка…</p>
      ) : (
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
                    project={projectById.get(task.project_id)}
                    section={sectionById.get(task.section_id)}
                    activeTimer={activeTimer}
                    onStartTimer={() => startTimer.mutate(task.id, { onError })}
                    onStopTimer={() => stopTimer.mutate(undefined, { onError })}
                  />
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 &&
            (tasks.length === 0 ? (
              <p className="text-slate-500">
                Задач пока нет. Начните с создания{' '}
                <Link to="/tasks/new" className="text-sky-600 underline">
                  первой задачи
                </Link>
                .
              </p>
            ) : (
              <p className="text-slate-500">Ничего не найдено по этим фильтрам.</p>
            ))}
        </div>
      )}
    </div>
  )
}
