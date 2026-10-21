import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TileCanvas, TileFacts } from '../components/DayTile'
import { drawDayTile, prepCanvas, tileDayTitle, tilePalette, useThemeVersion } from '../lib/tileCanvas'
import { ArrowLeft, ChevronLeft, ChevronRight } from '../components/Icon'
import { Segmented } from '../components/ui'
import { WorkspaceTag } from '../components/Workspaces'
import { monthRecords, tileNumber, useDayTiles, type DayTile } from '../lib/dayTile'
import { addDays, toDateString, todayStr } from '../lib/period'
import { UpgradeNote, useGate } from '../components/Upgrade'
import { formatHoursRu } from '../lib/time'

type View = 'month' | 'year'

const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']
/** понедельник — 0 */
const dow = (day: string) => (new Date(`${day}T00:00:00`).getDay() + 6) % 7

/** ширина элемента — чтобы клетки календаря делили её поровну */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/**
 * Мозаика: плитки дней месяцем (календарь) или годом (сетка по неделям, как полотно).
 * Нажатие на день — его разбор. Пространство — активное, как и всё остальное.
 */
export function Mosaic() {
  const navigate = useNavigate()
  const today = todayStr()
  const [view, setView] = useState<View>('month')
  const [month, setMonth] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState(today)
  const year = month.slice(0, 4)
  const { tiles, loading } = useDayTiles(`${year}-01-01`, `${year}-12-31`, today)
  const records = useMemo(() => monthRecords(tiles, today), [tiles, today])

  const shiftMonth = (n: number) => {
    const [y, m] = month.split('-').map(Number)
    const next = toDateString(new Date(y, m - 1 + n, 1)).slice(0, 7)
    if (next > today.slice(0, 7)) return
    setMonth(next)
  }
  const shiftYear = (n: number) => {
    const y = Number(year) + n
    if (String(y) > today.slice(0, 4)) return
    setMonth(String(y) === today.slice(0, 4) ? today.slice(0, 7) : `${y}-12`)
  }

  const worked = [...tiles.values()].filter((t) => t.total > 0)
  const yearHours = worked.reduce((s, t) => s + t.total, 0) / 60
  const selTile = tiles.get(selected)

  const yearLocked = useGate().plan?.limits.mosaic === 'month'

  return (
    <div className="safe-top-page page page-wide mx-auto flex max-w-lg flex-col gap-4 overflow-x-clip px-5 pt-3.5 pb-8">
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}
          className="-ml-0.5 flex h-11 items-center gap-1.5 self-start text-md text-text-secondary"
        >
          <ArrowLeft size={16} />
          Назад
        </button>
        <WorkspaceTag className="mb-1 self-start" />
        <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">Мозаика</h1>
        <p className="text-sm text-text-secondary">
          Плитка — день учёта. Цвет — клиент, площадь — часы, крупное пятно — длинный заход. Недобор до нормы остаётся пустым.
        </p>
      </div>

      <Segmented<View>
        stretch
        className="lg:w-72"
        value={view}
        onChange={setView}
        options={[
          { value: 'month', label: 'Месяц' },
          { value: 'year', label: 'Год' },
        ]}
      />

      {/* мозаика года — с «Плюса»; на «Старте» вместо полотна подсказка */}
      {view === 'year' && yearLocked ? (
        <UpgradeNote need="plus" what="Мозаика за год" />
      ) : (
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-8">
        <section className="flex min-w-0 flex-col gap-3 rounded-md bg-surface p-4">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              aria-label={view === 'month' ? 'Предыдущий месяц' : 'Предыдущий год'}
              onClick={() => (view === 'month' ? shiftMonth(-1) : shiftYear(-1))}
              className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface-sunken"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex flex-col items-center">
              <span className="font-medium text-text">
                {view === 'month' ? `${MONTHS[Number(month.slice(5)) - 1]} ${year}` : `${year} год`}
              </span>
              {view === 'year' && (
                <span className="tabular font-mono text-sm text-text-secondary">
                  {worked.length} {worked.length % 10 === 1 && worked.length % 100 !== 11 ? 'плитка' : 'плиток'} · {formatHoursRu(yearHours)} ч
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label={view === 'month' ? 'Следующий месяц' : 'Следующий год'}
              disabled={view === 'month' ? month >= today.slice(0, 7) : year >= today.slice(0, 4)}
              onClick={() => (view === 'month' ? shiftMonth(1) : shiftYear(1))}
              className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-surface-sunken disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {loading ? (
            <div className="h-64 animate-pulse rounded-sm bg-surface-sunken" />
          ) : view === 'month' ? (
            <MonthGrid month={month} today={today} tiles={tiles} records={records} selected={selected} onSelect={setSelected} />
          ) : (
            <YearGrid year={year} today={today} tiles={tiles} records={records} selected={selected} onSelect={setSelected} />
          )}
        </section>

        <aside className="flex flex-col gap-4 rounded-md bg-surface p-4 lg:sticky lg:top-6" aria-live="polite">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium text-text">{tileDayTitle(selected)}</span>
            {selTile && selTile.total > 0 && <span className="tabular font-mono text-sm text-text-secondary">№ {tileNumber(tiles, selected)}</span>}
          </div>
          {selTile ? (
            <>
              <TileCanvas tile={selTile} size={200} record={records.has(selected)} className="self-center" />
              <TileFacts tile={selTile} record={records.has(selected)} />
            </>
          ) : (
            <p className="text-base text-text-secondary">Этот день ещё не наступил.</p>
          )}
        </aside>
      </div>
      )}
    </div>
  )
}

interface GridProps {
  today: string
  tiles: Map<string, DayTile>
  records: Set<string>
  selected: string
  onSelect: (day: string) => void
}

function MonthGrid({ month, today, tiles, records, selected, onSelect }: GridProps & { month: string }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const gap = 8
  const cell = width ? Math.min(64, Math.floor((width - gap * 6) / 7)) : 0
  const first = `${month}-01`
  const days: string[] = []
  for (let d = first; d.slice(0, 7) === month; d = addDays(d, 1)) days.push(d)
  return (
    <div ref={ref} className="grid grid-cols-7 gap-2">
      {WEEKDAYS.map((w) => (
        <span key={w} className="text-center text-xs text-text-tertiary">
          {w}
        </span>
      ))}
      {Array.from({ length: dow(first) }, (_, i) => (
        <span key={`e${i}`} />
      ))}
      {days.map((d) => {
        const future = d > today
        const active = d === selected
        return (
          <button
            key={d}
            type="button"
            disabled={future}
            aria-pressed={active}
            aria-label={tileDayTitle(d)}
            onClick={() => onSelect(d)}
            className={`flex flex-col items-center gap-1 rounded-sm font-mono text-xs disabled:opacity-40 ${active ? 'font-semibold text-accent-text' : 'text-text-secondary'}`}
          >
            {cell > 0 && (
              <span className={`rounded-sm ${active ? 'outline-2 outline-offset-2 outline-accent' : ''}`}>
                <TileCanvas tile={future ? undefined : tiles.get(d)} size={cell} record={records.has(d)} />
              </span>
            )}
            {Number(d.slice(8))}
          </button>
        )
      })}
    </div>
  )
}

const Y = { cell: 13, gap: 3, top: 18, left: 22 }

/** Год одним холстом: столбец — неделя, строка — день недели. Нажатие выбирает день. */
function YearGrid({ year, today, tiles, records, selected, onSelect }: GridProps & { year: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const theme = useThemeVersion()
  const first = `${year}-01-01`
  const offset = dow(first)
  const days = useMemo(() => {
    const list: string[] = []
    for (let d = first; d.slice(0, 4) === year; d = addDays(d, 1)) list.push(d)
    return list
  }, [first, year])
  const weeks = Math.ceil((days.length + offset) / 7)
  const W = Y.left + weeks * (Y.cell + Y.gap)
  const H = Y.top + 7 * (Y.cell + Y.gap)

  useLayoutEffect(() => {
    if (!canvas.current) return
    const ctx = prepCanvas(canvas.current, W, H)
    const p = tilePalette()
    const cs = getComputedStyle(document.documentElement)
    ctx.font = `11px ${cs.getPropertyValue('--font-mono')}`
    ctx.fillStyle = cs.getPropertyValue('--text-tertiary')
    ctx.textBaseline = 'top'
    ;['пн', '', 'ср', '', 'пт', '', 'вс'].forEach((t, i) => t && ctx.fillText(t, 0, Y.top + i * (Y.cell + Y.gap) + 1))
    days.forEach((d, i) => {
      const idx = i + offset
      const x = Y.left + Math.floor(idx / 7) * (Y.cell + Y.gap)
      const y = Y.top + (idx % 7) * (Y.cell + Y.gap)
      if (d.slice(8) === '01') {
        ctx.fillStyle = cs.getPropertyValue('--text-tertiary')
        ctx.fillText(MONTHS_SHORT[Number(d.slice(5, 7)) - 1], x, 0)
      }
      if (d > today) {
        ctx.fillStyle = p.sunken
        ctx.globalAlpha = 0.5
        ctx.fillRect(x, y, Y.cell, Y.cell)
        ctx.globalAlpha = 1
        return
      }
      drawDayTile(ctx, p, tiles.get(d), x, y, Y.cell)
      if (records.has(d) || d === selected) {
        ctx.save()
        ctx.beginPath()
        ctx.roundRect(x - 1.5, y - 1.5, Y.cell + 3, Y.cell + 3, 3)
        ctx.strokeStyle = d === selected ? p.accent : cs.getPropertyValue('--text-tertiary')
        ctx.lineWidth = d === selected ? 1.5 : 1
        ctx.stroke()
        ctx.restore()
      }
    })
  }, [days, offset, tiles, records, selected, today, W, H, theme])

  // текущий год открывается на последних неделях
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth
  }, [year])

  return (
    <div ref={scroller} className="-mx-1 overflow-x-auto px-1 pb-1">
      <canvas
        ref={canvas}
        style={{ width: W, height: H }}
        className="block cursor-pointer"
        role="img"
        aria-label={`Мозаика ${year} года: плитки дней по неделям`}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const wk = Math.floor((e.clientX - rect.left - Y.left) / (Y.cell + Y.gap))
          const r = Math.floor((e.clientY - rect.top - Y.top) / (Y.cell + Y.gap))
          const d = days[wk * 7 + r - offset]
          if (wk >= 0 && r >= 0 && r < 7 && d && d <= today) onSelect(d)
        }}
      />
    </div>
  )
}
