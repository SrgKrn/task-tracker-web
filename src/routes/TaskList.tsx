import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { DatePicker } from '../components/DatePicker'
import { TaskListItem } from '../components/TaskListItem'
import { Search, SortArrows } from '../components/Icon'
import { Button, Chip, EmptyState, ListGroup, Overline, Segmented, Switch, TaskRowSkeleton } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { overlapsPeriod } from '../lib/period'
import { useGroupModel } from '../lib/groups'
import { useStatuses } from '../lib/queries/statuses'
import { useDeleteTask, useDuplicateTask, useTasks } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { ACTIVE_TASKS, elapsedHours, formatHoursRu, plural, useTicker } from '../lib/time'
import { childrenByParent, deleteDescription, rollupFact, runningWithin } from '../lib/tree'
import type { ActiveTimer, Task } from '../lib/types'

/** 'none' — одним списком, иначе id группы */
type GroupBy = string

/** значение «не указано» в фильтрах и группировке */
const NONE = ''

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
  const model = useGroupModel()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const duplicateTask = useDuplicateTask()
  const deleteTask = useDeleteTask()
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))

  const [deletingTask, setDeletingTask] = useState<Task | null>(null)

  const [groupBy, setGroupBy] = useState<GroupBy>('none')
  const [search, setSearch] = useState('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  // готовое по умолчанию скрыто: в работе нужны открытые задачи, закрытые — по запросу
  const [hideCompleted, setHideCompleted] = useState(true)
  const [sortByDue, setSortByDue] = useState(true)
  /** выбранные значения по группам; нет ключа — в группе выбрано всё */
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  // группировка по удалённой группе — снова одним списком
  const activeGroupBy = groupBy !== 'none' && model.groupById.has(groupBy) ? groupBy : 'none'

  const filtersActive = !!periodFrom || !!periodTo || Object.keys(selected).length > 0

  // в списке только головные задачи; подзадачи живут в раскрывающемся составе спринта
  const childrenOf = useMemo(() => childrenByParent(tasks), [tasks])
  const heads = useMemo(() => tasks.filter((t) => !t.parent_id), [tasks])


  const query = search.trim().toLowerCase()
  /** спринты, у которых запрос нашёлся в подзадаче: их состав показываем раскрытым */
  const matchedInside = useMemo(() => {
    const ids = new Set<string>()
    if (!query) return ids
    for (const [parentId, children] of childrenOf) {
      if (children.some((c) => c.name.toLowerCase().includes(query))) ids.add(parentId)
    }
    return ids
  }, [childrenOf, query])

  const filtered = useMemo(() => {
    const q = query
    return heads
      .filter(
        (t) =>
          !q ||
          t.name.toLowerCase().includes(q) ||
          matchedInside.has(t.id) ||
          model.valuesOf(t).some((v) => v.item.name.toLowerCase().includes(q)),
      )
      .filter((t) => overlapsPeriod(t, periodFrom, periodTo))
      .filter((t) => !hideCompleted || !(t.status_id && statusById.get(t.status_id)?.is_final))
      .filter((t) =>
        Object.entries(selected).every(([groupId, ids]) => ids.has(model.valueOf(t, groupId)?.id ?? NONE)),
      )
  }, [heads, query, matchedInside, periodFrom, periodTo, hideCompleted, statusById, model, selected])

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
    const withSum = (id: string, title: string, items: Task[]) => ({
      id,
      title: `${title} · ${items.length}`,
      plan: items.reduce((a, t) => a + t.planned_hours, 0),
      items,
    })

    if (activeGroupBy === 'none') {
      return sorted.length > 0 ? [withSum('all', 'Все задачи', sorted)] : []
    }
    const buckets = [
      ...model.itemsOf(activeGroupBy).map((i) => ({ id: i.id, name: i.name })),
      { id: NONE, name: 'Не указано' },
    ]
    return buckets
      .map((bucket) =>
        withSum(
          bucket.id || 'none',
          bucket.name,
          sorted.filter((t) => (model.valueOf(t, activeGroupBy)?.id ?? NONE) === bucket.id),
        ),
      )
      .filter((group) => group.items.length > 0)
  }, [activeGroupBy, sorted, model])

  /** сколько задач за каждым чипом фильтра — видно ещё до его нажатия */
  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of heads) {
      for (const g of model.groups) {
        const key = `${g.id}|${model.valueOf(t, g.id)?.id ?? NONE}`
        map.set(key, (map.get(key) ?? 0) + 1)
      }
    }
    return map
  }, [heads, model])

  // количество и часы — по одному набору: открытым головным задачам. Раньше количество
  // было по открытым, а часы по всем, и выходило «12 активных · 333,7 / 290 ч»
  const activeHeads = heads.filter((t) => !(t.status_id && statusById.get(t.status_id)?.is_final))
  const activeCount = activeHeads.length
  // план считаем только по головным: план подзадач — это раскладка плана спринта, а не добавка к нему
  const totalPlan = activeHeads.reduce((a, t) => a + t.planned_hours, 0)

  return (
    <div className="mx-auto flex max-w-lg flex-col lg:mx-0 lg:w-full lg:max-w-none">
      {/* отступ под «чёлку» — на обёртке: safe-top перебивает собственный pt-* блока */}
      <div className="safe-top">
      <div className="flex items-end justify-between gap-3 px-5 pt-3.5 pb-2.5">
        <div className="flex flex-col gap-0.5">
          <Overline>
            {plural(activeCount, ACTIVE_TASKS)} ·{' '}
            <FactSum tasks={activeHeads} childrenOf={childrenOf} activeTimer={activeTimer} plan={totalPlan} />
          </Overline>
          <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">Задачи</h1>
        </div>
        {/* сортировка подписана: значок без текста не говорил, какой порядок сейчас */}
        <Button
          variant="ghost"
          className="-mr-2 shrink-0"
          onClick={() => setSortByDue((v) => !v)}
          aria-label={sortByDue ? 'Сейчас по сроку, переключить на порядок создания' : 'Сейчас по порядку создания, переключить на срок'}
        >
          <SortArrows size={16} />
          {sortByDue ? 'По сроку' : 'По созданию'}
        </Button>
      </div>
      </div>

      <div className="flex gap-2 px-5 pb-2.5">
        {/* поиск по дизайн-системе: утопленное поле без рамки, лупа слева */}
        <label className="flex h-[var(--tap)] flex-1 items-center gap-2 rounded-sm bg-surface-sunken px-2.5 text-text-secondary">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            aria-label="Поиск задач"
            className="min-w-0 flex-1 bg-transparent text-[length:var(--input-size)] text-text placeholder:text-text-tertiary"
            style={{ outline: 'none', boxShadow: 'none' }}
          />
        </label>
        <Chip active={filtersActive || showFilters} onClick={() => setShowFilters((v) => !v)} className="min-h-[var(--tap)]">
          Фильтры
        </Chip>
      </div>

      {showFilters && (
        <div className="mx-5 mb-3 flex flex-col gap-3.5 rounded-md border border-border bg-surface p-3">
          <div className="flex flex-col gap-2">
            <span className="text-sm text-text-secondary">Срок пересекается с периодом</span>
            <div className="flex items-center gap-2">
              <DatePicker
                small
                className="flex-1"
                ariaLabel="Период с"
                value={periodFrom || null}
                onChange={(v) => setPeriodFrom(v ?? '')}
              />
              <span className="text-sm text-text-secondary">—</span>
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
                  className="min-h-11 shrink-0 px-1 text-sm font-medium text-accent-text"
                >
                  Сброс
                </button>
              )}
            </div>
          </div>

          {model.groups.map((group) => {
            // «Не указано» — только если такие задачи есть
            const options = [
              ...model.itemsOf(group.id).map((i) => ({ id: i.id, name: i.name })),
              { id: NONE, name: 'Не указано' },
            ].filter((o) => o.id !== NONE || (counts.get(`${group.id}|${NONE}`) ?? 0) > 0)
            if (options.length === 0) return null
            const current = selected[group.id] ?? null
            return (
              <div key={group.id} className="flex flex-col gap-1.5">
                <Overline>{group.name}</Overline>
                <div className="flex flex-wrap gap-2">
                  {options.map((o) => (
                    <Chip
                      key={o.id || 'none'}
                      active={current === null || current.has(o.id)}
                      onClick={() => {
                        const next = toggleMember(
                          current,
                          o.id,
                          options.map((x) => x.id),
                        )
                        setSelected((prev) => {
                          const copy = { ...prev }
                          if (next === null) delete copy[group.id]
                          else copy[group.id] = next
                          return copy
                        })
                      }}
                    >
                      {o.name}
                      <span className="tabular ml-1.5 font-mono text-xs opacity-70">
                        {counts.get(`${group.id}|${o.id}`) ?? 0}
                      </span>
                    </Chip>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="flex items-center justify-between gap-2.5 px-5 pb-2.5">
        {/* групп может быть сколько угодно — переключатель прокручивается, а не переносится */}
        <div className="sc -my-1 min-w-0 overflow-x-auto py-1">
          <Segmented
            value={activeGroupBy}
            onChange={setGroupBy}
            options={[{ value: 'none', label: 'Все' }, ...model.groups.map((g) => ({ value: g.id, label: g.name }))]}
          />
        </div>
        <Switch on={hideCompleted} onChange={setHideCompleted} label="Без готовых" />
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
                {activeGroupBy !== 'none' && (
                  <div className="flex items-baseline justify-between">
                    <Overline>{group.title}</Overline>
                    <span className="tabular font-mono text-xs text-text-secondary">
                      <FactSum tasks={group.items} childrenOf={childrenOf} activeTimer={activeTimer} plan={group.plan} />
                    </span>
                  </div>
                )}
                <ListGroup>
                {group.items.map((task) => (
                  <TaskListItem
                    key={task.id}
                    task={task}
                    status={task.status_id ? statusById.get(task.status_id) : undefined}
                    label={model.listLabel(task)}
                    color={model.colorOf(task)}
                    activeTimer={activeTimer}
                    onStartTimer={() => startTimer.mutate(task.id, { onError })}
                    onStopTimer={() => stopTimer.mutate(undefined, { onError })}
                    onDuplicate={() =>
                      duplicateTask.mutate({ task }, {
                        onError,
                        onSuccess: () => showSuccess('Копия создана'),
                      })
                    }
                    onDelete={() => setDeletingTask(task)}
                    subtasks={childrenOf.get(task.id)}
                    forceExpanded={matchedInside.has(task.id)}
                    hideDoneSubtasks={hideCompleted}
                  />
                ))}
                </ListGroup>
              </div>
            ))}
            {groups.length === 0 && (
              tasks.length === 0 ? (
                <EmptyState
                  title="Создайте первую задачу"
                  action={
                    <Link
                      to="/tasks/new"
                      className="inline-flex h-[var(--tap)] items-center rounded-sm bg-accent px-4 font-medium text-on-accent"
                    >
                      Создать задачу
                    </Link>
                  }
                >
                  Задача — это спринт или работа по клиенту с планом часов.
                </EmptyState>
              ) : (
                <EmptyState title="Ничего не нашлось">Измените запрос или сбросьте фильтры.</EmptyState>
              )
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={deletingTask !== null}
        title={`Удалить «${deletingTask?.name ?? ''}»?`}
        description={deleteDescription(deletingTask ? (childrenOf.get(deletingTask.id)?.length ?? 0) : 0)}
        onCancel={() => setDeletingTask(null)}
        onConfirm={() => {
          if (deletingTask) deleteTask.mutate(deletingTask.id, { onError })
          setDeletingTask(null)
        }}
      />
    </div>
  )
}

/**
 * «факт / план» с идущей сессией. Тикает сама по себе: раньше раз в секунду
 * перерисовывался весь список задач, и на телефоне при идущем таймере он подтормаживал —
 * особенно заметно при вводе подзадачи.
 */
function FactSum({
  tasks,
  childrenOf,
  activeTimer,
  plan,
}: {
  tasks: Task[]
  childrenOf: Map<string, Task[]>
  activeTimer: ActiveTimer | null | undefined
  plan: number
}) {
  useTicker(!!activeTimer)
  const live = activeTimer ? elapsedHours(activeTimer.started_at) : 0
  const fact = tasks.reduce((sum, t) => {
    const children = childrenOf.get(t.id)
    return sum + rollupFact(t, children) + (runningWithin(t, children, activeTimer?.task_id) ? live : 0)
  }, 0)
  return (
    <>
      {formatHoursRu(fact)} / {formatHoursRu(plan)} ч
    </>
  )
}
