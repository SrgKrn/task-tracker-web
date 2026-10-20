import { useState } from 'react'
import { DatePicker } from './DatePicker'
import { ChipPicker } from './ChipPicker'
import { DurationSheet } from './DurationSheet'
import { RateSheet } from './RateSheet'
import { formatRate, itemRate, type RateCurrency } from '../lib/rate'
import { GroupFields } from './GroupFields'
import { ChevronDown } from './Icon'
import { PickerField, type PickerOption } from './PickerField'
import { Link } from 'react-router-dom'
import { FieldLabel, ListGroup, Switch, fieldClass } from './ui'
import { stageTone } from '../lib/stage'
import { formatHoursMinutes } from '../lib/time'
import { describeError, useToast } from '../lib/Toast'
import { missingRequired, useGroupModel } from '../lib/groups'
import { useCreateStatus } from '../lib/queries/statuses'
import { useClientWork } from '../lib/workspace'
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
  /** своя ставка спринта; null — как у клиента */
  hourly_rate?: number | null
  rate_currency?: string | null
}

interface TaskFormProps {
  initial: TaskFormValues
  statuses: Status[]
  submitLabel?: string
  /** карточка редактирует существующую задачу — название и статус живут в её шапке */
  compact?: boolean
  /**
   * Форма подзадачи: вместо групп — выбор спринта. Значения групп подзадача всё равно
   * берёт у спринта (это держит база), и показывать их на выбор было бы враньём.
   */
  sprints?: PickerOption[]
  onSubmit?: (values: TaskFormValues) => void
  /**
   * Автосохранение карточки: каждое поле сохраняется само при изменении, кнопки нет.
   * Значения тогда берутся из initial (это сама задача), а не из своего состояния —
   * «Вернуть» из уведомления и правки с другого устройства видны сразу.
   */
  onFieldChange?: (patch: Partial<TaskFormValues>) => void
}

export function TaskForm({
  initial,
  statuses,
  submitLabel,
  compact = false,
  sprints,
  onSubmit,
  onFieldChange,
}: TaskFormProps) {
  const [draft, setValues] = useState<TaskFormValues>(initial)
  const values = onFieldChange ? initial : draft
  const [editingPlan, setEditingPlan] = useState(false)
  const [editingRate, setEditingRate] = useState(false)

  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  const model = useGroupModel()
  // ставка — только в пространстве «Работа с клиентами»
  const clientWork = useClientWork()
  const createStatus = useCreateStatus()

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    if (onFieldChange) {
      if (JSON.stringify(value) === JSON.stringify(initial[key])) return
      // обязательную группу нельзя оставить пустой — и сохранять такое незачем
      if (key === 'item_ids') {
        const missing = missingRequired(model, value as string[])
        if (missing.length > 0) {
          showError(`Выберите: ${missing.map((g) => g.item_name.toLowerCase()).join(', ')}`)
          return
        }
      }
      onFieldChange({ [key]: value } as Partial<TaskFormValues>)
      return
    }
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
    if (!onSubmit) return
    if (compact) {
      const { name: _ownedByHeader, ...rest } = values
      onSubmit({ ...rest, name: initial.name })
      return
    }
    onSubmit(values)
  }

  /*
   * Карточка: свойства списком, как в настройках iOS — подпись слева, значение справа.
   * Раньше они лежали во вкладке «Время» полями формы, хотя ко времени не относятся.
   */
  if (compact && onFieldChange) {
    const stageColor = (id: string) => {
      const st = statuses.find((x) => x.id === id)
      return st ? `var(--status-${stageTone(st, statuses)})` : null
    }
    // ставка — только у спринта: подзадачи считаются по ставке спринта
    const showRate = !sprints && clientWork
    const inherited = !showRate ? null : itemRate(values.item_ids, model.items, model.groups.map((g) => g.id))
    const ownRate = values.hourly_rate != null && Number(values.hourly_rate) > 0
    const rateText = ownRate
      ? formatRate(Number(values.hourly_rate), (values.rate_currency ?? 'BYN') as RateCurrency)
      : inherited
        ? `${formatRate(inherited.rate, inherited.currency)} · как у клиента`
        : 'не задана'
    return (
      <>
      <ListGroup clip={false}>
        <PickerField
          row
          label="Этап"
          items={[...statuses].sort((a, b) => a.sort_order - b.sort_order).map((st) => ({ id: st.id, name: st.label }))}
          value={values.status_id}
          onChange={(id) => set('status_id', id)}
          placeholder="Этап"
          noneLabel="Без этапа"
          dotOf={stageColor}
          footer={
            <Link to="/statuses" className="min-h-11 self-start py-2 text-sm font-medium text-accent-text">
              Настроить этапы
            </Link>
          }
        />
        <button
          type="button"
          onClick={() => setEditingPlan(true)}
          className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-base active:bg-surface-sunken"
        >
          <span className="text-text-secondary">План</span>
          <span className={`tabular flex-1 text-right font-mono ${values.planned_hours > 0 ? 'text-text' : 'text-text-tertiary'}`}>
            {values.planned_hours > 0 ? formatHoursMinutes(values.planned_hours) : 'не задан'}
          </span>
          <ChevronDown size={14} className="shrink-0 text-text-tertiary" />
        </button>
        {showRate && (
          <button
            type="button"
            onClick={() => setEditingRate(true)}
            className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-base active:bg-surface-sunken"
          >
            <span className="text-text-secondary">Ставка</span>
            <span
              className={`tabular min-w-0 flex-1 truncate text-right font-mono ${ownRate ? 'text-text' : 'text-text-tertiary'}`}
            >
              {rateText}
            </span>
            <ChevronDown size={14} className="shrink-0 text-text-tertiary" />
          </button>
        )}
        <div className="flex items-center gap-3 px-3">
          <span className="shrink-0 text-base text-text-secondary">Начало</span>
          <DatePicker row className="flex-1" value={values.start_date} onChange={(v) => set('start_date', v)} ariaLabel="Начало" />
        </div>
        <div className="flex items-center gap-3 px-3">
          <span className="shrink-0 text-base text-text-secondary">Срок</span>
          <DatePicker row className="flex-1" value={values.end_date} onChange={(v) => set('end_date', v)} ariaLabel="Срок" />
        </div>
        {sprints ? (
          <PickerField
            row
            label="Спринт"
            items={sprints}
            value={values.parent_id ?? null}
            onChange={(id) => id && set('parent_id', id)}
            placeholder="Спринт"
          />
        ) : (
          <GroupFields rows model={model} value={values.item_ids} onChange={(ids) => set('item_ids', ids)} />
        )}
        <div className="flex min-h-12 items-center gap-3 px-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base text-text">Ежедневная</span>
            <span className="text-sm text-text-secondary">Всегда в списке дня</span>
          </span>
          <Switch on={values.is_daily} onChange={(v) => set('is_daily', v)} ariaLabel="Ежедневная — всегда в списке дня" />
        </div>
      </ListGroup>
      {/* лист — вне списка: у списка разделители между детьми, и подложка получила бы рамку */}
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
        {showRate && (
          <RateSheet
            open={editingRate}
            title="Ставка спринта"
            value={{
              hourly_rate: values.hourly_rate ?? null,
              rate_currency: (values.rate_currency ?? null) as RateCurrency | null,
            }}
            inheritedLabel={inherited ? `${formatRate(inherited.rate, inherited.currency)} у «${inherited.itemName}»` : ''}
            onCancel={() => setEditingRate(false)}
            onSubmit={(v) => {
              setEditingRate(false)
              // ставка и валюта — одной правкой: «Вернуть» откатывает обе
              if (onFieldChange && (v.hourly_rate !== (values.hourly_rate ?? null) || v.rate_currency !== (values.rate_currency ?? null))) {
                onFieldChange({ hourly_rate: v.hourly_rate, rate_currency: v.rate_currency })
              }
            }}
          />
        )}
      </>
    )
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
          className="flex h-10 w-full items-center justify-between gap-2 rounded-sm px-3 text-left"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          <span className="tabular font-mono text-base text-text">
            {values.planned_hours > 0 ? formatHoursMinutes(values.planned_hours) : 'не задан'}
          </span>
          <ChevronDown size={14} className="text-text-secondary" />
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
      <label className="-my-1 flex min-h-11 items-center gap-2.5 text-base text-text-secondary">
        <input
          type="checkbox"
          checked={values.is_daily}
          onChange={(e) => set('is_daily', e.target.checked)}
          className="h-[18px] w-[18px] shrink-0 accent-accent"
        />
        Ежедневная — всегда в списке дня
      </label>

      {!onFieldChange && (
        <button
          type="submit"
          className="mt-1 h-11 w-full rounded-sm text-base font-semibold lg:w-auto lg:self-start lg:px-8"
          style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
        >
          {submitLabel}
        </button>
      )}
    </form>
  )
}
