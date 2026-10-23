import { focusOnOpen } from '../lib/device'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { DatePicker } from './DatePicker'
import { DurationSheet } from './DurationSheet'
import { GroupFields } from './GroupFields'
import { PickerField } from './PickerField'
import { Minus, Plus } from './Icon'
import { Button, FieldLabel, Segmented, Sheet, fieldClass } from './ui'
import { describeError, useToast } from '../lib/Toast'
import { missingRequired, useGroupModel, type GroupModel } from '../lib/groups'
import { useStatuses } from '../lib/queries/statuses'
import { useCreateTask, useTask, useTasks } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer } from '../lib/queries/timer'
import { formatHoursMinutes } from '../lib/time'
import { todayStr } from '../lib/period'
import type { Task } from '../lib/types'

const LAST_ITEMS_KEY = 'semternity.lastItems'

/** что выбирали в прошлый раз — новая задача чаще всего по тому же клиенту */
function loadLastItems(): string[] {
  try {
    const raw = localStorage.getItem(LAST_ITEMS_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : null
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Начальные значения: прошлый выбор, если он ещё жив и не в архиве; в обязательной группе
 * без прошлого выбора — первое значение, как и раньше.
 */
function initialItems(model: GroupModel): string[] {
  const alive = loadLastItems().filter((id) => {
    const item = model.itemById.get(id)
    return !!item && !item.archived && model.groupById.has(item.group_id)
  })
  const result = [...alive]
  for (const group of model.groups) {
    if (!group.required || model.valueOf({ item_ids: result }, group.id)) continue
    const first = model.itemsOf(group.id).find((i) => !i.archived)
    if (first) result.push(first.id)
  }
  return result
}

/** Начальные значения окна — например, задача из встречи календаря (0.42). */
export interface NewTaskPreset {
  title?: string
  kind?: 'task' | 'subtask'
  parentId?: string | null
  endDate?: string | null
  plan?: number
  itemIds?: string[] | null
  /** сразу в план «Сегодня» */
  planDate?: string | null
}

/**
 * Быстрое создание задачи: название, спринт или подзадача, группы, план, срок — и либо
 * просто создать, либо создать и сразу начать учёт.
 *
 * С preset/onCreated окно открывают для другого сценария (задача из встречи): поля уже
 * заполнены, а что делать после создания, решает вызвавший — onCreated(задача, нажата ли
 * главная кнопка). Тогда учёт сам не начинается и в карточку не переходим.
 */
export function NewTaskSheet({
  open,
  onClose,
  preset,
  sheetTitle = 'Новая задача',
  primaryLabel = 'Создать и начать',
  onCreated,
  extra,
}: {
  open: boolean
  onClose: () => void
  preset?: NewTaskPreset
  sheetTitle?: string
  primaryLabel?: string
  onCreated?: (task: Task, primary: boolean) => void
  /** дополнительные поля перед кнопками */
  extra?: ReactNode
}) {
  const navigate = useNavigate()
  const model = useGroupModel()
  const createTask = useCreateTask()
  const startTimer = useStartTimer()
  const { data: tasks = [], isLoading: tasksLoading } = useTasks()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()
  const { data: runningTask } = useTask(activeTimer?.task_id)
  const { showError } = useToast()

  const [title, setTitle] = useState('')
  const [plan, setPlan] = useState(1)
  const [itemIds, setItemIds] = useState<string[] | null>(null)
  const [editingPlan, setEditingPlan] = useState(false)
  // задача — головная (спринт), подзадача — внутри выбранного спринта
  const [kind, setKind] = useState<'task' | 'subtask'>('task')
  const [parentId, setParentId] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)

  // в какой спринт класть подзадачу: открытые головные задачи
  const sprintOptions = useMemo(() => {
    const finalIds = new Set(statuses.filter((st) => st.is_final).map((st) => st.id))
    return tasks
      .filter((t) => !t.parent_id && !(t.status_id && finalIds.has(t.status_id)))
      .map((t) => {
        const label = model.listLabel(t)
        return { id: t.id, name: `${t.name}${label ? ` · ${label}` : ''}` }
      })
  }, [tasks, statuses, model])

  // сброс только на открытии листа. Если завязать эффект ещё и на списки, то
  // создание значения прямо отсюда обновляло бы список и тут же сбрасывало выбор
  useEffect(() => {
    if (!open) return
    setTitle(preset?.title ?? '')
    setPlan(preset?.plan ?? 1)
    setItemIds(preset?.itemIds ?? null)
    setEditingPlan(false)
    setKind(preset?.kind ?? 'task')
    setParentId(preset?.parentId ?? null)
    setEndDate(preset?.endDate ?? null)
    // preset читаем только в момент открытия
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  // пока пользователь не выбрал сам — прошлый выбор (группы могли ещё грузиться при открытии)
  const effectiveItems = itemIds ?? initialItems(model)
  // «Подзадача» — только когда есть во что вкладывать (0.43): у новичка переключатель
  // ничего не значит. Слово «спринт» тоже ушло из окна — подзадача кладётся в задачу
  const canNest = sprintOptions.length > 0 || kind === 'subtask'
  // у подзадачи групп нет — их держит задача; зато без задачи её не создать
  const missing = kind === 'subtask' ? [] : missingRequired(model, effectiveItems)
  const canCreate = !!title.trim() && missing.length === 0 && (kind === 'task' || !!parentId)
  const whyDisabled =
    kind === 'subtask' && !parentId
      ? 'Выберите задачу'
      : missing.length
        ? `Выберите: ${missing.map((g) => g.item_name.toLowerCase()).join(', ')}`
        : undefined

  function create(andStart: boolean) {
    if (!canCreate) return
    try {
      localStorage.setItem(LAST_ITEMS_KEY, JSON.stringify(effectiveItems))
    } catch {
      // не запомнили — в следующий раз просто начнём с первых значений
    }
    createTask.mutate(
      {
        name: title.trim(),
        ...(kind === 'subtask' ? { parent_id: parentId } : { item_ids: effectiveItems }),
        status_id: null,
        planned_hours: plan,
        start_date: null,
        end_date: endDate,
        // самая первая задача пространства — сразу в план дня: иначе новичок вернётся на
        // «Сегодня» и не найдёт её там
        plan_date: preset?.planDate ?? (kind === 'task' && !tasksLoading && tasks.length === 0 ? todayStr() : null),
      },
      {
        onError: (e) => showError(describeError(e)),
        onSuccess: (row) => {
          onClose()
          if (onCreated) return onCreated(row, andStart)
          if (andStart) startTimer.mutate(row.id, { onError: (e) => showError(describeError(e)) })
          navigate(`/tasks/${row.id}`)
        },
      },
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={sheetTitle}
      headerAction={
        <Button variant="ghost" className="-mr-2" onClick={onClose}>
          Отмена
        </Button>
      }
    >
        {canNest && (
          <Segmented
            stretch
            value={kind}
            onChange={setKind}
            options={[
              { value: 'task', label: 'Задача' },
              { value: 'subtask', label: 'Подзадача' },
            ]}
          />
        )}

        <input
          autoFocus={focusOnOpen}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Что нужно сделать"
          aria-label="Название задачи"
          className={`${fieldClass} h-12`}
        />

        {/* компактные строки вместо рядов чипов: на десятках проектов чипы растягивали лист
            на весь экран. Длинный список прокручивается в окне выбора, там же поиск
            и создание нового значения */}
        {kind === 'subtask' ? (
          <PickerField
            label="Внутри задачи"
            items={sprintOptions}
            value={parentId}
            onChange={setParentId}
            placeholder="Выберите задачу"
            hint="Группы подзадача берёт у своей задачи"
          />
        ) : (
          <GroupFields model={model} value={effectiveItems} onChange={setItemIds} />
        )}

        <div className="flex items-center justify-between gap-3">
          <FieldLabel>План</FieldLabel>
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => setPlan((v) => Math.max(0.25, v - 0.25))}
              aria-label="Убавить 15 минут"
              className="hit-44 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary active:bg-surface-sunken"
            >
              <Minus />
            </button>
            {/* по цифре открывается ввод: шагами по 15 минут набирать «3 ч 40 мин» долго */}
            <button
              type="button"
              onClick={() => setEditingPlan(true)}
              className="tabular min-w-[92px] rounded-sm py-1 text-center font-mono text-lg font-semibold text-text underline decoration-dotted decoration-text-secondary underline-offset-4"
            >
              {formatHoursMinutes(plan)}
            </button>
            <button
              type="button"
              onClick={() => setPlan((v) => v + 0.25)}
              aria-label="Прибавить 15 минут"
              className="hit-44 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface text-text-secondary active:bg-surface-sunken"
            >
              <Plus />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <FieldLabel>Срок</FieldLabel>
          <DatePicker small className="w-[150px]" ariaLabel="Срок задачи" value={endDate} onChange={setEndDate} />
        </div>

        {extra}

        {/* идущий учёт остановится — об этом надо знать до нажатия, а не после */}
        {!onCreated && activeTimer && runningTask && (
          <p className="rounded-md bg-warning-soft px-3 py-2.5 text-sm leading-[1.45] text-warning-text">
            «Создать и начать» остановит идущий учёт по «{runningTask.name}» и запишет его.
          </p>
        )}

        {/* у окна «из встречи» подпись длиннее («Создать и засчитать 1 ч 30 мин») — кнопки
            друг под другом, главная сверху во всю ширину */}
        <div className={`mt-1 flex shrink-0 gap-2 ${onCreated ? 'flex-col-reverse' : ''}`}>
          <Button size="lg" className={onCreated ? 'w-full' : 'flex-1'} onClick={() => create(false)} disabled={!canCreate} title={whyDisabled}>
            Создать
          </Button>
          <Button
            size="lg"
            variant="primary"
            className={onCreated ? 'w-full' : 'flex-[1.4]'}
            onClick={() => create(true)}
            disabled={!canCreate}
            title={whyDisabled}
          >
            {primaryLabel}
          </Button>
        </div>
        {whyDisabled && title.trim() && <p className="-mt-1.5 text-center text-xs text-text-secondary">{whyDisabled}</p>}

        {/* внутри содержимого листа, а не рядом: клик по подложке этого окна не должен
            всплыть до подложки листа и закрыть заодно и его */}
        <DurationSheet
          open={editingPlan}
          title="Плановое время"
          hours={plan}
          onCancel={() => setEditingPlan(false)}
          onSubmit={(value) => {
            setEditingPlan(false)
            setPlan(Math.max(0.25, value))
          }}
        />
    </Sheet>
  )
}
