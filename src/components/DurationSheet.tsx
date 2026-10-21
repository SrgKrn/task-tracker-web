import { focusOnOpen } from '../lib/device'
import { useEffect, useState } from 'react'
import { AdjustmentNote, DurationInput, draftFromMinutes, draftMinutes, type DurationDraft } from './DurationInput'
import { Sheet, SheetActions } from './ui'
import { formatHoursMinutes } from '../lib/time'

interface DurationSheetProps {
  open: boolean
  title: string
  /** исходное значение в часах */
  hours: number
  onCancel: () => void
  onSubmit: (hours: number) => void
}

/** Ввод длительности часами и минутами: план задачи, точный факт. */
export function DurationSheet({ open, title, hours, onCancel, onSubmit }: DurationSheetProps) {
  const [draft, setDraft] = useState<DurationDraft>(() => draftFromMinutes(hours * 60))

  useEffect(() => {
    if (open) setDraft(draftFromMinutes(hours * 60))
  }, [open, hours])

  const minutes = draftMinutes(draft)

  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <DurationInput autoFocus={focusOnOpen} value={draft} onChange={setDraft} />
      <SheetActions
        onCancel={onCancel}
        onConfirm={() => minutes !== null && onSubmit(minutes / 60)}
        confirmDisabled={minutes === null}
        confirmLabel="Сохранить"
      />
    </Sheet>
  )
}

/**
 * «+» у факта: сколько добавить и почему. Раньше кнопка молча прибавляла ровно 15 минут —
 * час набирался четырьмя нажатиями, а объяснить правку можно было только потом, найдя её
 * в истории.
 */
export function AddTimeSheet({
  open,
  adjustDateLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean
  /** день, в который ляжет правка — как в поле «Засчитать в день» */
  adjustDateLabel: string
  onCancel: () => void
  onConfirm: (minutes: number, note: string) => void
}) {
  const [draft, setDraft] = useState<DurationDraft>(() => draftFromMinutes(15))
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(draftFromMinutes(15))
    setNote('')
  }, [open])

  const minutes = draftMinutes(draft)
  const valid = minutes !== null && minutes > 0

  return (
    <Sheet open={open} onClose={onCancel} title="Добавить время">
      <DurationInput autoFocus={focusOnOpen} value={draft} onChange={setDraft} />
      <AdjustmentNote value={note} onChange={setNote} />
      <span className="font-mono text-xs text-text-secondary">
        {valid ? `запись +${formatHoursMinutes(minutes / 60)} за ${adjustDateLabel}` : 'укажите, сколько добавить'}
      </span>
      <SheetActions
        onCancel={onCancel}
        onConfirm={() => valid && onConfirm(minutes, note.trim())}
        confirmDisabled={!valid}
        confirmLabel="Добавить"
      />
    </Sheet>
  )
}
