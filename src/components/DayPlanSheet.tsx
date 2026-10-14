import { useMemo, useState } from 'react'
import { Check } from './Icon'
import { Sheet, SheetActions } from './ui'
import { tap } from '../lib/haptics'
import { planDiff, type PlanSection } from '../lib/dayPlan'
import type { Task } from '../lib/types'

interface DayPlanSheetProps {
  open: boolean
  onClose: () => void
  sections: PlanSection[]
  /** задачи, которые уже выбраны на сегодня */
  planned: ReadonlySet<string>
  today: string
  /** подпись под названием: спринт и группы */
  metaOf: (task: Task) => string
  onSave: (diff: { add: string[]; remove: string[] }) => void
}

/**
 * Монтировать при каждом открытии (`{open && <DayPlanSheet/>}`): выбор стартует с текущего плана.
 * Выбор задач на день: одно касание — одна отметка, сохранение кнопкой «В план». Лист
 * собран так, чтобы утренний выбор занимал секунды: сверху то, что вероятнее всего пойдёт
 * в работу, «выбрать предложенное» одним нажатием и поиск по остальным.
 */
export function DayPlanSheet({ open, onClose, sections, planned, today, metaOf, onSave }: DayPlanSheetProps) {
  // выбор живёт здесь, пока лист открыт; закрытие без сохранения ничего не меняет
  const [draft, setDraft] = useState<Set<string>>(() => new Set(planned))
  const [query, setQuery] = useState('')
  const [showRest, setShowRest] = useState(false)

  const q = query.trim().toLowerCase()
  const visible = useMemo(() => {
    return sections
      .map((s) => {
        if (q) {
          return { ...s, tasks: s.tasks.filter((t) => `${t.name} ${metaOf(t)}`.toLowerCase().includes(q)) }
        }
        // «Остальные» свёрнуты: их много, а на день обычно хватает первых секций и поиска
        if (s.key === 'rest' && !showRest) return { ...s, tasks: [] }
        return s
      })
      .filter((s) => s.tasks.length > 0 || (s.key === 'rest' && !q && !showRest))
  }, [sections, q, showRest, metaOf])

  const suggested = sections.filter((s) => s.key === 'carry' || s.key === 'due').flatMap((s) => s.tasks)
  const allSuggestedOn = suggested.length > 0 && suggested.every((t) => draft.has(t.id))
  const restCount = sections.find((s) => s.key === 'rest')?.tasks.length ?? 0

  function toggle(id: string) {
    tap()
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSuggested() {
    tap()
    setDraft((prev) => {
      const next = new Set(prev)
      for (const t of suggested) {
        if (allSuggestedOn) next.delete(t.id)
        else next.add(t.id)
      }
      return next
    })
  }

  const { add, remove } = planDiff(planned, draft)
  const changed = add.length > 0 || remove.length > 0

  return (
    <Sheet open={open} onClose={onClose} title="Что делаем сегодня?">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Найти задачу"
          className="h-10 min-w-0 flex-1 rounded-[12px] px-3 text-base text-slate-100 outline-none placeholder:text-[var(--s-placeholder)]"
          style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
        />
        {suggested.length > 0 && !q && (
          <button
            type="button"
            onClick={toggleSuggested}
            className="h-10 shrink-0 rounded-[12px] px-3 text-sm font-medium"
            style={{ background: 'var(--s-accent-ghost)', color: 'var(--s-accent-text)' }}
          >
            {allSuggestedOn ? 'Снять предложенное' : 'Всё предложенное'}
          </button>
        )}
      </div>

      <div className="-mx-2 flex max-h-[52vh] flex-col gap-3 overflow-y-auto px-2">
        {visible.length === 0 && (
          <p className="py-6 text-center text-base text-slate-500">{q ? 'Ничего не найдено' : 'Открытых задач нет'}</p>
        )}
        {visible.map((section) => (
          <div key={section.key} className="flex flex-col gap-1">
            <span className="px-1 text-sm font-medium text-text-secondary">{section.title}</span>
            {section.key === 'rest' && !q && !showRest ? (
              <button
                type="button"
                onClick={() => setShowRest(true)}
                className="h-11 rounded-[12px] text-left text-base text-brass-600"
              >
                Показать остальные · {restCount}
              </button>
            ) : (
              section.tasks.map((task) => (
                <PlanRow
                  key={task.id}
                  task={task}
                  today={today}
                  meta={metaOf(task)}
                  on={draft.has(task.id)}
                  onToggle={() => toggle(task.id)}
                />
              ))
            )}
          </div>
        ))}
      </div>

      <SheetActions
        onCancel={onClose}
        onConfirm={() => onSave({ add, remove })}
        confirmLabel={draft.size > 0 ? `В план · ${draft.size}` : 'Готово'}
        confirmDisabled={!changed}
      />
    </Sheet>
  )
}

function PlanRow({
  task,
  today,
  meta,
  on,
  onToggle,
}: {
  task: Task
  today: string
  meta: string
  on: boolean
  onToggle: () => void
}) {
  const overdue = !!task.end_date && task.end_date < today
  const dueLabel = task.end_date ? `${task.end_date.slice(8, 10)}.${task.end_date.slice(5, 7)}` : ''
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className="flex min-h-[54px] items-center gap-3 rounded-[14px] px-3 py-2 text-left"
      style={{
        background: on ? 'var(--s-accent-ghost)' : 'var(--s-surface)',
        border: `1px solid ${on ? 'var(--s-accent)' : 'var(--s-border)'}`,
      }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{
          background: on ? 'var(--s-accent)' : 'transparent',
          border: `1.5px solid ${on ? 'var(--s-accent)' : 'var(--s-border-strong-2)'}`,
          color: 'var(--s-on-accent)',
        }}
      >
        {on && <Check size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="text-base font-medium leading-[1.3] text-slate-100"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {task.name}
        </span>
        {meta && <span className="block truncate font-mono text-xs leading-[1.4] text-slate-500">{meta}</span>}
      </span>
      {dueLabel && (
        <span className={`shrink-0 font-mono text-xs ${overdue ? 'text-terra-400' : 'text-slate-500'}`}>
          {overdue ? `просрочено ${dueLabel}` : `до ${dueLabel}`}
        </span>
      )}
    </button>
  )
}
