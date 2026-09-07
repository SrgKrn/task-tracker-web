import { useEffect, useState } from 'react'
import { DatePicker } from './DatePicker'
import { FieldLabel, Sheet, SheetActions } from './ui'
import type { Task } from '../lib/types'

export interface DuplicateOverrides {
  name: string
  start_date: string | null
  end_date: string | null
}

/**
 * Копия почти никогда не нужна с тем же названием и теми же сроками — раньше она
 * создавалась молча как «… (копия)» с датами оригинала, и всё это приходилось
 * править уже в карточке. Спрашиваем сразу.
 */
export function DuplicateTaskSheet({
  open,
  task,
  onCancel,
  onSubmit,
}: {
  open: boolean
  task: Task | null
  onCancel: () => void
  onSubmit: (values: DuplicateOverrides) => void
}) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !task) return
    setName(`${task.name} (копия)`)
    setStartDate(task.start_date)
    setEndDate(task.end_date)
  }, [open, task])

  if (!task) return null

  return (
    <Sheet open={open} onClose={onCancel} title="Дублировать задачу">
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Название</FieldLabel>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          placeholder="Что нужно сделать"
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

      <p className="text-2xs leading-[1.5] text-slate-600">
        Проект, раздел, статус и план часов копируются. Факт и история трекинга — нет.
      </p>

      <SheetActions
        onCancel={onCancel}
        onConfirm={() => onSubmit({ name: name.trim(), start_date: startDate, end_date: endDate })}
        confirmDisabled={!name.trim()}
        confirmLabel="Создать копию"
      />
    </Sheet>
  )
}
