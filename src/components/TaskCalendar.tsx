import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from './Icon'
import { Popover } from './Popover'
import { TASK_DRAG_TYPE } from './TaskBoard'
import { ClientDot } from './ui'
import type { GroupModel } from '../lib/groups'
import { todayStr } from '../lib/period'
import { calendarWeeks } from '../lib/taskView'
import type { ActiveTimer, Task } from '../lib/types'

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
/** сколько задач видно в дне; остальные — «ещё N» */
const PER_DAY = 3

/**
 * Календарь по сроку (0.64, компьютер): задача стоит в дне своего срока. Перетащили в другой
 * день — срок переносится, в колонку «Без срока» — срок снимается; в уведомлении «Вернуть».
 */
export function TaskCalendar({
  tasks,
  model,
  isDone,
  activeTimer,
  openId,
  onMoveDue,
}: {
  tasks: Task[]
  model: GroupModel
  isDone: (task: Task) => boolean
  activeTimer: ActiveTimer | null | undefined
  openId: string | undefined
  onMoveDue: (task: Task, date: string | null) => void
}) {
  const today = todayStr()
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [more, setMore] = useState<{ day: string; anchor: HTMLElement } | null>(null)

  const weeks = useMemo(() => calendarWeeks(month.y, month.m), [month])
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const t of tasks) if (t.end_date) map.set(t.end_date, [...(map.get(t.end_date) ?? []), t])
    return map
  }, [tasks])
  const undated = tasks.filter((t) => !t.end_date && !isDone(t))
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const dragging = dragId ? byId.get(dragId) : undefined
  const shift = (delta: number) => setMonth(({ y, m }) => ({ y: y + Math.floor((m + delta) / 12), m: (((m + delta) % 12) + 12) % 12 }))
  const thisMonth = `${month.y}-${String(month.m + 1).padStart(2, '0')}`

  /** ячейка или колонка, куда можно бросить: срок задачи — не этот же день */
  const zone = (key: string, date: string | null) => ({
    'data-drop-over': dragging && (dragging.end_date ?? null) !== date && over === key ? '' : undefined,
    onDragOver: (e: React.DragEvent) => {
      if (!dragging || (dragging.end_date ?? null) === date) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (over !== key) setOver(key)
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((o) => (o === key ? null : o))
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      const task = byId.get(e.dataTransfer.getData(TASK_DRAG_TYPE))
      setOver(null)
      setDragId(null)
      if (task && (task.end_date ?? null) !== date) onMoveDue(task, date)
    },
  })

  const chip = (task: Task) => (
    <CalendarChip
      key={task.id}
      task={task}
      color={model.colorOf(task)}
      label={model.listLabel(task)}
      done={isDone(task)}
      overdue={!isDone(task) && !!task.end_date && task.end_date < today}
      running={activeTimer?.task_id === task.id}
      open={openId === task.id}
      onDragStart={() => setDragId(task.id)}
      onDragEnd={() => {
        setDragId(null)
        setOver(null)
      }}
    />
  )

  return (
    <div className="flex items-start gap-3 pb-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 flex-1 text-lg font-semibold text-text">
            {MONTHS[month.m]} {month.y}
          </h2>
          <button
            type="button"
            onClick={() => setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })}
            disabled={today.startsWith(thisMonth)}
            className="h-8 rounded-sm border border-border px-2.5 text-sm font-medium text-text hover:bg-surface-hover disabled:opacity-50"
          >
            Сегодня
          </button>
          <button type="button" onClick={() => shift(-1)} aria-label="Предыдущий месяц" className="flex h-8 w-8 items-center justify-center rounded-sm border border-border text-text-secondary hover:bg-surface-hover hover:text-text">
            <ChevronLeft size={16} />
          </button>
          <button type="button" onClick={() => shift(1)} aria-label="Следующий месяц" className="flex h-8 w-8 items-center justify-center rounded-sm border border-border text-text-secondary hover:bg-surface-hover hover:text-text">
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="overflow-hidden rounded-md border border-border" role="grid" aria-label={`${MONTHS[month.m]} ${month.y}`}>
          <div className="grid grid-cols-7 border-b border-divider bg-surface-sunken" role="row">
            {WEEKDAYS.map((d) => (
              <span key={d} role="columnheader" className="px-2 py-1.5 text-xs font-medium text-text-secondary">
                {d}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} className="grid grid-cols-7 border-b border-divider last:border-b-0" role="row">
              {week.map((day, i) => {
                const items = byDay.get(day) ?? []
                const outside = !day.startsWith(thisMonth)
                const isToday = day === today
                return (
                  <div
                    key={day}
                    role="gridcell"
                    aria-label={day}
                    className={`cal-day flex min-h-26 min-w-0 flex-col gap-0.5 p-1 ${i > 0 ? 'border-l border-divider' : ''} ${
                      outside ? 'bg-surface-sunken/60' : 'bg-surface'
                    } ${i >= 5 && !outside ? 'cal-weekend' : ''}`}
                    {...zone(day, day)}
                  >
                    <span
                      className={`tabular mb-0.5 flex h-5 min-w-5 items-center justify-center self-start rounded-full px-1 font-mono text-xs ${
                        isToday ? 'bg-accent font-semibold text-on-accent' : outside ? 'text-text-tertiary' : 'text-text-secondary'
                      }`}
                    >
                      {Number(day.slice(8, 10))}
                    </span>
                    {items.slice(0, items.length > PER_DAY + 1 ? PER_DAY : PER_DAY + 1).map(chip)}
                    {items.length > PER_DAY + 1 && (
                      <button
                        type="button"
                        onClick={(e) => setMore({ day, anchor: e.currentTarget })}
                        className="self-start rounded-xs px-1.5 text-xs font-medium text-text-secondary hover:bg-surface-hover hover:text-text"
                      >
                        ещё {items.length - PER_DAY}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <aside
        className="sticky top-2 flex w-50 shrink-0 flex-col gap-1 rounded-md bg-surface-sunken p-2"
        aria-label="Без срока"
        {...zone('undated', null)}
      >
        <span className="flex items-center gap-2 px-1 pb-1">
          <span className="text-sm font-semibold text-text">Без срока</span>
          <span className="tabular font-mono text-xs text-text-secondary">{undated.length}</span>
        </span>
        {undated.map(chip)}
        {undated.length === 0 && <p className="px-1 py-2 text-xs text-text-tertiary">Сюда — снять срок</p>}
      </aside>

      {more && (
        <Popover anchor={more.anchor} label={`Задачи на ${more.day}`} onClose={() => setMore(null)} minWidth={240} maxWidth={300} className="flex flex-col gap-0.5 p-1.5">
          {(byDay.get(more.day) ?? []).map(chip)}
        </Popover>
      )}
    </div>
  )
}

function CalendarChip({
  task,
  color,
  label,
  done,
  overdue,
  running,
  open,
  onDragStart,
  onDragEnd,
}: {
  task: Task
  color: ReturnType<GroupModel['colorOf']>
  label: string
  done: boolean
  overdue: boolean
  running: boolean
  open: boolean
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const navigate = useNavigate()
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TASK_DRAG_TYPE, task.id)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={() => navigate(`/tasks/${task.id}`)}
      title={label ? `${task.name} · ${label}` : task.name}
      data-open={open || undefined}
      data-running={running || undefined}
      className={`cal-chip flex h-6 min-w-0 shrink-0 items-center gap-1.5 rounded-xs px-1.5 text-left text-xs ${
        done ? 'text-text-tertiary line-through' : overdue ? 'font-medium text-danger-text' : 'text-text'
      }`}
    >
      {color ? <ClientDot color={color} size={6} /> : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-border-strong" aria-hidden />}
      <span className="min-w-0 truncate">{task.name}</span>
    </button>
  )
}
