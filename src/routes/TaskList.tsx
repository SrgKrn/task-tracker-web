import { ProfileButton } from '../components/Avatar'
import { useTip } from '../lib/tips'
import { WorkspaceTag } from '../components/Workspaces'
import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../lib/device'
import { Link, useLocation } from 'react-router-dom'
import { useDeferredDelete } from '../components/useDeferredDelete'
import { useRevealOnLoad } from '../lib/reveal'
import { DatePicker } from '../components/DatePicker'
import { TaskListItem } from '../components/TaskListItem'
import { ArrowUp, Check, ChevronDown, Close, Plus, Search, Settings2, SortArrows } from '../components/Icon'
import { usePopoverMode } from '../components/Popover'
import { DENSITY_LABEL, useDensity, type Density } from '../lib/density'
import { Button, Chip, ClientDot, Collapse, EmptyState, ListGroup, Overline, Segmented, Sheet, Switch, TaskRowSkeleton, fieldClass } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { overlapsPeriod, todayStr } from '../lib/period'
import { PriorityBadge } from '../components/Priority'
import { usePriorityMethod } from '../lib/queries/userSettings'
import { setGroupValue, useGroupModel, type GroupModel } from '../lib/groups'
import { useStatuses } from '../lib/queries/statuses'
import { useDuplicateTask, useTasks, useUpdateTask } from '../lib/queries/tasks'
import { useTimeEntriesInRange } from '../lib/queries/dashboard'
import { TASK_SORT_LABEL, effectiveSort, setTaskSort, sortHeads, useTaskSort, type TaskSort } from '../lib/taskSort'
import { useMoveTask } from '../components/useMoveTask'
import { useToggleDone } from '../components/useToggleDone'
import { useDragSort } from '../components/useDragSort'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { ACTIVE_TASKS, elapsedHours, formatHoursRu, plural, useTicker } from '../lib/time'
import { childrenByParent, rollupFact, runningWithin } from '../lib/tree'
import { isInDay } from '../lib/dayPlan'
import { usePref } from '../lib/prefs'
import { useActiveWorkspaceId } from '../lib/workspace'
import {
  DEFAULT_FOLDERS,
  SPECIAL_LABEL,
  buildFolders,
  condLabel,
  sourceGroupId,
  type FolderCond,
  type FolderSettings,
} from '../lib/taskFolders'
import type { ActiveTimer, Task } from '../lib/types'

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

/** Вид списка на устройстве: секции и что свёрнуто. 'stage' — по этапам, 'none' — одним списком, иначе id группы. */
interface ListView {
  sections: string
  /** id секции → свёрнута; нет ключа — по умолчанию (готовое свёрнуто) */
  collapsed: Record<string, boolean>
  showDone: boolean
}
const DEFAULT_VIEW: ListView = { sections: 'stage', collapsed: {}, showDone: true }

export function TaskList() {
  const { data: tasks = [], isLoading } = useTasks()
  const model = useGroupModel()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const duplicateTask = useDuplicateTask()
  // удаление из списка — с «Вернуть» вместо окна подтверждения (0.60)
  const deferredDelete = useDeferredDelete()
  // данные пришли после заготовок — строки проявляются лесенкой
  const listRef = useRef<HTMLDivElement>(null)
  useRevealOnLoad(listRef, isLoading)
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  const workspaceId = useActiveWorkspaceId()
  const desktop = useMediaQuery('(min-width: 1024px)')
  // таблица с колонками — на широком экране с мышью (0.62); на телефоне и планшете прежние строки
  const table = usePopoverMode()
  const [density, setDensity] = useDensity()
  const updateTask = useUpdateTask()
  // список на телефоне скрыт, пока открыта карточка, — панель в корне страницы прячем сами
  const onList = useLocation().pathname === '/tasks'

  const [search, setSearch] = useState('')
  const [periodFrom, setPeriodFrom] = useState('')
  const [periodTo, setPeriodTo] = useState('')
  const [sheet, setSheet] = useState<'filter' | 'sort' | 'folders' | null>(null)
  const [folderKey, setFolderKey] = useState('all')
  // папки и вид — у каждого пространства свои: группы в пространствах разные
  const [folderSettings, setFolderSettings] = usePref<FolderSettings>(`semternity.taskFolders.${workspaceId}`, DEFAULT_FOLDERS)
  const [view, setView] = usePref<ListView>(`semternity.taskView.${workspaceId}`, DEFAULT_VIEW)

  /** порядок: по сроку, по созданию, по методике или свой (перетаскиванием); запоминается */
  const sortMode = useTaskSort()
  const method = usePriorityMethod()
  const today = todayStr()
  const sort = effectiveSort(sortMode, method)
  /** выбранные значения по группам; нет ключа — в группе выбрано всё */
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const isDone = (t: Task) => !!(t.status_id && statusById.get(t.status_id)?.is_final)
  const filtersActive = !!periodFrom || !!periodTo || Object.keys(selected).length > 0 || !view.showDone

  // в списке только головные задачи; подзадачи живут в раскрывающемся составе спринта
  const childrenOf = useMemo(() => childrenByParent(tasks, sort === 'manual'), [tasks, sort])
  const heads = useMemo(() => tasks.filter((t) => !t.parent_id), [tasks])

  // «На сегодня» в папках — то же, что в «Сегодня»: план дня и всё, по чему сегодня шёл учёт
  const { data: todayEntries = [] } = useTimeEntriesInRange(today, today)
  const trackedToday = useMemo(() => new Set(todayEntries.map((e) => e.task_id)), [todayEntries])

  const folders = useMemo(
    () =>
      buildFolders(
        folderSettings,
        {
          model,
          today,
          inDay: (t) => isInDay(t, today, activeTimer?.task_id, trackedToday) || (childrenOf.get(t.id) ?? []).some((c) => isInDay(c, today, activeTimer?.task_id, trackedToday)),
          isDone: (t) => !!(t.status_id && statusById.get(t.status_id)?.is_final),
        },
        heads,
      ),
    [folderSettings, model, today, activeTimer?.task_id, trackedToday, childrenOf, statusById, heads],
  )
  const folder = folders.find((f) => f.key === folderKey) ?? null

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

  // всё, кроме папки, — из этого же набора считаются цифры на чипах папок
  const base = useMemo(() => {
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
      .filter((t) => view.showDone || !(t.status_id && statusById.get(t.status_id)?.is_final))
      .filter((t) =>
        Object.entries(selected).every(([groupId, ids]) => ids.has(model.valueOf(t, groupId)?.id ?? NONE)),
      )
  }, [heads, query, matchedInside, periodFrom, periodTo, view.showDone, statusById, model, selected])

  const filtered = useMemo(() => (folder ? base.filter(folder.match) : base), [base, folder])
  const sorted = useMemo(
    () => sortHeads(filtered, sort, method, today, (t) => rollupFact(t, childrenOf.get(t.id))),
    [filtered, sort, method, today, childrenOf],
  )
  const moveTask = useMoveTask()
  const toggleDone = useToggleDone()
  // подсказки 0.43: перетаскивание — когда задач стало пять; группы — когда задач три, а групп ещё нет
  const suggestGroups = !isLoading && model.groups.length === 0 && heads.length >= 3
  useTip('drag', sorted.length >= 5)
  useTip('ring-done', sorted.length > 0)
  useTip('groups', suggestGroups)

  const sectionsBy =
    view.sections === 'stage' || view.sections === 'none' || model.groupById.has(view.sections) ? view.sections : 'stage'

  const sections = useMemo(() => {
    const make = (id: string, title: string, items: Task[], doneByDefault = false) => ({
      id,
      title,
      plan: items.reduce((a, t) => a + t.planned_hours, 0),
      items,
      doneByDefault,
    })
    if (sectionsBy === 'none') return sorted.length > 0 ? [make('all', 'Все задачи', sorted)] : []
    if (sectionsBy === 'stage') {
      const list = [...statuses].sort((a, b) => a.sort_order - b.sort_order)
      const known = new Set(list.map((s) => s.id))
      return [
        make('stage:none', 'Без этапа', sorted.filter((t) => !t.status_id || !known.has(t.status_id))),
        ...list.map((s) => make(`stage:${s.id}`, s.label, sorted.filter((t) => t.status_id === s.id), s.is_final)),
      ].filter((s) => s.items.length > 0)
    }
    return [
      ...model.itemsOf(sectionsBy).map((i) => ({ id: i.id, name: i.name })),
      { id: NONE, name: 'Не указано' },
    ]
      .map((bucket) =>
        make(
          `g:${bucket.id || 'none'}`,
          bucket.name,
          sorted.filter((t) => (model.valueOf(t, sectionsBy)?.id ?? NONE) === bucket.id),
        ),
      )
      .filter((s) => s.items.length > 0)
  }, [sectionsBy, sorted, statuses, model])

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

  // количество и часы — по одному набору: открытым головным задачам
  const activeHeads = heads.filter((t) => !isDone(t))
  const totalPlan = activeHeads.reduce((a, t) => a + t.planned_hours, 0)
  // на телефоне панель — в корне страницы: анимация перехода экранов сдвигает их
  // трансформацией, и закреплённое внутри на это время уезжало бы вместе с экраном
  const floatPanel = (
      <div className="task-float pointer-events-none fixed inset-x-0 z-30 flex justify-center px-5 lg:sticky lg:bottom-4 lg:mt-4">
        <div className="tabbar-pill pointer-events-auto flex items-center rounded-full border border-border p-1 shadow-popover">
          <button
            type="button"
            onClick={() => setSheet('filter')}
            className={`relative flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${filtersActive ? 'text-accent-text' : 'text-text'}`}
          >
            Фильтр
            {filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="есть фильтры" />}
          </button>
          <span className="h-5 w-px bg-divider" aria-hidden />
          <button type="button" onClick={() => setSheet('sort')} className="flex min-h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-text">
            <SortArrows size={15} />
            {TASK_SORT_LABEL[sort]}
          </button>
        </div>
      </div>
  )

  /*
   * Строку перетащили в другую секцию (0.62): по этапам — меняется этап, по группе — значение
   * группы. В уведомлении — «Вернуть». Секции «Без секций» нет — переносить некуда.
   */
  const crossDrop = table && sectionsBy !== 'none'
  const moveToSection = (task: Task, zone: string) => {
    if (zone.startsWith('stage:')) {
      const raw = zone.slice('stage:'.length)
      const target = raw === 'none' ? null : raw
      if (target === task.status_id) return
      const previous = task.status_id
      const stage = target ? statusById.get(target) : undefined
      updateTask.mutate(
        { id: task.id, fields: { status_id: target } },
        {
          onError,
          onSuccess: () => {
            if (stage?.is_final && activeTimer?.task_id === task.id) stopTimer.mutate(undefined, { onError })
            showSuccess(`${task.name} → ${stage?.label ?? 'без этапа'}`, {
              label: 'Вернуть',
              onAction: () => updateTask.mutate({ id: task.id, fields: { status_id: previous } }, { onError }),
            })
          },
        },
      )
      return
    }
    if (zone.startsWith('g:')) {
      const group = model.groupById.get(sectionsBy)
      if (!group) return
      const raw = zone.slice('g:'.length)
      const itemId = raw === 'none' ? null : raw
      if (!itemId && group.required) {
        showError(`«${group.name}» — обязательная группа, без значения задачу не оставить`)
        return
      }
      const previous = task.item_ids ?? []
      const next = setGroupValue(model, previous, group.id, itemId)
      updateTask.mutate(
        { id: task.id, fields: { item_ids: next } },
        {
          onError,
          onSuccess: () =>
            showSuccess(`${task.name} → ${itemId ? (model.itemById.get(itemId)?.name ?? '') : 'не указано'}`, {
              label: 'Вернуть',
              onAction: () => updateTask.mutate({ id: task.id, fields: { item_ids: previous } }, { onError }),
            }),
        },
      )
    }
  }
  // заголовок колонки групп — названия групп «в строке» (у всех они свои)
  const metaTitle = [
    sectionsBy !== 'stage' ? 'Этап' : '',
    model.groups
      .filter((g) => g.show_in_list)
      .map((g) => g.name)
      .join(' · '),
  ]
    .filter(Boolean)
    .join(' · ')

  const toggleSection = (id: string, collapsed: boolean) =>
    setView({ ...view, collapsed: { ...view.collapsed, [id]: !collapsed } })

  return (
    <div className="mx-auto flex max-w-lg flex-col lg:mx-0 lg:w-full lg:max-w-none">
      <div className="safe-top">
        <div className="flex items-end justify-between gap-3 px-5 pt-3.5 pb-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <WorkspaceTag className="mb-1 self-start" />
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-text">Задачи</h1>
            <Overline>
              {plural(activeHeads.length, ACTIVE_TASKS)} ·{' '}
              <FactSum tasks={activeHeads} childrenOf={childrenOf} activeTimer={activeTimer} plan={totalPlan} />
            </Overline>
          </div>
          <ProfileButton />
        </div>
      </div>

      {/* на компьютере поиск, фильтр и порядок — одной строкой инструментов над списком (0.60) */}
      <div className="flex items-center gap-2 px-5 pb-2.5">
        <label className="flex h-[var(--tap)] min-w-0 flex-1 items-center gap-2 rounded-sm bg-surface-sunken px-2.5 text-text-secondary">
          <Search size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            aria-label="Поиск задач"
            className="min-w-0 flex-1 bg-transparent text-[length:var(--input-size)] text-text placeholder:text-text-tertiary"
            style={{ outline: 'none', boxShadow: 'none' }}
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} aria-label="Очистить поиск" className="hit-44 flex shrink-0">
              <Close size={14} />
            </button>
          )}
        </label>
        {desktop && (
          <>
            <button
              type="button"
              onClick={() => setSheet('filter')}
              className={`flex h-[var(--tap)] shrink-0 items-center gap-1.5 rounded-sm border px-3 text-sm font-medium hover:bg-surface-hover ${
                filtersActive ? 'border-accent text-accent-text' : 'border-border text-text'
              }`}
            >
              Фильтр
              {filtersActive && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="есть фильтры" />}
            </button>
            <button
              type="button"
              onClick={() => setSheet('sort')}
              title="Порядок"
              className="flex h-[var(--tap)] shrink-0 items-center gap-1.5 rounded-sm border border-border px-3 text-sm font-medium text-text hover:bg-surface-hover"
            >
              <SortArrows size={15} />
              {TASK_SORT_LABEL[sort]}
            </button>
          </>
        )}
      </div>

      {/* папки: источник выбирает человек — группа, свои папки или ничего */}
      {folderSettings.source !== 'off' && (
        <div className="sc -my-1 flex gap-2 overflow-x-auto px-5 py-1 pb-3.5">
          <Chip active={!folder} onClick={() => setFolderKey('all')}>
            Все <span className="tabular ml-1 font-mono text-xs opacity-70">{base.length}</span>
          </Chip>
          {folders.map((f) => (
            <Chip key={f.key} active={folder?.key === f.key} onClick={() => setFolderKey(folder?.key === f.key ? 'all' : f.key)}>
              <span className="flex items-center gap-1.5">
                {f.color && <ClientDot color={f.color} size={7} />}
                {f.name}
                <span className="tabular font-mono text-xs opacity-70">{base.filter(f.match).length}</span>
              </span>
            </Chip>
          ))}
          <button
            type="button"
            onClick={() => setSheet('folders')}
            aria-label="Настроить папки"
            className="flex min-h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong text-text-secondary"
          >
            <Settings2 size={15} />
          </button>
        </div>
      )}

      {suggestGroups && (
        <div className="px-5 pb-2.5">
          <Link
            to="/groups"
            data-tip="groups"
            className="flex min-h-11 items-center gap-2 rounded-md border border-dashed border-border-strong px-3.5 text-sm font-medium text-accent-text active:bg-surface-sunken lg:hover:bg-surface-hover"
          >
            + Разложить по проектам
          </Link>
        </div>
      )}

      <div
        ref={listRef}
        className={`flex flex-col gap-3 px-5 pb-2 ${table ? 'task-table' : ''}`}
        data-density={table ? density : undefined}
      >
        {table && !isLoading && sections.length > 0 && (
          <div className="thead sticky top-0 z-10 -mb-2 h-8 border-b border-divider bg-bg text-xs text-text-tertiary">
            <span />
            <span />
            <SortHead mode="name" current={sort}>
              Название
            </SortHead>
            <span className="tcol-meta min-w-0 truncate">{metaTitle}</span>
            <SortHead mode="due" current={sort}>
              Срок
            </SortHead>
            <SortHead mode="hours" current={sort} right className="tcol-hours">
              Часы
            </SortHead>
          </div>
        )}
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <TaskRowSkeleton key={i} />
            ))}
          </div>
        ) : (
          <>
            {sections.map((section) => {
              const showHeader = sectionsBy !== 'none'
              // поиск открывает всё: найденное не должно прятаться в свёрнутой секции
              const collapsed = showHeader && !query && (view.collapsed[section.id] ?? section.doneByDefault)
              return (
                <div
                  key={section.id}
                  className={`flex flex-col gap-1.5 ${crossDrop ? '-m-1 p-1' : ''}`}
                  data-drop-zone={crossDrop ? section.id : undefined}
                >
                  {showHeader && (
                    <button
                      type="button"
                      onClick={() => toggleSection(section.id, collapsed)}
                      aria-expanded={!collapsed}
                      className="flex min-h-9 items-center gap-1.5 text-left"
                    >
                      <span className="flex text-text-secondary transition-transform duration-200" style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}>
                        <ChevronDown size={15} />
                      </span>
                      <span className="text-md font-semibold text-text">{section.title}</span>
                      <span className="tabular font-mono text-xs text-text-secondary">{section.items.length}</span>
                      <span className="tabular ml-auto font-mono text-xs text-text-secondary">
                        <FactSum tasks={section.items} childrenOf={childrenOf} activeTimer={activeTimer} plan={section.plan} />
                      </span>
                    </button>
                  )}
                  <Collapse open={!collapsed}>
                    <SortableGroup
                      enabled={section.items.length > 1 || crossDrop}
                      handleOnly={table}
                      onDrop={(from, to) => moveTask(section.items, from, to)}
                      onDropOutside={crossDrop ? (from, zone) => moveToSection(section.items[from], zone) : undefined}
                    >
                      {section.items.map((task, i) => (
                        <div key={task.id} data-sort-row data-tip={i === 0 ? 'drag' : undefined}>
                          <TaskListItem
                            task={task}
                            badge={<PriorityBadge task={task} method={method} today={today} />}
                            status={task.status_id ? statusById.get(task.status_id) : undefined}
                            label={model.listLabel(task)}
                            color={model.colorOf(task)}
                            showStage={sectionsBy !== 'stage'}
                            activeTimer={activeTimer}
                            onStartTimer={() => startTimer.mutate(task.id, { onError })}
                            onStopTimer={() => stopTimer.mutate(undefined, { onError })}
                            onDuplicate={() =>
                              duplicateTask.mutate(
                                { task },
                                {
                                  onError,
                                  onSuccess: () => showSuccess('Копия создана'),
                                },
                              )
                            }
                            onDelete={() => deferredDelete(task)}
                            onToggleDone={() => toggleDone(task)}
                            subtasks={childrenOf.get(task.id)}
                            forceExpanded={matchedInside.has(task.id)}
                            hideDoneSubtasks={!view.showDone}
                            table={table}
                            onRename={(name) => updateTask.mutate({ id: task.id, fields: { name } }, { onError })}
                          />
                        </div>
                      ))}
                    </SortableGroup>
                  </Collapse>
                </div>
              )
            })}
            {sections.length === 0 &&
              (tasks.length === 0 ? (
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
                  Достаточно названия. План, срок, этап и группы можно добавить потом.
                </EmptyState>
              ) : (
                <EmptyState title="Ничего не нашлось">Измените запрос, папку или сбросьте фильтры.</EmptyState>
              ))}
          </>
        )}
      </div>

      {!desktop && onList && createPortal(floatPanel, document.body)}

      <Sheet anchored open={sheet === 'sort'} onClose={() => setSheet(null)} title="Порядок">
        <ListGroup>
          {(
            [
              'due',
              'created',
              ...(method !== 'none' ? (['method'] as const) : []),
              ...(table ? (['name', 'hours'] as const) : []),
              'manual',
            ] as TaskSort[]
          ).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTaskSort(s)
                setSheet(null)
              }}
              className="flex min-h-12 items-center justify-between px-3.5 text-left text-base text-text"
            >
              {TASK_SORT_LABEL[s]}
              {sort === s && <Check size={16} className="text-accent" />}
            </button>
          ))}
        </ListGroup>
        <span className="text-sm text-text-secondary">
          {table
            ? '«Свой порядок» — тяните задачу за ручку слева. В другую секцию — сменить этап или группу.'
            : '«Свой порядок» — удерживайте задачу и перетаскивайте.'}
        </span>
      </Sheet>

      <Sheet
        anchored
        open={sheet === 'filter'}
        onClose={() => setSheet(null)}
        title="Фильтр и вид"
        headerAction={
          filtersActive ? (
            <button
              type="button"
              onClick={() => {
                setPeriodFrom('')
                setPeriodTo('')
                setSelected({})
                setView({ ...view, showDone: true })
              }}
              className="min-h-11 text-sm font-medium text-accent-text"
            >
              Сбросить
            </button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-1.5">
          <Overline>Секции</Overline>
          <div className="sc -my-1 overflow-x-auto py-1">
            <Segmented
              value={sectionsBy}
              onChange={(v) => setView({ ...view, sections: v })}
              options={[
                { value: 'stage', label: 'По этапам' },
                ...model.groups.map((g) => ({ value: g.id, label: g.name })),
                { value: 'none', label: 'Без секций' },
              ]}
            />
          </div>
        </div>
        <Switch on={view.showDone} onChange={(v) => setView({ ...view, showDone: v })} label="Показывать готовые" />
        {table && (
          <div className="flex flex-col gap-1.5">
            <Overline>Плотность</Overline>
            <Segmented<Density>
              value={density}
              onChange={setDensity}
              className="self-start"
              options={[
                { value: 'compact', label: DENSITY_LABEL.compact },
                { value: 'comfortable', label: DENSITY_LABEL.comfortable },
              ]}
            />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <Overline>Срок пересекается с периодом</Overline>
          <div className="flex items-center gap-2">
            <DatePicker small className="flex-1" ariaLabel="Период с" value={periodFrom || null} onChange={(v) => setPeriodFrom(v ?? '')} />
            <span className="text-sm text-text-secondary">—</span>
            <DatePicker small className="flex-1" ariaLabel="Период до" value={periodTo || null} onChange={(v) => setPeriodTo(v ?? '')} />
          </div>
        </div>
        {model.groups.map((group) => {
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
                    <span className="tabular ml-1.5 font-mono text-xs opacity-70">{counts.get(`${group.id}|${o.id}`) ?? 0}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )
        })}
        <Button variant="primary" size="lg" onClick={() => setSheet(null)}>
          Показать {plural(filtered.length, ['задачу', 'задачи', 'задач'])}
        </Button>
      </Sheet>

      <FoldersSheet
        open={sheet === 'folders'}
        onClose={() => setSheet(null)}
        settings={folderSettings}
        onChange={(next) => {
          setFolderSettings(next)
          setFolderKey('all')
        }}
        model={model}
      />

    </div>
  )
}

/** Что стоит в папках: значения любой группы, свои папки с условием или ничего. */
function FoldersSheet({
  open,
  onClose,
  settings,
  onChange,
  model,
}: {
  open: boolean
  onClose: () => void
  settings: FolderSettings
  onChange: (next: FolderSettings) => void
  model: GroupModel
}) {
  const [name, setName] = useState('')
  const [cond, setCond] = useState<FolderCond | null>(null)
  const groupId = sourceGroupId(settings, model)
  const source = settings.source === 'custom' || settings.source === 'off' ? settings.source : groupId ? `group:${groupId}` : 'off'

  const options = [
    ...model.groups.map((g) => ({ value: `group:${g.id}`, label: g.name, hint: 'папка на каждое значение' })),
    { value: 'custom', label: 'Свои папки', hint: 'название и условие — какие задачи в ней' },
    { value: 'off', label: 'Без папок', hint: 'только поиск и фильтр' },
  ]
  const add = () => {
    if (!name.trim() || !cond) return
    onChange({ ...settings, source: 'custom', custom: [...settings.custom, { id: crypto.randomUUID(), name: name.trim(), cond }] })
    setName('')
    setCond(null)
  }
  const condKey = (c: FolderCond | null) => (c ? (c.kind === 'item' ? `item:${c.itemId}` : c.kind) : '')

  return (
    <Sheet anchored open={open} onClose={onClose} title="Папки">
      <ListGroup>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange({ ...settings, source: o.value })}
            className="flex min-h-13 items-center gap-3 px-3.5 py-2 text-left"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base text-text">{o.label}</span>
              <span className="text-sm text-text-secondary">{o.hint}</span>
            </span>
            {source === o.value && <Check size={16} className="shrink-0 text-accent" />}
          </button>
        ))}
      </ListGroup>

      {source === 'custom' && (
        <>
          {settings.custom.length > 0 && (
            <ListGroup>
              {settings.custom.map((f) => (
                <div key={f.id} className="flex min-h-12 items-center gap-3 px-3.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base text-text">{f.name}</span>
                    <span className="truncate text-sm text-text-secondary">{condLabel(f.cond, model)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...settings, custom: settings.custom.filter((x) => x.id !== f.id) })}
                    aria-label={`Удалить папку «${f.name}»`}
                    className="hit-44 flex shrink-0 text-text-secondary"
                  >
                    <Close size={16} />
                  </button>
                </div>
              ))}
            </ListGroup>
          )}
          <div className="flex flex-col gap-2.5 rounded-md border border-dashed border-border-strong p-3">
            <Overline>Новая папка</Overline>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" aria-label="Название папки" className={fieldClass} />
            <span className="text-sm text-text-secondary">Какие задачи в ней</span>
            <div className="flex flex-wrap gap-2">
              {(['today', 'hot', 'noplan'] as const).map((k) => (
                <Chip key={k} active={condKey(cond) === k} onClick={() => setCond({ kind: k })}>
                  {SPECIAL_LABEL[k]}
                </Chip>
              ))}
            </div>
            {model.groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary">{g.name}</span>
                <div className="flex flex-wrap gap-2">
                  {model
                    .itemsOf(g.id)
                    .filter((i) => !i.archived)
                    .map((i) => (
                      <Chip
                        key={i.id}
                        active={condKey(cond) === `item:${i.id}`}
                        onClick={() => {
                          setCond({ kind: 'item', itemId: i.id })
                          if (!name.trim()) setName(i.name)
                        }}
                      >
                        {i.name}
                      </Chip>
                    ))}
                </div>
              </div>
            ))}
            <Button variant="secondary" onClick={add} disabled={!name.trim() || !cond}>
              <Plus size={15} /> Добавить папку
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}

/**
 * «факт / план» с идущей сессией. Тикает сама по себе: раньше раз в секунду
 * перерисовывался весь список задач, и на телефоне при идущем таймере он подтормаживал.
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

/** Группа строк, которые можно переставлять долгим нажатием (свой порядок). */
function SortableGroup({
  enabled,
  onDrop,
  onDropOutside,
  handleOnly = false,
  children,
}: {
  enabled: boolean
  onDrop: (from: number, to: number) => void
  onDropOutside?: (from: number, zone: string) => void
  handleOnly?: boolean
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDragSort(ref, { enabled, onDrop, onDropOutside, handleOnly })
  return (
    <ListGroup ref={ref} className={enabled ? 'sortable' : ''}>
      {children}
    </ListGroup>
  )
}

/** Заголовок колонки таблицы: по клику — порядок по этой колонке, у выбранной — стрелка. */
function SortHead({
  mode,
  current,
  right = false,
  className = '',
  children,
}: {
  mode: TaskSort
  current: TaskSort
  right?: boolean
  className?: string
  children: React.ReactNode
}) {
  const active = current === mode
  return (
    <button
      type="button"
      onClick={() => setTaskSort(mode)}
      title={TASK_SORT_LABEL[mode]}
      aria-pressed={active}
      className={`flex h-8 min-w-0 items-center gap-1 hover:text-text ${right ? 'justify-end' : ''} ${active ? 'font-medium text-text-secondary' : ''} ${className}`}
    >
      <span className="truncate">{children}</span>
      {active && (
        // по возрастанию — вверх, как в Asana; часы — по убыванию, больше вверху
        <span className="flex shrink-0" style={{ transform: mode === 'hours' ? 'rotate(180deg)' : undefined }}>
          <ArrowUp size={11} />
        </span>
      )}
    </button>
  )
}
