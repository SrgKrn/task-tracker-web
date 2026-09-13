import { SubtaskList } from './SubtaskList'
import { ArrowRight } from './Icon'
import { Overline } from './ui'
import { formatHoursMinutes, formatHoursRu } from '../lib/time'
import { suggestedStatus } from '../lib/tree'
import type { Status, Task } from '../lib/types'

interface SprintCompositionProps {
  task: Task
  subtasks: Task[]
  statuses: Status[]
  onApplyStatus: (statusId: string) => void
  onNextSprint: () => void
}

/**
 * Состав спринта в его карточке: раскладка договорного плана по подзадачам,
 * подсказка процента и сами подзадачи. План у спринта главный — подзадачи его
 * разбирают, а не складываются в него: 10 часов на клиента не зависят от того,
 * сколько строк придумалось внутри.
 */
export function SprintComposition({ task, subtasks, statuses, onApplyStatus, onNextSprint }: SprintCompositionProps) {
  const statusById = new Map(statuses.map((s) => [s.id, s]))
  const isDone = (t: Task) => !!t.status_id && !!statusById.get(t.status_id)?.is_final
  const doneCount = subtasks.filter(isDone).length
  const suggestion = suggestedStatus(subtasks, statuses, task.status_id)

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between">
        <Overline>Подзадачи</Overline>
        {subtasks.length > 0 && (
          <span className="tabular font-mono text-2xs text-slate-600">
            закрыто {doneCount} из {subtasks.length}
          </span>
        )}
      </div>

      {subtasks.length > 0 && <PlanAllocation task={task} subtasks={subtasks} isDone={isDone} />}

      {/* процент — то, чем отчитываются перед клиентом, поэтому сам он не меняется:
          приложение только замечает расхождение и предлагает */}
      {suggestion && (
        <div
          className="flex items-center gap-3 rounded-xl py-1.5 pr-1.5 pl-3"
          style={{ background: 'rgba(127,184,148,.08)', border: '1px solid rgba(127,184,148,.28)' }}
        >
          <span className="min-w-0 flex-1 text-xs leading-[1.4] text-slate-300">
            Закрыто {suggestion.done} из {suggestion.total} — по подзадачам это{' '}
            <span className="font-medium text-emerald-400">{suggestion.status.label}</span>
          </span>
          <button
            type="button"
            onClick={() => onApplyStatus(suggestion.status.id)}
            className="h-9 shrink-0 rounded-lg px-3 text-xs font-semibold"
            style={{ background: 'rgba(127,184,148,.16)', color: 'var(--s-success)' }}
          >
            Поставить
          </button>
        </div>
      )}

      <SubtaskList parent={task} subtasks={subtasks} />

      <button
        type="button"
        onClick={onNextSprint}
        className="-mb-1 flex min-h-11 items-center justify-between gap-2 self-stretch rounded-xl px-3 text-left text-xs text-slate-400"
        style={{ border: '1px solid var(--s-border)' }}
      >
        <span>
          Следующий спринт
          <span className="block text-2xs text-slate-600">
            {subtasks.some((t) => !isDone(t)) ? 'с незакрытыми подзадачами' : 'на следующий период'}
          </span>
        </span>
        <ArrowRight size={15} />
      </button>
    </div>
  )
}

function PlanAllocation({
  task,
  subtasks,
  isDone,
}: {
  task: Task
  subtasks: Task[]
  isDone: (t: Task) => boolean
}) {
  const plan = task.planned_hours
  const allocated = subtasks.reduce((sum, t) => sum + t.planned_hours, 0)
  const allocatedDone = subtasks.filter(isDone).reduce((sum, t) => sum + t.planned_hours, 0)
  const own = task.fact_hours
  const left = plan - allocated
  const over = plan > 0 && left < -1 / 120

  const doneWidth = plan > 0 ? Math.min(100, (allocatedDone / plan) * 100) : 0
  const openWidth = plan > 0 ? Math.max(0, Math.min(100 - doneWidth, ((allocated - allocatedDone) / plan) * 100)) : 0

  const status =
    plan === 0
      ? allocated > 0
        ? `в подзадачах ${formatHoursMinutes(allocated)}`
        : 'у подзадач пока нет плана'
      : over
        ? null
        : Math.abs(left) < 1 / 120
          ? 'план разложен полностью'
          : `осталось разложить ${formatHoursMinutes(left)}`

  return (
    <div
      className="flex flex-col gap-2 rounded-xl p-3"
      style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-hairline)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-2xs uppercase tracking-[.12em] text-slate-500">План разложен</span>
        <span className="tabular font-mono text-xs text-slate-300">
          {plan > 0
            ? `${formatHoursRu(allocated)} из ${formatHoursRu(plan)} ч`
            : `${formatHoursRu(allocated)} ч · у спринта без плана`}
        </span>
      </div>

      {plan > 0 && (
        <div className="flex h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--s-ring-track)' }}>
          <span style={{ width: `${doneWidth}%`, background: 'var(--s-success)' }} />
          <span
            style={{
              width: `${openWidth}%`,
              background: over ? 'var(--s-danger)' : 'var(--s-accent-muted)',
            }}
          />
        </div>
      )}

      <p className="font-mono text-2xs leading-[1.5] text-slate-500">
        {over ? (
          // перебор не запрещаем: так бывает, но видно это должно быть сразу
          <span className="text-red-400">разложено на {formatHoursMinutes(-left)} больше плана</span>
        ) : (
          status
        )}
        {own > 0 && ` · ${formatHoursMinutes(own)} записано в сам спринт`}
      </p>
    </div>
  )
}
