import { useEffect, useMemo, useState } from 'react'
import { AdjustmentNote, DurationInput, draftFromMinutes, draftMinutes, type DurationDraft } from './DurationInput'
import { Sheet } from './ui'
import { entryMinutes, formatHoursMinutes } from '../lib/time'
import type { ActiveTimer, TimeEntry } from '../lib/types'

export type SubtractSource =
  | { kind: 'separate' }
  /** из последней записи задачи: сессии таймера или ручной правки */
  | { kind: 'session'; entry: TimeEntry }
  | { kind: 'running'; timer: ActiveTimer }

interface SubtractSheetProps {
  open: boolean
  /** сколько отнять, минуты — с этим значением окно открывается */
  minutes: number
  /** факт задачи в часах: больше него отнять нельзя */
  factHours: number
  /** записи задачи: из них берётся последняя — сессия таймера или ручная правка */
  entries: TimeEntry[]
  /** идёт ли сейчас учёт по этой задаче */
  activeTimer: ActiveTimer | null | undefined
  /** день, в который ляжет отдельная правка — как в поле «Засчитать в день» */
  adjustDateLabel: string
  onCancel: () => void
  /** note — комментарий к правке, ляжет в историю задачи */
  onConfirm: (minutes: number, source: SubtractSource, note: string) => void
}

function clock(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function dayShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
}

/**
 * Время отнимают по двум причинам. Ошиблись в итоге — нужна отдельная правка. Забыли
 * остановить таймер — честнее укоротить саму сессию: тогда минуты уходят из того дня,
 * когда таймер шёл, и в отчёте не появляется день «в минусе».
 */
export function SubtractSheet({
  open,
  minutes: initial,
  factHours,
  entries,
  activeTimer,
  adjustDateLabel,
  onCancel,
  onConfirm,
}: SubtractSheetProps) {
  const [draft, setDraft] = useState<DurationDraft>(() => draftFromMinutes(initial))
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setDraft(draftFromMinutes(initial))
    setNote('')
  }, [open, initial])

  // сколько отнять — вводится, а не листается по 15 минут
  const minutes = draftMinutes(draft) ?? 0

  /*
   * Последняя запись задачи — какая бы ни была: сессия таймера или ручная правка. Часто
   * нужно поправить именно её: «добавил лишние полчаса» или «таймер шёл дольше, чем работал».
   */
  const lastEntry = useMemo(
    () => [...entries].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null,
    [entries],
  )
  const lastIsSession = lastEntry?.entry_type === 'timer'

  const runningMinutes = activeTimer
    ? Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 60_000)
    : 0
  const maxMinutes = Math.round(factHours * 60) + runningMinutes
  const tooMuch = minutes > maxMinutes
  const nothing = minutes <= 0

  // сессию короче нуля не сделать; ручную правку можно увести и в минус — это тоже правка
  const lastFits = !!lastEntry && (!lastIsSession || entryMinutes(lastEntry) >= minutes)
  const runningFits = !!activeTimer && runningMinutes >= minutes
  const shiftedStart = activeTimer
    ? new Date(new Date(activeTimer.started_at).getTime() + minutes * 60_000).toISOString()
    : null

  return (
    <Sheet open={open} onClose={onCancel} title="Отнять время">
      <DurationInput autoFocus value={draft} onChange={setDraft} />
      <AdjustmentNote value={note} onChange={setNote} />
      {(nothing || tooMuch) && (
        <span className="font-mono text-2xs text-terra-400">
          {nothing ? 'укажите, сколько отнять' : `больше, чем записано: всего ${formatHoursMinutes(maxMinutes / 60)}`}
        </span>
      )}

      <div className="flex flex-col gap-2">
        <Choice
          title="Отдельной правкой"
          detail={`запись −${formatHoursMinutes(minutes / 60)} за ${adjustDateLabel}`}
          disabled={nothing || tooMuch}
          onClick={() => onConfirm(minutes, { kind: 'separate' }, note.trim())}
        />

        {activeTimer ? (
          <Choice
            title="Из идущей сессии"
            detail={
              runningFits
                ? `идёт с ${clock(activeTimer.started_at)} — начало сдвинется на ${clock(shiftedStart)}`
                : `идёт всего ${formatHoursMinutes(runningMinutes / 60)} — отнять столько не выйдет`
            }
            disabled={!runningFits || nothing}
            onClick={() => onConfirm(minutes, { kind: 'running', timer: activeTimer }, note.trim())}
          />
        ) : null}

        {lastEntry && (
          <Choice
            title="Из последней записи"
            detail={lastEntryDetail(lastEntry, minutes, lastFits)}
            disabled={!lastFits || nothing}
            onClick={() => onConfirm(minutes, { kind: 'session', entry: lastEntry }, note.trim())}
          />
        )}
      </div>

      <button
        type="button"
        onClick={onCancel}
        className="h-12 rounded-[15px] text-sm font-medium text-slate-300"
        style={{ border: '1px solid var(--s-border-strong-2)' }}
      >
        Отмена
      </button>
    </Sheet>
  )
}

/** «сессия 9 окт, 14:40–15:18: 38 мин → 23 мин» или «правка за 9 окт: +2 ч → +1 ч 45 мин» */
function lastEntryDetail(entry: TimeEntry, minutes: number, fits: boolean): string {
  const before = entryMinutes(entry)
  const after = before - minutes
  const signed = (m: number) => `${m < 0 ? '−' : '+'}${formatHoursMinutes(Math.abs(m) / 60)}`
  if (entry.entry_type === 'timer') {
    const what = `сессия ${dayShort(entry.effective_date)}, ${clock(entry.started_at)}–${clock(entry.ended_at)}`
    return fits
      ? `${what}: ${formatHoursMinutes(before / 60)} → ${formatHoursMinutes(after / 60)}`
      : `${what} длилась ${formatHoursMinutes(before / 60)} — меньше, чем нужно отнять`
  }
  return `правка за ${dayShort(entry.effective_date)}: ${signed(before)} → ${signed(after)}`
}

function Choice({
  title,
  detail,
  disabled = false,
  onClick,
}: {
  title: string
  detail: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-[60px] flex-col justify-center gap-0.5 rounded-[14px] px-3.5 py-2.5 text-left disabled:opacity-45"
      style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border-strong)' }}
    >
      <span className="text-sm font-medium text-slate-100">{title}</span>
      <span className="font-mono text-2xs leading-[1.45] text-slate-500">{detail}</span>
    </button>
  )
}
