import { useEffect, useState } from 'react'
import { FieldLabel, Sheet, SheetActions } from './ui'
import { formatHoursMinutes } from '../lib/time'

interface DurationSheetProps {
  open: boolean
  title: string
  /** исходное значение в часах */
  hours: number
  onCancel: () => void
  onSubmit: (hours: number) => void
}

/**
 * Ввод длительности часами и минутами. Шагами ±15 минут набирать что-то вроде
 * «3 ч 40 мин» — двенадцать нажатий, поэтому значение должно открываться на ввод.
 */
export function DurationSheet({ open, title, hours, onCancel, onSubmit }: DurationSheetProps) {
  const [h, setH] = useState('0')
  const [m, setM] = useState('0')

  useEffect(() => {
    if (!open) return
    const totalMinutes = Math.max(0, Math.round(hours * 60))
    setH(String(Math.floor(totalMinutes / 60)))
    setM(String(totalMinutes % 60))
  }, [open, hours])

  const hoursNum = Math.max(0, Math.floor(Number(h) || 0))
  const minutesNum = Math.min(59, Math.max(0, Math.floor(Number(m) || 0)))
  const valid = h.trim() !== '' && m.trim() !== '' && Number.isFinite(Number(h)) && Number.isFinite(Number(m))

  const fieldStyle = { background: '#0f0f13', border: '1px solid var(--s-border-strong)' }

  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      <div className="flex items-end gap-2.5">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Часы</FieldLabel>
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            min="0"
            value={h}
            onChange={(e) => setH(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="tabular h-[52px] rounded-[14px] px-3.5 text-center font-mono text-xl text-slate-100"
            style={fieldStyle}
          />
        </label>
        <span className="pb-4 font-mono text-lg text-slate-600">:</span>
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Минуты</FieldLabel>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="59"
            value={m}
            onChange={(e) => setM(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            className="tabular h-[52px] rounded-[14px] px-3.5 text-center font-mono text-xl text-slate-100"
            style={fieldStyle}
          />
        </label>
      </div>

      {/* частые значения: набрать «45 мин» одним касанием быстрее, чем печатать */}
      <div className="flex flex-wrap gap-2">
        {[15, 30, 45, 60, 90, 120].map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => {
              setH(String(Math.floor(preset / 60)))
              setM(String(preset % 60))
            }}
            className="min-h-9 rounded-[9px] px-3 text-xs text-slate-300"
            style={{ border: '1px solid var(--s-border-strong-2)' }}
          >
            {formatHoursMinutes(preset / 60)}
          </button>
        ))}
      </div>

      <SheetActions
        onCancel={onCancel}
        onConfirm={() => onSubmit(hoursNum + minutesNum / 60)}
        confirmDisabled={!valid}
        confirmLabel="Сохранить"
      />
    </Sheet>
  )
}
