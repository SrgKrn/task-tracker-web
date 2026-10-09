import { useEffect, useMemo, useState } from 'react'
import { Sheet } from './ui'
import { formatHoursMinutes } from '../lib/time'
import type { ActiveTimer, TimeEntry } from '../lib/types'

export type SubtractSource =
  | { kind: 'separate' }
  | { kind: 'session'; entry: TimeEntry }
  | { kind: 'running'; timer: ActiveTimer }

interface SubtractSheetProps {
  open: boolean
  /** сколько отнять, минуты — с этим значением окно открывается */
  minutes: number
  /** факт задачи в часах: больше него отнять нельзя */
  factHours: number
  /** записи задачи: из них берётся последняя сессия таймера */
  entries: TimeEntry[]
  /** идёт ли сейчас учёт по этой задаче */
  activeTimer: ActiveTimer | null | undefined
  /** день, в который ляжет отдельная правка — как в поле «Засчитать в день» */
  adjustDateLabel: string
  onCancel: () => void
  onConfirm: (minutes: number, source: SubtractSource) => void
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
  const [minutes, setMinutes] = useState(initial)

  useEffect(() => {
    if (open) setMinutes(initial)
  }, [open, initial])

  const lastSession = useMemo(() => {
    const sessions = entries.filter((e) => e.entry_type === 'timer' && e.ended_at)
    return sessions.sort((a, b) => (b.ended_at ?? '').localeCompare(a.ended_at ?? ''))[0] ?? null
  }, [entries])

  const runningMinutes = activeTimer
    ? Math.floor((Date.now() - new Date(activeTimer.started_at).getTime()) / 60_000)
    : 0
  const maxMinutes = Math.max(15, Math.round(factHours * 60) + runningMinutes)
  const step = (delta: number) => setMinutes((m) => Math.min(maxMinutes, Math.max(15, m + delta)))

  const sessionFits = !!lastSession && lastSession.duration_minutes >= minutes
  const runningFits = !!activeTimer && runningMinutes >= minutes
  const shiftedStart = activeTimer
    ? new Date(new Date(activeTimer.started_at).getTime() + minutes * 60_000).toISOString()
    : null

  return (
    <Sheet open={open} onClose={onCancel} title="Отнять время">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-400">Сколько</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => step(-15)}
            aria-label="Меньше на 15 минут"
            className="hit-44 flex h-[34px] w-[34px] items-center justify-center rounded-full text-base text-slate-300"
            style={{ border: '1px solid var(--s-border-strong-2)' }}
          >
            −
          </button>
          <span className="tabular min-w-[96px] text-center font-mono text-lg font-semibold text-slate-100">
            {formatHoursMinutes(minutes / 60)}
          </span>
          <button
            type="button"
            onClick={() => step(15)}
            aria-label="Больше на 15 минут"
            className="hit-44 flex h-[34px] w-[34px] items-center justify-center rounded-full text-base text-slate-300"
            style={{ border: '1px solid var(--s-border-strong-2)' }}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Choice
          title="Отдельной правкой"
          detail={`запись −${formatHoursMinutes(minutes / 60)} за ${adjustDateLabel}`}
          onClick={() => onConfirm(minutes, { kind: 'separate' })}
        />

        {activeTimer ? (
          <Choice
            title="Из идущей сессии"
            detail={
              runningFits
                ? `идёт с ${clock(activeTimer.started_at)} — начало сдвинется на ${clock(shiftedStart)}`
                : `идёт всего ${formatHoursMinutes(runningMinutes / 60)} — отнять столько не выйдет`
            }
            disabled={!runningFits}
            onClick={() => onConfirm(minutes, { kind: 'running', timer: activeTimer })}
          />
        ) : lastSession ? (
          <Choice
            title="Из последней сессии таймера"
            detail={
              sessionFits
                ? `${dayShort(lastSession.effective_date)}, ${clock(lastSession.started_at)}–${clock(lastSession.ended_at)}: ${formatHoursMinutes(lastSession.duration_minutes / 60)} → ${formatHoursMinutes((lastSession.duration_minutes - minutes) / 60)}`
                : `${dayShort(lastSession.effective_date)}, ${clock(lastSession.started_at)}–${clock(lastSession.ended_at)} длилась ${formatHoursMinutes(lastSession.duration_minutes / 60)} — меньше, чем нужно отнять`
            }
            disabled={!sessionFits}
            onClick={() => lastSession && onConfirm(minutes, { kind: 'session', entry: lastSession })}
          />
        ) : null}
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
