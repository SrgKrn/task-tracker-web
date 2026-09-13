import { useEffect, useMemo, useState } from 'react'
import { DatePicker } from './DatePicker'
import { DurationSheet } from './DurationSheet'
import { Check, ChevronDown } from './Icon'
import { FieldLabel, Sheet, SheetActions } from './ui'
import { formatHoursMinutes } from '../lib/time'
import { nextSprintDates, nextSprintName } from '../lib/tree'
import type { Status, Task } from '../lib/types'

export interface NextSprintValues {
  name: string
  planned_hours: number
  start_date: string | null
  end_date: string | null
  status_id: string | null
  carry: { name: string; planned_hours: number }[]
}

/**
 * «Спринт 6 → Спринт 7» одним действием. Раньше продолжение заводилось руками: дублировать,
 * переименовать, перебить оба срока, заново набрать то, что не успели. Здесь всё это
 * предзаполнено, а незакрытые подзадачи едут в новый спринт с остатком плана.
 */
export function NextSprintSheet({
  open,
  task,
  subtasks,
  statuses,
  onCancel,
  onSubmit,
}: {
  open: boolean
  task: Task
  subtasks: Task[]
  statuses: Status[]
  onCancel: () => void
  onSubmit: (values: NextSprintValues) => void
}) {
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])
  const unfinished = useMemo(
    () => subtasks.filter((t) => !(t.status_id && statusById.get(t.status_id)?.is_final)),
    [subtasks, statusById],
  )

  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)
  const [plan, setPlan] = useState(0)
  const [carryIds, setCarryIds] = useState<Set<string>>(new Set())
  const [editingPlan, setEditingPlan] = useState(false)

  // предзаполняем только при открытии: пересчёт на каждое обновление списка задач
  // стирал бы то, что пользователь уже поправил в листе
  useEffect(() => {
    if (!open) return
    const dates = nextSprintDates(task.start_date, task.end_date)
    setName(nextSprintName(task.name))
    setStartDate(dates.start_date)
    setEndDate(dates.end_date)
    setPlan(task.planned_hours)
    setCarryIds(new Set(unfinished.map((t) => t.id)))
    setEditingPlan(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /** что осталось сделать по подзадаче: план минус уже потраченное, но не меньше нуля */
  const remaining = (t: Task) => (t.planned_hours > 0 ? Math.max(0, t.planned_hours - t.fact_hours) : 0)

  function toggle(id: string) {
    setCarryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function submit() {
    // новый спринт начинает с первого нефинального статуса («0%»), а не наследует «100%» старого
    const initialStatus =
      [...statuses].sort((a, b) => a.sort_order - b.sort_order).find((s) => !s.is_final)?.id ?? null
    onSubmit({
      name: name.trim(),
      planned_hours: plan,
      start_date: startDate,
      end_date: endDate,
      status_id: initialStatus,
      carry: unfinished
        .filter((t) => carryIds.has(t.id))
        .map((t) => ({ name: t.name, planned_hours: Math.round(remaining(t) * 4) / 4 })),
    })
  }

  return (
    <Sheet open={open} onClose={onCancel} title="Следующий спринт">
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Название</FieldLabel>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название спринта"
          className="h-[46px] rounded-[14px] px-3.5 text-base text-slate-100 placeholder:text-[#83838c]"
          style={{ background: '#0f0f13', border: '1px solid var(--s-border-strong)' }}
        />
      </div>

      <div className="flex gap-[9px]">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Срок с</FieldLabel>
          <DatePicker value={startDate} onChange={setStartDate} ariaLabel="Срок с" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Срок до</FieldLabel>
          <DatePicker value={endDate} onChange={setEndDate} ariaLabel="Срок до" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel>План</FieldLabel>
        <button
          type="button"
          onClick={() => setEditingPlan(true)}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left"
          style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
        >
          <span className="tabular font-mono text-sm text-slate-100">
            {plan > 0 ? formatHoursMinutes(plan) : 'не задан'}
          </span>
          <ChevronDown size={14} className="text-slate-600" />
        </button>
      </div>

      {unfinished.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between">
            <FieldLabel>Перенести подзадачи</FieldLabel>
            <span className="tabular font-mono text-2xs text-slate-600">
              {carryIds.size} из {unfinished.length}
            </span>
          </span>
          <div className="sc -mx-1 flex max-h-[32vh] flex-col overflow-y-auto px-1">
            {unfinished.map((t) => {
              const checked = carryIds.has(t.id)
              const rest = remaining(t)
              return (
                <button
                  key={t.id}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => toggle(t.id)}
                  className="flex min-h-11 items-center gap-3 text-left"
                  style={{ borderBottom: '1px solid var(--s-hairline-3)' }}
                >
                  <span
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px]"
                    style={
                      checked
                        ? { background: 'var(--s-accent)', color: 'var(--s-on-accent)' }
                        : { border: '1.5px solid var(--s-border-strong-2)' }
                    }
                  >
                    {checked && <Check size={12} />}
                  </span>
                  <span className={`min-w-0 flex-1 truncate text-sm ${checked ? 'text-slate-100' : 'text-slate-500'}`}>
                    {t.name}
                  </span>
                  <span className="tabular shrink-0 font-mono text-2xs text-slate-500">
                    {t.planned_hours > 0 ? `остаток ${formatHoursMinutes(rest)}` : 'без плана'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-2xs leading-[1.5] text-slate-600">
        Часы, история и закрытые подзадачи остаются в «{task.name}».
      </p>

      <SheetActions
        onCancel={onCancel}
        onConfirm={submit}
        confirmDisabled={!name.trim()}
        confirmLabel="Создать спринт"
      />

      {/* внутри содержимого листа: клик по подложке этого окна не должен закрыть и лист спринта */}
      <DurationSheet
        open={editingPlan}
        title="План спринта"
        hours={plan}
        onCancel={() => setEditingPlan(false)}
        onSubmit={(value) => {
          setEditingPlan(false)
          setPlan(value)
        }}
      />
    </Sheet>
  )
}
