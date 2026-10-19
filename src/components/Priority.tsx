import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, ListGroup, Segmented, Sheet, fieldClass } from './ui'
import { Minus, Plus } from './Icon'
import { addDays, todayStr } from '../lib/period'
import {
  ABC_LETTERS,
  EFFORT_LABEL,
  EFFORT_ORDER,
  METHODS,
  QUADRANT,
  abcLabel,
  isAutoUrgent,
  nextAbcRank,
  quadrantOf,
  suggestEffort,
  ABC_TONE,
  QUADRANT_TONE,
  type MethodInfo,
} from '../lib/priority'
import { describeError, useToast } from '../lib/Toast'
import { useSetFrog, useUpdateTask, type TaskFieldsInput } from '../lib/queries/tasks'
import type { AbcLetter, Effort, PriorityMethod, Task } from '../lib/types'

const BADGE = 'inline-flex h-5 shrink-0 items-center rounded-xs px-1.5 text-xs font-medium whitespace-nowrap'

/**
 * Отметка методики в строке задачи: квадрант, «A-1», размер дня или «лягушка». Ничего —
 * если методика не выбрана или задача не отмечена: пустые значки в каждой строке шумят.
 */
export function PriorityBadge({ task, method, today }: { task: Task; method: PriorityMethod; today: string }) {
  if (method === 'eisenhower') {
    const q = quadrantOf(task, today)
    if (!q) return null
    return (
      <span className={`${BADGE} ${QUADRANT_TONE[q]}`} title={QUADRANT[q].hint}>
        {QUADRANT[q].short}
      </span>
    )
  }
  if (method === 'abcde') {
    const label = abcLabel(task)
    if (!label || !task.abc_letter) return null
    return (
      <span className={`${BADGE} font-mono ${ABC_TONE[task.abc_letter]}`}>
        {label}
        {task.abc_letter === 'D' && task.delegated_to ? ` → ${task.delegated_to}` : ''}
      </span>
    )
  }
  if (method === 'frog') {
    if (task.frog_date !== today) return null
    return <span className={`${BADGE} bg-success-soft text-success-text`}>лягушка</span>
  }
  if (method === '135') {
    if (!task.effort) return null
    return <span className={`${BADGE} bg-surface-sunken text-text-secondary`}>{EFFORT_LABEL[task.effort].one.toLowerCase()}</span>
  }
  return null
}

/* ── объяснение методики ──────────────────────────────────────────── */

/** Суть, откуда метод, кому подходит и что поменяется в приложении — для листа и настроек. */
export function MethodExplainer({ info }: { info: MethodInfo }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-text-tertiary">{info.origin}</p>
      <p className="text-base text-text">{info.lead}</p>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-text-secondary">Как работает</span>
        <ol className="flex flex-col gap-2">
          {info.steps.map(([mark, text]) => (
            <li key={mark + text} className="flex items-start gap-2.5 text-base text-text">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-surface-sunken font-mono text-xs font-medium text-text-secondary">
                {mark}
              </span>
              <span className="pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
      </div>
      <p className="rounded-md bg-accent-soft px-3 py-2.5 text-sm text-accent-text">
        <b className="font-semibold">Подходит, если:</b> {info.fits}
      </p>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-text-secondary">Что меняется в Semternity</span>
        <ul className="flex flex-col gap-1.5">
          {info.changes.map((c) => (
            <li key={c} className="flex items-start gap-2 text-sm text-text-secondary">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
              <span>{c}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** Лист «Как работает» с «Сегодня»: напоминание о методике и путь к её смене. */
export function MethodInfoSheet({
  method,
  open,
  onClose,
}: {
  method: Exclude<PriorityMethod, 'none'>
  open: boolean
  onClose: () => void
}) {
  const info = METHODS[method]
  return (
    <Sheet open={open} onClose={onClose} title={info.name}>
      <MethodExplainer info={info} />
      <Link to="/settings/method" className="flex min-h-11 items-center justify-center text-base font-medium text-accent-text">
        Сменить методику
      </Link>
    </Sheet>
  )
}

/* ── поле приоритета в карточке задачи ───────────────────────────── */

type TriState = 'auto' | 'yes' | 'no'
const toTri = (v: boolean | null): TriState => (v === null ? 'auto' : v ? 'yes' : 'no')
const fromTri = (v: TriState): boolean | null => (v === 'auto' ? null : v === 'yes')

/**
 * Отметка задачи по выбранной методике. Сохраняется сразу, без уведомления: это
 * переключатели, и их состояние видно на месте.
 */
export function PriorityField({ task, method, tasks }: { task: Task; method: PriorityMethod; tasks: Task[] }) {
  const updateTask = useUpdateTask()
  const setFrog = useSetFrog()
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  const save = (fields: TaskFieldsInput) => updateTask.mutate({ id: task.id, fields }, { onError })
  const today = todayStr()

  if (method === 'none') return null
  const info = METHODS[method]
  const row = 'flex flex-col gap-2 px-3 py-3'
  const caption = 'text-sm text-text-secondary'

  let body: React.ReactNode = null

  if (method === 'eisenhower') {
    const auto = isAutoUrgent(task, today)
    const q = quadrantOf(task, today)
    body = (
      <>
        <div className={row}>
          <span className="text-base text-text">Важно</span>
          <Segmented<TriState>
            stretch
            value={toTri(task.important)}
            onChange={(v) => save({ important: fromTri(v) })}
            options={[
              { value: 'auto', label: 'Не разобрано' },
              { value: 'yes', label: 'Да' },
              { value: 'no', label: 'Нет' },
            ]}
          />
        </div>
        <div className={row}>
          <span className="text-base text-text">Срочно</span>
          <Segmented<TriState>
            stretch
            value={toTri(task.urgent)}
            onChange={(v) => save({ urgent: fromTri(v) })}
            options={[
              { value: 'auto', label: 'По сроку' },
              { value: 'yes', label: 'Да' },
              { value: 'no', label: 'Нет' },
            ]}
          />
          {task.urgent === null && (
            <span className={caption}>
              {task.end_date ? (auto ? 'Срок близко — сейчас срочно' : 'Станет срочной за два дня до срока') : 'Срока нет — не срочно'}
            </span>
          )}
        </div>
        {q && (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className={`${BADGE} ${QUADRANT_TONE[q]}`}>{QUADRANT[q].title}</span>
            <span className={caption}>{QUADRANT[q].hint}</span>
          </div>
        )}
        {q === 3 && <DelegateRow task={task} onSave={save} />}
      </>
    )
  }

  if (method === 'frog') {
    const tomorrow = addDays(today, 1)
    const isToday = task.frog_date === today
    const isTomorrow = task.frog_date === tomorrow
    const choose = (date: string | null, label: string) =>
      setFrog.mutate(
        { taskId: date ? task.id : null, date: date ?? task.frog_date ?? today },
        { onError, onSuccess: () => showSuccess(label) },
      )
    body = (
      <div className={row}>
        <span className={caption}>
          {isToday
            ? 'Лягушка сегодня — делается первой'
            : isTomorrow
              ? 'Лягушка на завтра — утром окажется в «Сегодня»'
              : 'Самая трудная и важная задача дня, её делают первой'}
        </span>
        <div className="flex flex-wrap gap-2">
          {isToday || isTomorrow ? (
            <Button onClick={() => choose(null, 'Больше не лягушка')}>Снять</Button>
          ) : (
            <>
              <Button onClick={() => choose(today, 'Лягушка на сегодня')}>Лягушка на сегодня</Button>
              <Button variant="ghost" onClick={() => choose(tomorrow, 'Лягушка на завтра')}>
                На завтра
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (method === '135') {
    const suggested = suggestEffort(task.planned_hours)
    body = (
      <div className={row}>
        <Segmented<Effort | 'auto'>
          stretch
          value={task.effort ?? 'auto'}
          onChange={(v) => save({ effort: v === 'auto' ? null : v })}
          options={[
            { value: 'auto', label: 'Авто' },
            ...EFFORT_ORDER.map((e) => ({ value: e, label: EFFORT_LABEL[e].one })),
          ]}
        />
        <span className={caption}>
          {task.effort
            ? `${EFFORT_LABEL[task.effort].one} — ${EFFORT_LABEL[task.effort].hint}`
            : `По плану часов: ${EFFORT_LABEL[suggested].one.toLowerCase()} (${EFFORT_LABEL[suggested].hint})`}
        </span>
      </div>
    )
  }

  if (method === 'abcde') {
    const letter = task.abc_letter
    const ranked = letter && letter <= 'C'
    body = (
      <>
        <div className={row}>
          <Segmented<AbcLetter | 'none'>
            stretch
            value={letter ?? 'none'}
            onChange={(v) =>
              save(
                v === 'none'
                  ? { abc_letter: null, abc_rank: null }
                  : { abc_letter: v, abc_rank: v <= 'C' ? nextAbcRank(tasks, v, task.id) : null },
              )
            }
            options={[{ value: 'none' as const, label: '—' }, ...ABC_LETTERS.map((l) => ({ value: l, label: l }))]}
          />
          <span className={caption}>
            {letter
              ? { A: 'Обязательно: без неё будут серьёзные последствия', B: 'Нужно, последствия мягкие', C: 'По желанию, последствий нет', D: 'Поручено другому', E: 'Можно вычеркнуть' }[letter]
              : 'Буква по последствиям: что будет, если не сделать'}
          </span>
        </div>
        {ranked && (
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 text-base text-text">Номер в букве</span>
            <Button
              className="w-10 px-0"
              aria-label="Раньше"
              disabled={(task.abc_rank ?? 1) <= 1}
              onClick={() => save({ abc_rank: Math.max(1, (task.abc_rank ?? 1) - 1) })}
            >
              <Minus size={16} />
            </Button>
            <span className="tabular w-10 text-center font-mono text-base text-text">{abcLabel(task)}</span>
            <Button className="w-10 px-0" aria-label="Позже" onClick={() => save({ abc_rank: (task.abc_rank ?? 0) + 1 })}>
              <Plus size={16} />
            </Button>
          </div>
        )}
        {letter === 'D' && <DelegateRow task={task} onSave={save} />}
      </>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <span className="text-sm font-medium text-text-secondary">Приоритет · {info.name}</span>
        <Link to="/settings/method" className="text-sm text-accent-text">
          Что это
        </Link>
      </div>
      <ListGroup clip={false}>{body}</ListGroup>
    </div>
  )
}

/** «Кому поручено» — сохраняется по уходу с поля. */
function DelegateRow({ task, onSave }: { task: Task; onSave: (f: TaskFieldsInput) => void }) {
  const [value, setValue] = useState(task.delegated_to ?? '')
  return (
    <label className="flex flex-col gap-1.5 px-3 py-3">
      <span className="text-sm text-text-secondary">Кому поручено</span>
      <input
        className={fieldClass}
        value={value}
        placeholder="Имя"
        onChange={(e) => setValue(e.target.value)}
        onBlur={(e) => {
          const next = e.target.value.trim() || null
          if (next !== task.delegated_to) onSave({ delegated_to: next })
        }}
      />
    </label>
  )
}
