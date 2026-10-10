import { useState } from 'react'
import { DatePicker } from './DatePicker'
import { ChipPicker } from './ChipPicker'
import { DurationSheet } from './DurationSheet'
import { GroupFields } from './GroupFields'
import { ChevronDown } from './Icon'
import { PickerField, type PickerOption } from './PickerField'
import { FieldLabel, fieldClass } from './ui'
import { formatHoursMinutes } from '../lib/time'
import { describeError, useToast } from '../lib/Toast'
import { missingRequired, useGroupModel } from '../lib/groups'
import { useCreateStatus } from '../lib/queries/statuses'
import type { Status } from '../lib/types'

export interface TaskFormValues {
  name: string
  /** значения групп: по одному из каждой */
  item_ids: string[]
  status_id: string | null
  planned_hours: number
  start_date: string | null
  end_date: string | null
  is_daily: boolean
  /** спринт подзадачи; у головной задачи — null */
  parent_id?: string | null
}

interface TaskFormProps {
  initial: TaskFormValues
  statuses: Status[]
  submitLabel: string
  /** карточка редактирует существующую задачу — название и статус живут в её шапке */
  compact?: boolean
  /**
   * Форма подзадачи: вместо групп — выбор спринта. Значения групп подзадача всё равно
   * берёт у спринта (это держит база), и показывать их на выбор было бы враньём.
   */
  sprints?: PickerOption[]
  onSubmit: (values: TaskFormValues) => void
}

export function TaskForm({
  initial,
  statuses,
  submitLabel,
  compact = false,
  sprints,
  onSubmit,
}: TaskFormProps) {
  const [values, setValues] = useState<TaskFormValues>(initial)
  const [editingPlan, setEditingPlan] = useState(false)

  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  const model = useGroupModel()
  const createStatus = useCreateStatus()

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.name.trim()) return
    // у подзадачи групп нет — их держит спринт
    const missing = sprints ? [] : missingRequired(model, values.item_ids)
    if (missing.length > 0) {
      showError(`Выберите: ${missing.map((g) => g.item_name.toLowerCase()).join(', ')}`)
      return
    }
    // В компактном режиме поля имени тут нет — им владеет заголовок карточки.
    // Если всё равно отправить своё values.name, форма затрёт свежее переименование
    // тем значением, с которым она смонтировалась.
    if (compact) {
      const { name: _ownedByHeader, ...rest } = values
      onSubmit({ ...rest, name: initial.name })
      return
    }
    onSubmit(values)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      {!compact && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Название задачи</FieldLabel>
          <input
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            className={fieldClass}
            placeholder="Что нужно сделать"
            required
          />
        </div>
      )}

      {/* тот же ввод длительности, что у факта и у плана в листе создания:
          раньше здесь одиноко оставались два голых числовых поля */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <FieldLabel>План</FieldLabel>
        <button
          type="button"
          onClick={() => setEditingPlan(true)}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left"
          style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
        >
          <span className="tabular font-mono text-sm text-slate-100">
            {values.planned_hours > 0 ? formatHoursMinutes(values.planned_hours) : 'не задан'}
          </span>
          <ChevronDown size={14} className="text-slate-600" />
        </button>
      </div>

      <DurationSheet
        open={editingPlan}
        title="Плановое время"
        hours={values.planned_hours}
        onCancel={() => setEditingPlan(false)}
        onSubmit={(value) => {
          setEditingPlan(false)
          set('planned_hours', value)
        }}
      />

      <div className="flex gap-[9px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Срок с</FieldLabel>
          <DatePicker
            value={values.start_date}
            onChange={(v) => set('start_date', v)}
            ariaLabel="Срок с"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Срок до</FieldLabel>
          <DatePicker value={values.end_date} onChange={(v) => set('end_date', v)} ariaLabel="Срок до" />
        </div>
      </div>

      {/* компактные строки с поиском, а не ряды чипов: на тринадцати проектах чипы
          занимали пятую часть экрана и форму приходилось прокручивать целиком */}
      {sprints ? (
        <PickerField
          label="Спринт"
          items={sprints}
          value={values.parent_id ?? null}
          onChange={(id) => id && set('parent_id', id)}
          placeholder="Спринт"
        />
      ) : (
        <GroupFields model={model} value={values.item_ids} onChange={(ids) => set('item_ids', ids)} />
      )}

      {/* статусов обычно единицы — их держим чипами, выбор виден без лишнего касания */}
      <ChipPicker
        label="Статус"
        items={statuses.map((s) => ({ id: s.id, name: s.label }))}
        value={values.status_id}
        onChange={(id) => set('status_id', id)}
        placeholder="Название статуса"
        noneLabel="Без статуса"
        onCreate={(name, onCreated) =>
          createStatus.mutate(name, { onError, onSuccess: (row) => onCreated(row.id) })
        }
      />

      {/* вся строка — цель нажатия: голый чекбокс был 13×13 */}
      <label className="-my-1 flex min-h-11 items-center gap-2.5 text-sm text-slate-400">
        <input
          type="checkbox"
          checked={values.is_daily}
          onChange={(e) => set('is_daily', e.target.checked)}
          className="h-[18px] w-[18px] shrink-0 accent-sky-600"
        />
        Ежедневная — всегда в списке дня
      </label>

      <button
        type="submit"
        className="mt-1 h-11 w-full rounded-[14px] text-sm font-semibold lg:w-auto lg:self-start lg:px-8"
        style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
      >
        {submitLabel}
      </button>
    </form>
  )
}
