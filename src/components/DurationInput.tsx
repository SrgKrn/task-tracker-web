import { FieldLabel } from './ui'
import { formatHoursMinutes } from '../lib/time'

/** Черновик длительности: поля хранят то, что набрано, — число считается из них. */
export interface DurationDraft {
  h: string
  m: string
}

export function draftFromMinutes(total: number): DurationDraft {
  const minutes = Math.max(0, Math.round(total))
  return { h: String(Math.floor(minutes / 60)), m: String(minutes % 60) }
}

/** Минуты из черновика; null — набрано не число. */
export function draftMinutes(d: DurationDraft): number | null {
  if (d.h.trim() === '' || d.m.trim() === '') return null
  const h = Number(d.h)
  const m = Number(d.m)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return Math.max(0, Math.floor(h)) * 60 + Math.min(59, Math.max(0, Math.floor(m)))
}

const PRESETS = [15, 30, 45, 60, 90, 120]

/**
 * Часы и минуты двумя полями плюс частые значения. Шагами ±15 минут набирать что-то
 * вроде «3 ч 40 мин» — двенадцать нажатий, поэтому значение вводится, а не листается.
 */
export function DurationInput({
  value,
  onChange,
  autoFocus = false,
}: {
  value: DurationDraft
  onChange: (value: DurationDraft) => void
  autoFocus?: boolean
}) {
  const fieldStyle = { background: 'var(--s-input)', border: '1px solid var(--s-border-strong)' }
  return (
    <>
      <div className="flex items-end gap-2.5">
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <FieldLabel>Часы</FieldLabel>
          <input
            autoFocus={autoFocus}
            type="number"
            inputMode="numeric"
            min="0"
            value={value.h}
            onChange={(e) => onChange({ ...value, h: e.target.value })}
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
            value={value.m}
            onChange={(e) => onChange({ ...value, m: e.target.value })}
            onFocus={(e) => e.currentTarget.select()}
            className="tabular h-[52px] rounded-[14px] px-3.5 text-center font-mono text-xl text-slate-100"
            style={fieldStyle}
          />
        </label>
      </div>

      {/* частые значения: набрать «45 мин» одним касанием быстрее, чем печатать */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(draftFromMinutes(preset))}
            className="min-h-9 rounded-[9px] px-3 text-xs text-slate-300"
            style={{ border: '1px solid var(--s-border-strong-2)' }}
          >
            {formatHoursMinutes(preset / 60)}
          </button>
        ))}
      </div>
    </>
  )
}

/** Комментарий к правке — ляжет в историю задачи рядом с ней. */
export function AdjustmentNote({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <FieldLabel>Комментарий</FieldLabel>
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Почему правка: забыл включить таймер, созвон без учёта…"
        className="resize-none rounded-[14px] px-3.5 py-2.5 text-sm leading-[1.45] text-slate-100 placeholder:text-[var(--s-placeholder)]"
        style={{ background: 'var(--s-input)', border: '1px solid var(--s-border-strong)' }}
      />
    </label>
  )
}
