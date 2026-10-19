import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ProfileButton } from '../components/Avatar'
import { FocusExplainer, FocusSettingsForm } from '../components/FocusSettings'
import { Pause, Play, Settings2, SkipForward, Square } from '../components/Icon'
import { Ring } from '../components/Ring'
import { Button, ClientDot, ListGroup, Overline, Sheet } from '../components/ui'
import { BREAK_TIPS, FOCUS_INFO, buildPlan, formatCountdown, phaseAt, secondsLeft, suggestTask, workNumber } from '../lib/focus'
import { isInDay } from '../lib/dayPlan'
import { useGroupModel } from '../lib/groups'
import { todayStr } from '../lib/period'
import { useFocusAction, useFocusPrefs, useFocusRun, useFocusSessions } from '../lib/queries/focus'
import { useStatuses } from '../lib/queries/statuses'
import { useTasks } from '../lib/queries/tasks'
import { useActiveTimer } from '../lib/queries/timer'
import { usePriorityMethod } from '../lib/queries/userSettings'
import { describeError, useToast } from '../lib/Toast'
import { tap } from '../lib/haptics'
import { formatHoursMinutes, useTicker } from '../lib/time'
import type { FocusPhase, Task } from '../lib/types'

const PHASE_NAME: Record<FocusPhase['kind'], string> = { work: 'Работа', break: 'Перерыв', long: 'Длинный перерыв' }

/**
 * Фокус: работа отрезками. Рабочий отрезок — обычный учёт по задаче (кольцо задачи в
 * списках тоже тикает), перерыв учёт не пишет. Смену отрезков делает база — экран только
 * показывает и отправляет нажатия; закрытое приложение догоняет при следующем открытии.
 */
export function Focus() {
  const today = todayStr()
  const { data: run, isLoading } = useFocusRun()
  const prefs = useFocusPrefs()
  const method = usePriorityMethod()
  const { data: tasks = [] } = useTasks()
  const { data: statuses = [] } = useStatuses()
  const { data: activeTimer } = useActiveTimer()
  const { data: sessions = [] } = useFocusSessions(today)
  const model = useGroupModel()
  const action = useFocusAction()
  const { showError } = useToast()
  const onError = (e: unknown) => showError(describeError(e))
  const [picking, setPicking] = useState(false)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [info, setInfo] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useTicker(run?.state === 'running')

  const finalIds = useMemo(() => new Set(statuses.filter((s) => s.is_final).map((s) => s.id)), [statuses])
  const isDone = (t: Task) => !!t.status_id && finalIds.has(t.status_id)
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const dayTasks = tasks.filter((t) => !isDone(t) && isInDay(t, today, activeTimer?.task_id, new Set()))
  const suggestion = suggestTask(dayTasks, method, today, activeTimer?.task_id)

  const mode = run?.mode ?? prefs.mode
  const plan = run?.plan ?? buildPlan(prefs.mode, prefs.settings)
  const index = run?.phase_index ?? 0
  const phase = phaseAt(plan, index)
  const isWork = phase.kind === 'work'
  const left = run ? secondsLeft(run) : phase.seconds
  const progress = 1 - left / phase.seconds
  const { n, of } = workNumber(plan, index)
  const task: Task | undefined = run?.task_id
    ? taskById.get(run.task_id)
    : chosenId
      ? taskById.get(chosenId)
      : suggestion?.task
  const reason = run ? null : chosenId ? 'выбрана вами' : suggestion?.reason

  const completed = sessions.filter((s) => s.completed)
  const workedMin = sessions.reduce((a, s) => a + (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000, 0)
  const unit = mode === 'pomodoro' ? ['помидор', 'помидора', 'помидоров'] : ['глубокая сессия', 'глубокие сессии', 'глубоких сессий']
  const countLabel = (k: number) => {
    const a = k % 100, l = k % 10
    return `${k} ${a > 10 && a < 20 ? unit[2] : l === 1 ? unit[0] : l > 1 && l < 5 ? unit[1] : unit[2]}`
  }

  function main() {
    tap()
    if (!run) {
      if (!task) return setPicking(true)
      action.mutate({ kind: 'start', taskId: task.id, mode: prefs.mode, plan: buildPlan(prefs.mode, prefs.settings) }, { onError })
    } else if (run.state === 'running') action.mutate({ kind: 'pause' }, { onError })
    else action.mutate({ kind: 'resume' }, { onError })
  }

  const ringColor = isWork ? 'var(--accent)' : 'var(--success)'
  const mainLabel = !run ? 'Начать' : run.state === 'running' ? 'Пауза' : run.state === 'ready' ? 'Начать работу' : 'Продолжить'

  return (
    <div className="page mx-auto flex max-w-lg flex-col">
      <div className="safe-top">
        <div className="flex items-center justify-between gap-3 px-5 pt-3.5 pb-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Overline>{FOCUS_INFO[mode].short}</Overline>
            <h1 className="text-xl font-semibold tracking-[-0.01em] text-text">Фокус</h1>
          </div>
          <Button variant="ghost" className="w-[var(--tap)] px-0" aria-label="Длительности и режим" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={18} />
          </Button>
          <ProfileButton />
        </div>
      </div>

      <div className="flex flex-col gap-4 px-5 pt-2 pb-6">
        <div className="flex items-center justify-between gap-2">
          <span className="text-base font-medium text-text">{FOCUS_INFO[mode].name}</span>
          <button type="button" onClick={() => setInfo(true)} className="min-h-11 text-sm font-medium text-accent-text">
            Как работает
          </button>
        </div>

        {run && (!isWork || run.state === 'ready') && (
          <p className="rounded-md bg-success-soft px-3.5 py-2.5 text-sm text-success-text">
            <b className="font-semibold">{run.state === 'ready' ? 'Перерыв окончен' : PHASE_NAME[phase.kind]}.</b>{' '}
            {run.state === 'ready'
              ? 'Учёт без вас не идёт — начните следующий отрезок, когда будете готовы.'
              : `${BREAK_TIPS[index % BREAK_TIPS.length]}. Время не идёт в учёт.`}
          </p>
        )}

        <div className="flex flex-col items-center gap-3 py-2">
          <Ring size={232} pct={Math.max(0, Math.min(100, progress * 100))} color={ringColor} centerBg="var(--bg)">
            <span className="flex flex-col items-center gap-1">
              <span className="text-sm font-semibold" style={{ color: ringColor }}>
                {run?.state === 'ready' ? 'Ждёт старта' : isWork ? (mode === 'pomodoro' ? `Помидор ${n} из ${of}` : `Глубокая работа ${n}`) : PHASE_NAME[phase.kind]}
              </span>
              <span className="tabular font-mono font-medium text-text" style={{ fontSize: 44, lineHeight: 1 }}>
                {formatCountdown(left)}
              </span>
              <span className="text-sm text-text-secondary">
                {run?.state === 'paused' ? 'на паузе' : `из ${Math.round(phase.seconds / 60)} мин`}
              </span>
            </span>
          </Ring>
          {mode === 'pomodoro' && (
            <span className="flex gap-1.5" aria-label={`Помидор ${n} из ${of}`}>
              {Array.from({ length: of }, (_, i) => (
                <span
                  key={i}
                  className={`h-2.5 w-2.5 rounded-full ${i < n - 1 || (i === n - 1 && !isWork && !!run) ? 'bg-accent' : i === n - 1 && run ? 'border-2 border-accent' : 'bg-border-strong'}`}
                />
              ))}
            </span>
          )}
        </div>

        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            disabled={!run || action.isPending}
            onClick={() => action.mutate({ kind: 'stop' }, { onError })}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-text-secondary disabled:opacity-40"
            aria-label="Закончить фокус"
          >
            <Square size={16} />
          </button>
          <button
            type="button"
            disabled={action.isPending}
            onClick={main}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-on-accent shadow-popover disabled:opacity-60"
            aria-label={mainLabel}
          >
            {run?.state === 'running' ? <Pause size={26} /> : <Play size={26} />}
          </button>
          <button
            type="button"
            disabled={!run || action.isPending}
            onClick={() => action.mutate({ kind: 'skip' }, { onError })}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-text-secondary disabled:opacity-40"
            aria-label={isWork ? 'Закончить отрезок и перейти к перерыву' : 'Пропустить перерыв'}
          >
            <SkipForward size={16} />
          </button>
        </div>

        {/* задача фокуса: до старта её можно сменить, во время — она в учёте */}
        <button
          type="button"
          onClick={() => setPicking(true)}
          disabled={run?.state === 'running' && isWork}
          className="flex min-h-14 items-center gap-3 rounded-md border border-border bg-surface px-3.5 py-2.5 text-left disabled:cursor-default"
        >
          {task && <ClientDot color={model.colorOf(task)} />}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-medium text-text">{task ? task.name : 'Выберите задачу'}</span>
            <span className="block truncate text-sm text-text-secondary">
              {task ? [model.listLabel(task), reason ? `предложена: ${reason}` : null].filter(Boolean).join(' · ') : 'Время работы пойдёт в её учёт'}
            </span>
          </span>
          {!(run?.state === 'running' && isWork) && <span className="text-sm font-medium text-accent-text">Сменить</span>}
        </button>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <Overline>Круг</Overline>
            <span className="text-xs text-text-tertiary">
              {plan.filter((p) => p.kind === 'work').length} × работа · {formatHoursMinutes(plan.reduce((a, p) => a + p.seconds, 0) / 3600)}
            </span>
          </div>
          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
            {plan.map((p, i) => {
              const cur = run ? index % plan.length : -1
              const past = i < cur
              const work = p.kind === 'work'
              return (
                <span
                  key={i}
                  className={`relative h-full ${past ? (work ? 'bg-accent' : 'bg-success') : work ? 'bg-accent-soft' : 'bg-success-soft'}`}
                  style={{ flexGrow: p.seconds }}
                >
                  {i === cur && (
                    <span className={`absolute inset-y-0 left-0 ${work ? 'bg-accent' : 'bg-success'}`} style={{ width: `${progress * 100}%` }} />
                  )}
                </span>
              )
            })}
          </div>
          <div className="flex justify-between text-xs text-text-tertiary">
            <span>работа</span>
            <span>перерыв</span>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Overline>Сегодня</Overline>
          <ListGroup>
            <div className="flex min-h-12 items-center gap-3 px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-base text-text">{completed.length ? countLabel(completed.length) : 'Пока ни одного отрезка'}</span>
                <span className="block text-sm text-text-secondary">
                  {sessions.length
                    ? `${formatHoursMinutes(workedMin / 60)} в учёте${sessions.length > completed.length ? ` · прервано ${sessions.length - completed.length}` : ''}`
                    : 'Доработанные до конца отрезки считаются здесь'}
                </span>
              </span>
            </div>
          </ListGroup>
        </div>

        {isLoading ? null : !run && dayTasks.length === 0 && (
          <p className="text-sm text-text-secondary">
            В плане дня пусто — выберите задачу вручную или отметьте день на <Link to="/" className="text-accent-text">«Сегодня»</Link>.
          </p>
        )}
      </div>

      <TaskPicker
        open={picking}
        onClose={() => setPicking(false)}
        dayTasks={dayTasks}
        otherTasks={tasks.filter((t) => !isDone(t) && !dayTasks.includes(t) && !tasks.some((c) => c.parent_id === t.id))}
        labelOf={(t) => model.listLabel(t)}
        onPick={(t) => {
          setPicking(false)
          if (run) action.mutate({ kind: 'task', taskId: t.id }, { onError })
          else setChosenId(t.id)
        }}
      />

      <Sheet open={info} onClose={() => setInfo(false)} title={FOCUS_INFO[mode].name}>
        <FocusExplainer mode={mode} />
      </Sheet>
      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Режим и длительности">
        <FocusSettingsForm />
      </Sheet>
    </div>
  )
}

function TaskPicker({
  open,
  onClose,
  dayTasks,
  otherTasks,
  labelOf,
  onPick,
}: {
  open: boolean
  onClose: () => void
  dayTasks: Task[]
  otherTasks: Task[]
  labelOf: (t: Task) => string
  onPick: (t: Task) => void
}) {
  const row = (t: Task) => (
    <button
      key={t.id}
      type="button"
      onClick={() => onPick(t)}
      className="flex min-h-12 flex-col justify-center px-3.5 py-2 text-left active:bg-surface-sunken lg:hover:bg-surface-hover"
    >
      <span className="truncate text-base text-text">{t.name}</span>
      {labelOf(t) && <span className="truncate text-sm text-text-secondary">{labelOf(t)}</span>}
    </button>
  )
  return (
    <Sheet open={open} onClose={onClose} title="Задача для фокуса">
      {dayTasks.length > 0 && (
        <>
          <Overline>На сегодня</Overline>
          <ListGroup>{dayTasks.map(row)}</ListGroup>
        </>
      )}
      {otherTasks.length > 0 && (
        <>
          <Overline>Остальные</Overline>
          <ListGroup>{otherTasks.slice(0, 40).map(row)}</ListGroup>
        </>
      )}
    </Sheet>
  )
}
