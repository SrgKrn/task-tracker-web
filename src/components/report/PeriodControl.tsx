import { useState, type ReactNode } from 'react'
import { Calendar, Check, ChevronLeft, ChevronRight } from '../Icon'
import { Button, Chip, Sheet, fieldClass } from '../ui'
import {
  PRESETS,
  QUICK_PRESETS,
  activePreset,
  customPeriod,
  periodTitle,
  presetPeriod,
  shiftPeriod,
  type ReportPeriod,
} from '../../lib/reportPeriod'

/**
 * Период отчёта: стрелки листают на единицу периода (месяц — месяцами, неделя — неделями),
 * название открывает список готовых периодов и свои даты, чипы рядом — самые частые.
 */
export function PeriodControl({
  period,
  onChange,
  today,
  tip,
  compact = false,
  trailing,
}: {
  period: ReportPeriod
  onChange: (p: ReportPeriod) => void
  today: string
  /** якорь подсказки (data-tip) */
  tip?: string
  /** телефон: одна строка без чипов — все готовые периоды открывает название */
  compact?: boolean
  /** справа от стрелок — например кнопка среза */
  trailing?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)
  const active = activePreset(period, today)

  function openPicker() {
    setFrom(period.from)
    setTo(period.to)
    setOpen(true)
  }

  const arrow =
    'inline-flex h-[var(--tap)] w-9 shrink-0 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text'

  return (
    <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-center lg:gap-3" data-tip={tip}>
      <div className="flex items-center gap-0.5">
        <button type="button" className={arrow} aria-label="Предыдущий период" onClick={() => onChange(shiftPeriod(period, -1))}>
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={openPicker}
          className="inline-flex h-[var(--tap)] min-w-0 flex-1 items-center justify-center gap-2 rounded-sm border border-border bg-surface px-3 text-base font-medium text-text hover:border-border-strong lg:min-w-48 lg:flex-none"
        >
          <Calendar size={15} />
          <span className="truncate">{periodTitle(period, today)}</span>
        </button>
        <button type="button" className={arrow} aria-label="Следующий период" onClick={() => onChange(shiftPeriod(period, 1))}>
          <ChevronRight size={18} />
        </button>
        {trailing}
      </div>
      {!compact && (
      <div className="sc -mx-5 flex gap-1.5 overflow-x-auto px-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
        {QUICK_PRESETS.map((key) => {
          const def = PRESETS.find((p) => p.key === key)!
          return (
            <Chip key={key} active={active === key} onClick={() => onChange(presetPeriod(key, today))}>
              {def.short}
            </Chip>
          )
        })}
      </div>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Период" anchored>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-x-2">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  onChange(presetPeriod(p.key, today))
                  setOpen(false)
                }}
                className={`flex min-h-9 items-center justify-between gap-2 rounded-sm px-2 text-left text-base hover:bg-surface-sunken ${
                  active === p.key ? 'font-medium text-accent-text' : 'text-text'
                }`}
              >
                {p.label}
                {active === p.key && <Check size={15} />}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-divider pt-3">
            <span className="text-sm font-medium text-text-secondary">Свои даты</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="Начало периода"
                className={fieldClass}
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
              <span className="text-text-secondary">—</span>
              <input
                type="date"
                aria-label="Конец периода"
                className={fieldClass}
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <Button
              variant="primary"
              disabled={!from || !to}
              onClick={() => {
                onChange(customPeriod(from, to))
                setOpen(false)
              }}
            >
              Показать
            </Button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
