import { useState, type ReactNode } from 'react'
import { Button, ListGroup, Overline, Segmented, Sheet } from './ui'
import {
  ABC_LABEL,
  ABC_TONE,
  QUADRANT_TONE,
  ABC_LETTERS,
  EFFORT_LABEL,
  EFFORT_ORDER,
  EFFORT_SLOTS,
  QUADRANT,
  compareAbc,
  frogOf,
  isAutoUrgent,
  layoutDay,
  quadrantOf,
  type Quadrant,
} from '../lib/priority'
import { addDays } from '../lib/period'
import { describeError, useToast } from '../lib/Toast'
import { useSetFrog, useSetPlanDate, useUpdateTask } from '../lib/queries/tasks'
import { TASKS, plural } from '../lib/time'
import type { AbcLetter, PriorityMethod, Task } from '../lib/types'

/**
 * Список дня на «Сегодня» под выбранную методику приоритизации. Строки — те же, что и без
 * методики (учёт, свайп, этап): меняется только раскладка дня.
 */
interface DayProps {
  method: Exclude<PriorityMethod, 'none'>
  today: string
  /** задачи дня: открытые первыми, закрытые после */
  tasks: Task[]
  /** все задачи — номера ABCDE и выбор лягушки */
  allTasks: Task[]
  isDone: (t: Task) => boolean
  /** по задаче сегодня шёл или идёт учёт */
  started: (t: Task) => boolean
  /** уже в дне без выбора (учёт, ежедневные, лягушка) — с дня не снимается */
  lockedIds: ReadonlySet<string>
  /** что можно предложить на роль лягушки, кроме задач дня */
  candidates: Task[]
  metaOf: (t: Task) => string
  renderRow: (t: Task) => ReactNode
  onPlan: () => void
}

export function DayByMethod(props: DayProps) {
  switch (props.method) {
    case 'eisenhower':
      return <EisenhowerDay {...props} />
    case 'frog':
      return <FrogDay {...props} />
    case '135':
      return <SlotsDay {...props} />
    case 'abcde':
      return <AbcDay {...props} />
  }
}

function Rows({ tasks, renderRow, className = '' }: { tasks: Task[]; renderRow: (t: Task) => ReactNode; className?: string }) {
  return (
    <ListGroup className={className}>
      {tasks.map((t) => (
        <div key={t.id}>{renderRow(t)}</div>
      ))}
    </ListGroup>
  )
}

function Section({ title, hint, children, id, tone = '' }: { title: string; hint?: string; children: ReactNode; id?: string; tone?: string }) {
  return (
    <section id={id} className="flex scroll-mt-4 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <Overline className={tone}>{title}</Overline>
        {hint && <span className="text-xs text-text-tertiary">{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function DoneRows({ tasks, renderRow }: { tasks: Task[]; renderRow: (t: Task) => ReactNode }) {
  if (tasks.length === 0) return null
  return (
    <Section title={`Готово · ${tasks.length}`}>
      <Rows tasks={tasks} renderRow={renderRow} />
    </Section>
  )
}

/* ── матрица Эйзенхауэра ──────────────────────────────────────────── */

const QUADRANTS: Quadrant[] = [1, 2, 3, 4]

function EisenhowerDay({ tasks, today, isDone, renderRow }: DayProps) {
  const [triage, setTriage] = useState<Task[] | null>(null)
  const open = tasks.filter((t) => !isDone(t))
  const byQ = new Map<Quadrant, Task[]>(QUADRANTS.map((q) => [q, []]))
  const unsorted: Task[] = []
  for (const t of open) {
    const q = quadrantOf(t, today)
    if (q) byQ.get(q)!.push(t)
    else unsorted.push(t)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* сама матрица — плитками со счётом: на телефоне строки с учётом в четыре клетки не влезут */}
      <div className="grid grid-cols-2 gap-2">
        {QUADRANTS.map((q) => {
          const n = byQ.get(q)!.length
          return (
            <button
              key={q}
              type="button"
              onClick={() => document.getElementById(`q-${q}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              disabled={n === 0}
              className={`flex min-h-16 flex-col items-start justify-between rounded-md px-3 py-2.5 text-left ${QUADRANT_TONE[q]} ${n === 0 ? 'opacity-60' : ''}`}
            >
              <span className="flex w-full items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{QUADRANT[q].title}</span>
                <span className="tabular font-mono text-base font-medium">{n}</span>
              </span>
              <span className="text-xs opacity-80">{QUADRANT[q].hint}</span>
            </button>
          )
        })}
      </div>

      {unsorted.length > 0 && (
        <Section title={`Разобрать · ${unsorted.length}`} hint="важно ли?">
          <Button onClick={() => setTriage(unsorted)} className="self-start">
            Разобрать по одной
          </Button>
          <Rows tasks={unsorted} renderRow={renderRow} />
        </Section>
      )}

      {QUADRANTS.map((q) => {
        const list = byQ.get(q)!
        if (list.length === 0) return null
        return (
          <Section
            key={q}
            id={`q-${q}`}
            title={`${QUADRANT[q].title} · ${list.length}`}
            hint={q === 4 ? 'можно снять с дня' : QUADRANT[q].hint.toLowerCase()}
          >
            <Rows tasks={list} renderRow={renderRow} className={q === 4 ? 'opacity-70' : ''} />
          </Section>
        )
      })}

      <DoneRows tasks={tasks.filter(isDone)} renderRow={renderRow} />

      {triage && <TriageSheet tasks={triage} today={today} onClose={() => setTriage(null)} />}
    </div>
  )
}

type Tri = 'auto' | 'yes' | 'no'

/** Разбор по одной задаче: два вопроса — важно ли и срочно ли. */
function TriageSheet({ tasks, today, onClose }: { tasks: Task[]; today: string; onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [important, setImportant] = useState<'yes' | 'no' | null>(null)
  const [urgent, setUrgent] = useState<Tri>('auto')
  const updateTask = useUpdateTask()
  const { showError, showSuccess } = useToast()
  const task = tasks[index]
  if (!task) return null

  const next = () => {
    setImportant(null)
    setUrgent('auto')
    if (index + 1 >= tasks.length) {
      onClose()
      showSuccess('Разобрано')
    } else setIndex(index + 1)
  }
  const save = () => {
    updateTask.mutate(
      { id: task.id, fields: { important: important === 'yes', urgent: urgent === 'auto' ? null : urgent === 'yes' } },
      { onError: (e) => showError(describeError(e)) },
    )
    next()
  }
  const auto = isAutoUrgent(task, today)

  return (
    <Sheet open onClose={onClose} title={`Разбор · ${index + 1} из ${tasks.length}`}>
      <p className="text-md font-semibold text-text">{task.name}</p>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-text-secondary">Важно? Двигает цели, клиентов, деньги</span>
        <Segmented<'yes' | 'no' | ''>
          stretch
          value={important ?? ''}
          onChange={(v) => v && setImportant(v)}
          options={[
            { value: 'yes', label: 'Важно' },
            { value: 'no', label: 'Не важно' },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm text-text-secondary">
          Срочно? {task.end_date ? (auto ? 'По сроку — да' : 'По сроку — пока нет') : 'Срока нет'}
        </span>
        <Segmented<Tri>
          stretch
          value={urgent}
          onChange={setUrgent}
          options={[
            { value: 'auto', label: 'По сроку' },
            { value: 'yes', label: 'Срочно' },
            { value: 'no', label: 'Не срочно' },
          ]}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <Button variant="ghost" onClick={next}>
          Пропустить
        </Button>
        <Button variant="primary" className="flex-1" disabled={!important} onClick={save}>
          {index + 1 >= tasks.length ? 'Готово' : 'Дальше'}
        </Button>
      </div>
    </Sheet>
  )
}

/* ── «Съешь лягушку» ──────────────────────────────────────────────── */

function FrogDay({ tasks, allTasks, today, isDone, started, candidates, metaOf, renderRow }: DayProps) {
  const [picking, setPicking] = useState<string | null>(null)
  const frog = frogOf(tasks, today)
  const tomorrow = addDays(today, 1)
  const tomorrowFrog = frogOf(allTasks, tomorrow)
  const eaten = !!frog && isDone(frog)
  const begun = !!frog && (eaten || started(frog))
  const rest = tasks.filter((t) => t.id !== frog?.id)
  const restOpen = rest.filter((t) => !isDone(t))

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-md bg-success-soft p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <Overline className="text-success-text">Лягушка дня</Overline>
          {frog && !eaten && (
            <button type="button" onClick={() => setPicking(today)} className="min-h-9 text-sm font-medium text-success-text">
              Сменить
            </button>
          )}
        </div>
        {frog ? (
          <>
            <ListGroup>{renderRow(frog)}</ListGroup>
            <p className="text-sm text-success-text">
              {eaten
                ? 'Съедена. Худшее за день позади — остальное без спешки.'
                : begun
                  ? 'Начата — не переключайтесь, пока не закончите.'
                  : 'Начните с неё: нажмите на кольцо слева, до почты и мелочей.'}
            </p>
          </>
        ) : (
          <>
            <p className="text-base text-text">Самая трудная и важная задача дня — та, которую хочется отложить.</p>
            <Button variant="primary" className="self-start" onClick={() => setPicking(today)}>
              Выбрать лягушку
            </Button>
          </>
        )}
        {(eaten || !frog) &&
          (tomorrowFrog ? (
            <p className="text-sm text-success-text">На завтра: {tomorrowFrog.name}</p>
          ) : (
            eaten && (
              <Button className="self-start" onClick={() => setPicking(tomorrow)}>
                Выбрать лягушку на завтра
              </Button>
            )
          ))}
      </section>

      {rest.length > 0 && (
        <Section
          title={frog ? `После лягушки · ${plural(restOpen.length, TASKS)}` : `На сегодня · ${plural(restOpen.length, TASKS)}`}
          hint={frog && !begun ? 'приглушено до старта лягушки' : undefined}
        >
          <Rows tasks={rest} renderRow={renderRow} className={frog && !begun ? 'opacity-60' : ''} />
        </Section>
      )}

      {picking && (
        <FrogPicker
          date={picking}
          today={today}
          options={uniq([...(picking === today ? tasks.filter((t) => !isDone(t)) : []), ...candidates]).filter(
            (t) => t.frog_date !== picking,
          )}
          metaOf={metaOf}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  )
}

function uniq(list: Task[]): Task[] {
  const seen = new Set<string>()
  return list.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)))
}

function FrogPicker({
  date,
  today,
  options,
  metaOf,
  onClose,
}: {
  date: string
  today: string
  options: Task[]
  metaOf: (t: Task) => string
  onClose: () => void
}) {
  const setFrog = useSetFrog()
  const { showError, showSuccess } = useToast()
  const forToday = date === today
  return (
    <Sheet open onClose={onClose} title={forToday ? 'Лягушка дня' : 'Лягушка на завтра'}>
      <p className="text-sm text-text-secondary">
        {forToday ? 'Самая трудная и важная задача — её делают первой.' : 'Утром она сама окажется в «Сегодня» первой.'}
      </p>
      {options.length === 0 ? (
        <p className="text-base text-text-secondary">Открытых задач нет.</p>
      ) : (
        <ListGroup>
          {options.slice(0, 30).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                onClose()
                setFrog.mutate(
                  { taskId: t.id, date },
                  { onError: (e) => showError(describeError(e)), onSuccess: () => showSuccess(forToday ? 'Лягушка дня выбрана' : 'Лягушка на завтра выбрана') },
                )
              }}
              className="flex min-h-12 flex-col justify-center px-3 py-2 text-left active:bg-surface-sunken lg:hover:bg-surface-hover"
            >
              <span className="truncate text-base text-text">{t.name}</span>
              {metaOf(t) && <span className="truncate text-sm text-text-secondary">{metaOf(t)}</span>}
            </button>
          ))}
        </ListGroup>
      )}
    </Sheet>
  )
}

/* ── правило 1-3-5 ────────────────────────────────────────────────── */

const MORE: Record<'big' | 'medium' | 'small', [string, string, string]> = {
  big: ['большая', 'большие', 'больших'],
  medium: ['средняя', 'средние', 'средних'],
  small: ['мелкая', 'мелкие', 'мелких'],
}

function SlotsDay({ tasks, today, isDone, lockedIds, renderRow, onPlan }: DayProps) {
  const setPlanDate = useSetPlanDate()
  const { showError, showSuccess } = useToast()
  // кто уже не может уйти из дня (закрыт, идёт учёт, ежедневная) — занимает место первым
  const ordered = [
    ...tasks.filter(isDone),
    ...tasks.filter((t) => !isDone(t) && lockedIds.has(t.id)),
    ...tasks.filter((t) => !isDone(t) && !lockedIds.has(t.id)),
  ]
  const day = layoutDay(ordered)
  const filled = day.big.length + day.medium.length + day.small.length
  const movable = day.overflow.filter((t) => t.plan_date === today && !lockedIds.has(t.id) && !isDone(t))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3.5 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-semibold text-text">{filled} из 9 мест</span>
          <span className="text-sm text-text-secondary">1 большая · 3 средних · 5 мелких</span>
        </div>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < filled ? 'bg-accent' : 'bg-border'}`} />
          ))}
        </div>
      </div>

      {EFFORT_ORDER.map((e) => {
        const list = day[e]
        const free = EFFORT_SLOTS[e] - list.length
        return (
          <Section key={e} title={EFFORT_LABEL[e].title} hint={EFFORT_LABEL[e].hint}>
            {list.length > 0 && <Rows tasks={list} renderRow={renderRow} />}
            {free > 0 && (
              <button
                type="button"
                onClick={onPlan}
                className="flex min-h-11 items-center rounded-md border border-dashed border-border-strong px-3.5 text-left text-sm text-text-secondary"
              >
                + ещё {free === 1 ? `одна ${MORE[e][0]}` : `${free} ${MORE[e][free < 5 ? 1 : 2]}`}
              </button>
            )}
          </Section>
        )
      })}

      {day.overflow.length > 0 && (
        <Section title={`Не влезло · ${day.overflow.length}`} hint="места этого размера заняты" tone="text-warning-text">
          <Rows tasks={day.overflow} renderRow={renderRow} className="opacity-70" />
          {movable.length > 0 && (
            <Button
              className="self-start"
              onClick={() =>
                setPlanDate.mutate(
                  { ids: movable.map((t) => t.id), date: addDays(today, 1) },
                  {
                    onError: (err) => showError(describeError(err)),
                    onSuccess: () => showSuccess(`На завтра: ${plural(movable.length, TASKS)}`),
                  },
                )
              }
            >
              Перенести на завтра
            </Button>
          )}
        </Section>
      )}
    </div>
  )
}

/* ── ABCDE ────────────────────────────────────────────────────────── */

function AbcDay({ tasks, isDone, renderRow }: DayProps) {
  const open = tasks.filter((t) => !isDone(t)).sort(compareAbc)
  const openA = open.filter((t) => t.abc_letter === 'A').length
  const groups: { key: AbcLetter | 'none'; list: Task[] }[] = [
    ...ABC_LETTERS.map((l) => ({ key: l, list: open.filter((t) => t.abc_letter === l) })),
    { key: 'none' as const, list: open.filter((t) => !t.abc_letter) },
  ]
  const hasBC = open.some((t) => t.abc_letter === 'B' || t.abc_letter === 'C')

  return (
    <div className="flex flex-col gap-4">
      {openA > 0 && hasBC && (
        <p className={`rounded-md px-3.5 py-2.5 text-sm ${ABC_TONE.A}`}>
          Сначала все A — {openA === 1 ? 'осталась одна' : `осталось ${openA}`}. B и C приглушены.
        </p>
      )}
      {groups.map(({ key, list }) =>
        list.length === 0 ? null : (
          <Section
            key={key}
            title={key === 'none' ? `Без буквы · ${list.length}` : `${ABC_LABEL[key].title} · ${list.length}`}
            hint={key === 'none' ? 'буква — в карточке задачи' : undefined}
          >
            <Rows
              tasks={list}
              renderRow={renderRow}
              className={(key === 'B' || key === 'C') && openA > 0 ? 'opacity-60' : key === 'E' ? 'opacity-70' : ''}
            />
          </Section>
        ),
      )}
      <DoneRows tasks={tasks.filter(isDone)} renderRow={renderRow} />
    </div>
  )
}
