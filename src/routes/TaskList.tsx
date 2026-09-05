import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DatePicker } from '../components/DatePicker'
import { TaskListItem } from '../components/TaskListItem'
import { Chip, EmptyState, Overline, Switch, TaskRowSkeleton } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { overlapsPeriod } from '../lib/period'
import { useProjects } from '../lib/queries/projects'
import { useSections } from '../lib/queries/sections'
import { useStatuses } from '../lib/queries/statuses'
import { useDeleteTask, useDuplicateTask, useTasks } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { elapsedHours, formatHoursRu, useTicker } from '../lib/time'
import type { Task } from '../lib/types'

type GroupBy = 'section' | 'project' | 'none'

/** переключает id в наборе; null означает «выбрано всё» */
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
  const duplicateTask = useDuplicateTask()
  const deleteTask = useDeleteTask()
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  useTicker(!!activeTimer)

  const [deletingTask, setDeletingTask] = useState<Task | null>(null)

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

  const liveHours = activeTimer ? elapsedHours(activeTimer.started_at) : 0
  const factOf = (t: Task) => t.fact_hours + (activeTimer?.task_id === t.id ? liveHours : 0)

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
    const withSum = (title: string, items: Task[]) => ({
      id: title,
      title: `${title} · ${items.length}`,
      sum: `${formatHoursRu(items.reduce((a, t) => a + factOf(t), 0))} / ${formatHoursRu(
        items.reduce((a, t) => a + t.planned_hours, 0),
      )} ч`,
      items,
    })

    if (groupBy === 'none') {
      return sorted.length > 0 ? [withSum('Все задачи', sorted)] : []
    }
    const buckets = groupBy === 'section' ? sections : projects
    const key = groupBy === 'section' ? 'section_id' : 'project_id'
    return buckets
      .map((bucket) => {
        const items = sorted.filter((t: Task) => t[key as 'section_id' | 'project_id'] === bucket.id)
        return { ...withSum(bucket.name, items), id: bucket.id }
      })
      .filter((group) => group.items.length > 0)
    // factOf зависит от тикающего таймера — пересчёт обеспечивает useTicker выше
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupBy, sorted, sections, projects, liveHours])

  /** сколько задач за каждым чипом фильтра — видно ещё до его нажатия */
  const countsBySection = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) map.set(t.section_id, (map.get(t.section_id) ?? 0) + 1)
    return map
  }, [tasks])

  const countsByProject = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) map.set(t.project_id, (map.get(t.project_id) ?? 0) + 1)
    return map
  }, [tasks])

  const activeCount = tasks.filter((t) => !(t.status_id && statusById.get(t.status_id)?.is_final)).length
  const totalFact = formatHoursRu(tasks.reduce((a, t) => a + factOf(t), 0))
  const totalPlan = formatHoursRu(tasks.reduce((a, t) => a + t.planned_hours, 0))

  return (
    <div className="mx-auto flex max-w-lg flex-col lg:mx-0 lg:w-full lg:max-w-none">
      <div className="safe-top flex items-end justify-between gap-3 px-5 pt-3.5 pb-2.5">
        <div className="flex flex-col gap-0.5">
          <Overline className="tracking-[.14em]">
            {activeCount} активных · {totalFact} / {totalPlan} ч
          </Overline>
          <h1 className="text-[26px] font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">Задачи</h1>
        </div>
        <button
          type="button"
          onClick={() => setSortByDue((v) => !v)}
          title="Сортировать по сроку"
          className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] font-mono text-[13px] font-medium"
          style={{
            background: 'var(--s-surface)',
            border: `1px solid ${sortByDue ? 'var(--s-accent)' : 'var(--s-border)'}`,
            color: sortByDue ? 'var(--s-accent)' : '#8f8f98',
          }}
        >
          ⇅
        </button>
      </div>

      <div className="flex gap-2 px-5 pb-2.5">
        <div
          className="flex h-[38px] flex-1 items-center gap-2 rounded-[11px] px-3"
          style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
        >
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ border: '1.5px solid #6e6e77' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-slate-100 outline-none placeholder:text-[#6e6e77]"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="flex h-[38px] shrink-0 items-center rounded-[11px] px-[13px] text-[12.5px]"
          style={{
            background: filtersActive ? 'var(--s-accent)' : 'var(--s-surface)',
            border: `1px solid ${filtersActive ? 'var(--s-accent)' : 'var(--s-border)'}`,
            color: filtersActive ? 'var(--s-on-accent)' : '#8f8f98',
          }}
        >
          Период
        </button>
      </div>

      {showFilters && (
        <div
          className="mx-5 mb-3 flex flex-col gap-3.5 rounded-[14px] p-3"
          style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-border)' }}
        >
          <div className="flex flex-col gap-2">
            <span className="font-mono text-[10.5px] leading-[1.4] text-slate-500">
              Задачи, чей срок пересекается с периодом
            </span>
            <div className="flex items-center gap-2">
              <DatePicker
                small
                className="flex-1"
                ariaLabel="Период с"
                value={periodFrom || null}
                onChange={(v) => setPeriodFrom(v ?? '')}
              />
              <span className="font-mono text-xs text-slate-600">—</span>
              <DatePicker
                small
                className="flex-1"
                ariaLabel="Период до"
                value={periodTo || null}
                onChange={(v) => setPeriodTo(v ?? '')}
              />
              {(periodFrom || periodTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setPeriodFrom('')
                    setPeriodTo('')
                  }}
                  className="shrink-0 text-xs text-sky-600"
                >
                  Сброс
                </button>
              )}
            </div>
          </div>

          {sections.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Overline>Разделы</Overline>
              <div className="flex flex-wrap gap-1.5">
                {sections.map((s) => (
                  <Chip
                    key={s.id}
                    active={selectedSectionIds === null || selectedSectionIds.has(s.id)}
                    onClick={() =>
                      setSelectedSectionIds(
                        toggleMember(
                          selectedSectionIds,
                          s.id,
                          sections.map((x) => x.id),
                        ),
                      )
                    }
                  >
                    {s.name}
                    <span className="tabular ml-1.5 font-mono text-[10.5px] opacity-60">
                      {countsBySection.get(s.id) ?? 0}
                    </span>
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {projects.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Overline>Проекты</Overline>
              <div className="flex flex-wrap gap-1.5">
                {projects.map((p) => (
                  <Chip
                    key={p.id}
                    active={selectedProjectIds === null || selectedProjectIds.has(p.id)}
                    onClick={() =>
                      setSelectedProjectIds(
                        toggleMember(
                          selectedProjectIds,
                          p.id,
                          projects.map((x) => x.id),
                        ),
                      )
                    }
                  >
                    {p.name}
                    <span className="tabular ml-1.5 font-mono text-[10.5px] opacity-60">
                      {countsByProject.get(p.id) ?? 0}
                    </span>
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2.5 px-5 pb-2.5">
        <div className="flex gap-1.5">
          <Chip active={groupBy === 'section'} onClick={() => setGroupBy('section')}>
            Разделы
          </Chip>
          <Chip active={groupBy === 'project'} onClick={() => setGroupBy('project')}>
            Проекты
          </Chip>
          <Chip active={groupBy === 'none'} onClick={() => setGroupBy('none')}>
            Все
          </Chip>
        </div>
        <Switch on={hideCompleted} onChange={setHideCompleted} label="скрыть готовые" />
      </div>

      <div className="flex flex-col gap-4 px-5 pb-2">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <TaskRowSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            {groups.map((group) => (
              <div key={group.id} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between">
                  <Overline>{group.title}</Overline>
                  <span className="tabular font-mono text-[11px] text-slate-600">{group.sum}</span>
                </div>
                {group.items.map((task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    status={task.status_id ? statusById.get(task.status_id) : undefined}
                    project={projectById.get(task.project_id)}
                    section={sectionById.get(task.section_id)}
                    activeTimer={activeTimer}
                    onStartTimer={() => startTimer.mutate(task.id, { onError })}
                    onStopTimer={() => stopTimer.mutate(undefined, { onError })}
                    onDuplicate={() =>
                      duplicateTask.mutate(task, {
                        onError,
                        onSuccess: () => showSuccess('Копия создана'),
                      })
                    }
                    onDelete={() => setDeletingTask(task)}
                  />
                ))}
              </div>
            ))}
            {groups.length === 0 && (
              <EmptyState>
                {tasks.length === 0 ? (
                  <>
                    Задач пока нет.{' '}
                    <Link to="/tasks/new" className="text-sky-600">
                      Создать первую
                    </Link>
                  </>
                ) : (
                  'Ничего не нашлось. Измените запрос или сбросьте фильтры.'
                )}
              </EmptyState>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={deletingTask !== null}
        title={`Удалить «${deletingTask?.name ?? ''}»?`}
        description="Вместе с задачей удалится вся история трекинга по ней."
        onCancel={() => setDeletingTask(null)}
        onConfirm={() => {
          if (deletingTask) deleteTask.mutate(deletingTask.id, { onError })
          setDeletingTask(null)
        }}
      />
    </div>
  )
}
