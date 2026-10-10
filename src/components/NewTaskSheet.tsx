import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DurationSheet } from './DurationSheet'
import { GroupFields } from './GroupFields'
import { FieldLabel } from './ui'
import { describeError, useToast } from '../lib/Toast'
import { missingRequired, useGroupModel, type GroupModel } from '../lib/groups'
import { useCreateTask } from '../lib/queries/tasks'
import { useStartTimer } from '../lib/queries/timer'
import { formatHoursMinutes } from '../lib/time'

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

/** Быстрое создание задачи: название, группы, план — и сразу старт учёта. */
export function NewTaskSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const model = useGroupModel()
  const createTask = useCreateTask()
  const startTimer = useStartTimer()
  const { showError } = useToast()

  const [title, setTitle] = useState('')
  const [plan, setPlan] = useState(1)
  const [itemIds, setItemIds] = useState<string[] | null>(null)
  const [editingPlan, setEditingPlan] = useState(false)

  // сброс только на открытии листа. Если завязать эффект ещё и на списки, то
  // создание значения прямо отсюда обновляло бы список и тут же сбрасывало выбор
  useEffect(() => {
    if (!open) return
    setTitle('')
    setPlan(1)
    setItemIds(null)
    setEditingPlan(false)
  }, [open])

  if (!open) return null

  // пока пользователь не выбрал сам — прошлый выбор (группы могли ещё грузиться при открытии)
  const effectiveItems = itemIds ?? initialItems(model)
  const missing = missingRequired(model, effectiveItems)
  const canCreate = !!title.trim() && missing.length === 0

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
        item_ids: effectiveItems,
        status_id: null,
        planned_hours: plan,
        start_date: null,
        end_date: null,
      },
      {
        onError: (e) => showError(describeError(e)),
        onSuccess: (row) => {
          onClose()
          if (andStart) startTimer.mutate(row.id, { onError: (e) => showError(describeError(e)) })
          navigate(`/tasks/${row.id}`)
        },
      },
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-center"
      style={{ background: 'var(--s-backdrop)' }}
      onClick={onClose}
    >
      <div
        className="flex w-full flex-col gap-3.5 px-5 pt-[18px] pb-[30px] lg:max-w-md lg:rounded-[28px] lg:pb-6"
        style={{
          background: 'var(--s-surface-2)',
          borderTop: '1px solid var(--s-border-strong)',
          borderRadius: '28px 28px 44px 44px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto h-1 w-[38px] rounded-full" style={{ background: 'var(--s-border-strong-2)' }} />
        <h3 className="text-lg font-semibold leading-[1.2] text-slate-100">Новая задача</h3>

        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Что нужно сделать"
          className="h-[46px] rounded-[14px] px-3.5 text-base text-slate-100 placeholder:text-[var(--s-placeholder)]"
          style={{ background: 'var(--s-input)', border: '1px solid var(--s-border-strong)' }}
        />

        {/* компактные строки вместо рядов чипов: на десятках проектов чипы растягивали лист
            на весь экран. Длинный список прокручивается в окне выбора, там же поиск
            и создание нового значения */}
        <GroupFields model={model} value={effectiveItems} onChange={setItemIds} />

        <div className="flex items-center justify-between gap-3">
          <FieldLabel>План</FieldLabel>
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => setPlan((v) => Math.max(0.25, v - 0.25))}
              aria-label="Убавить 15 минут"
              className="hit-44 flex h-[34px] w-[34px] items-center justify-center rounded-full text-base text-slate-300"
              style={{ border: '1px solid var(--s-border-strong-2)' }}
            >
              −
            </button>
            {/* по цифре открывается ввод: шагами по 15 минут набирать «3 ч 40 мин» долго */}
            <button
              type="button"
              onClick={() => setEditingPlan(true)}
              className="tabular min-w-[92px] rounded-lg py-1 text-center font-mono text-lg font-semibold text-slate-100 underline decoration-dotted decoration-slate-600 underline-offset-4"
            >
              {formatHoursMinutes(plan)}
            </button>
            <button
              type="button"
              onClick={() => setPlan((v) => v + 0.25)}
              aria-label="Прибавить 15 минут"
              className="hit-44 flex h-[34px] w-[34px] items-center justify-center rounded-full text-base text-slate-300"
              style={{ border: '1px solid var(--s-border-strong-2)' }}
            >
              +
            </button>
          </div>
        </div>

        <div className="mt-0.5 flex gap-[9px]">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-[15px] text-sm font-medium text-slate-300"
            style={{ border: '1px solid var(--s-border-strong-2)' }}
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => create(true)}
            disabled={!canCreate}
            title={missing.length ? `Выберите: ${missing.map((g) => g.item_name.toLowerCase()).join(', ')}` : undefined}
            className="h-12 flex-[2] rounded-[15px] text-sm font-semibold"
            style={{
              background: canCreate ? 'var(--s-accent)' : 'var(--s-disabled-bg)',
              color: canCreate ? 'var(--s-on-accent)' : 'var(--s-disabled-fg)',
            }}
          >
            Создать и начать
          </button>
        </div>

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
      </div>
    </div>
  )
}
