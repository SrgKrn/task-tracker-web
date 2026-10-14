import { useEffect, useMemo, useRef, useState } from 'react'
import { formatDueDate, toDateString, todayStr } from '../lib/period'
import { ChevronDown, ChevronLeft, ChevronRight } from './Icon'

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
]

interface DatePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  /** компактная высота для строк фильтров */
  small?: boolean
  /** строка списка свойств: без рамки, значение справа, календарь открывается к правому краю */
  row?: boolean
  className?: string
  ariaLabel?: string
}

/** «Сегодня», «Завтра», «20 сент» — вместо «20.09.26» */
function formatDisplay(iso: string): string {
  return formatDueDate(iso)
}

/** дни календарной сетки месяца, начиная с понедельника */
function monthGrid(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7 // вс=0 → 6, пн=1 → 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = Array(lead).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateString(new Date(year, month, d)))
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/**
 * Календарь в стиле приложения вместо нативного `<input type="date">`:
 * тот на iOS открывает системное колесо, инородное рядом с графитом и латунью.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = 'не задан',
  small = false,
  row = false,
  className = '',
  ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(() => (value ? new Date(value) : new Date()))
  const wrapRef = useRef<HTMLDivElement>(null)
  const today = todayStr()

  useEffect(() => {
    if (open && value) setCursor(new Date(value))
  }, [open, value])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const cells = useMemo(() => monthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor])

  const height = small ? 'h-9' : 'h-[var(--tap)]'
  const text = small ? 'text-sm' : 'text-base'
  const trigger = row
    ? `min-h-12 justify-end gap-1.5 text-base ${value ? 'text-text' : 'text-text-tertiary'}`
    : `${height} ${text} justify-between gap-2 rounded-sm border bg-surface px-2.5 ${
        open ? 'border-accent' : 'border-border hover:border-border-strong'
      } ${value ? 'text-text' : 'text-text-tertiary'}`

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  }

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        className={`flex w-full items-center text-left ${trigger}`}
      >
        <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
        <ChevronDown size={14} className="shrink-0 text-text-tertiary" />
      </button>

      {open && (
        <div
          className={`absolute z-50 mt-1.5 w-[252px] rounded-lg border border-border bg-surface p-3 shadow-popover ${
            row ? 'right-0' : 'left-0'
          }`}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="hit-44 h-8 w-8 rounded-sm text-base text-text-secondary"
              style={{ border: '1px solid var(--s-border)' }}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft size={16} className="mx-auto" />
            </button>
            <span className="text-base font-medium text-text">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="hit-44 h-8 w-8 rounded-sm text-base text-text-secondary"
              style={{ border: '1px solid var(--s-border)' }}
              aria-label="Следующий месяц"
            >
              <ChevronRight size={16} className="mx-auto" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d) => (
              <span key={d} className="text-center text-xs text-text-secondary">
                {d}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((iso, i) => {
              if (!iso) return <span key={`pad-${i}`} />
              const selected = iso === value
              const isToday = iso === today
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => {
                    onChange(iso)
                    setOpen(false)
                  }}
                  className="tabular flex h-9 items-center justify-center rounded-sm font-mono text-sm"
                  style={{
                    background: selected ? 'var(--s-accent)' : 'transparent',
                    color: selected
                      ? 'var(--s-on-accent)'
                      : isToday
                        ? 'var(--s-accent)'
                        : 'var(--color-slate-300)',
                    fontWeight: selected || isToday ? 600 : 400,
                  }}
                >
                  {Number(iso.slice(8, 10))}
                </button>
              )
            })}
          </div>

          <div className="mt-2.5 flex gap-2" style={{ borderTop: '1px solid var(--s-hairline)' }}>
            <button
              type="button"
              onClick={() => {
                onChange(today)
                setOpen(false)
              }}
              className="mt-2.5 flex-1 rounded-sm py-1.5 text-sm text-slate-300"
              style={{ border: '1px solid var(--s-border)' }}
            >
              Сегодня
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
              className="mt-2.5 flex-1 rounded-sm py-1.5 text-sm text-slate-500"
              style={{ border: '1px solid var(--s-border)' }}
            >
              Очистить
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
