import { useEffect, useMemo, useRef, useState } from 'react'
import { toDateString, todayStr } from '../lib/period'

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
  /** компактная высота для строк фильтров (34px вместо 40px) */
  small?: boolean
  className?: string
  ariaLabel?: string
}

function formatDisplay(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`
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

  const height = small ? 'h-[34px]' : 'h-10'
  const text = small ? 'text-[12.5px]' : 'text-[13.5px]'

  function shiftMonth(delta: number) {
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1))
  }

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={ariaLabel}
        className={`${height} ${text} flex w-full items-center justify-between gap-2 rounded-xl px-3 text-left font-mono`}
        style={{
          background: 'var(--s-surface)',
          border: `1px solid ${open ? 'var(--s-accent)' : 'var(--s-border)'}`,
          color: value ? 'var(--color-slate-100)' : '#6e6e77',
        }}
      >
        <span className="truncate">{value ? formatDisplay(value) : placeholder}</span>
        <span className="shrink-0 text-[11px] text-slate-600">▾</span>
      </button>

      {open && (
        <div
          className="absolute left-0 z-50 mt-1.5 w-[252px] rounded-2xl p-3"
          style={{
            background: 'var(--s-surface-2)',
            border: '1px solid var(--s-border-strong)',
            boxShadow: '0 18px 40px -12px rgba(0,0,0,.7)',
          }}
        >
          <div className="mb-2.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="h-7 w-7 rounded-lg text-[13px] text-slate-400"
              style={{ border: '1px solid var(--s-border)' }}
              aria-label="Предыдущий месяц"
            >
              ‹
            </button>
            <span className="text-[13px] font-medium text-slate-100">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="h-7 w-7 rounded-lg text-[13px] text-slate-400"
              style={{ border: '1px solid var(--s-border)' }}
              aria-label="Следующий месяц"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((d) => (
              <span key={d} className="text-center font-mono text-[9.5px] uppercase text-slate-600">
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
                  className="tabular flex h-8 items-center justify-center rounded-lg font-mono text-[12px]"
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
              className="mt-2.5 flex-1 rounded-lg py-1.5 text-[12px] text-slate-300"
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
              className="mt-2.5 flex-1 rounded-lg py-1.5 text-[12px] text-slate-500"
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
