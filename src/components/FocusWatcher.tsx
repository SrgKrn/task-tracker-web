import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { formatCountdown, secondsLeft } from '../lib/focus'
import { playFocusSignal } from '../lib/focusSignal'
import { advanceFocus, useFocusAction, useFocusRun } from '../lib/queries/focus'
import { useActiveTimer } from '../lib/queries/timer'
import { describeError, useToast } from '../lib/Toast'
import { useTicker } from '../lib/time'

/**
 * Следит за фокусом, пока приложение открыто: отрезок кончился — просит базу перейти к
 * следующему (учёт закрывается ровно в конце отрезка), подаёт звук и вибрацию. Закрытое
 * приложение догоняет сервер раз в минуту — он же шлёт пуш и Telegram.
 */
export function FocusWatcher() {
  const qc = useQueryClient()
  const { data: run, isFetching: runFetching } = useFocusRun()
  const { data: activeTimer, isFetching: timerFetching } = useActiveTimer()
  const action = useFocusAction()
  const { showSuccess, showError } = useToast()
  const busy = useRef(false)

  // конец отрезка: таймер ставится на точное время, а не опрос раз в секунду
  const endsAt = run?.state === 'running' ? run.phase_ends_at : null
  useEffect(() => {
    if (!endsAt) return
    const wait = Math.max(0, new Date(endsAt).getTime() - Date.now()) + 300
    const id = setTimeout(async () => {
      if (busy.current) return
      busy.current = true
      try {
        const t = await advanceFocus(qc)
        if (!t) return
        // сигнал — только если отрезок кончился только что, а не час назад, пока экран спал
        const fresh = Date.now() - new Date(endsAt).getTime() < 90_000
        if (fresh) playFocusSignal(t.ended_kind === 'work' ? 'work-done' : 'break-done')
        showSuccess(
          t.ended_kind === 'work'
            ? `Отрезок закончен — перерыв ${Math.round(t.next_seconds / 60)} мин`
            : 'Перерыв окончен — пора за работу',
        )
      } catch (e) {
        showError(describeError(e))
      } finally {
        busy.current = false
      }
    }, wait)
    return () => clearTimeout(id)
  }, [endsAt, qc, showSuccess, showError])

  // учёт остановили или переключили на другую задачу вне фокуса — фокус встаёт на паузу,
  // иначе отрезок «шёл бы» без учёта. Свежий старт не трогаем: учёт ещё не перечитан
  // Отрезок, который вот-вот кончится или уже кончился, не трогаем: учёт закрыла сама база,
  // а состояние фокуса просто ещё не перечитано — пауза встала бы на начавшийся перерыв.
  const mismatch =
    run?.state === 'running' &&
    run.phase_kind === 'work' &&
    !!run.phase_ends_at &&
    new Date(run.phase_ends_at).getTime() - Date.now() > 5000 &&
    !timerFetching &&
    !runFetching &&
    activeTimer?.task_id !== run.task_id &&
    Date.now() - new Date(run.updated_at).getTime() > 8000
  useEffect(() => {
    if (!mismatch || action.isPending) return
    action.mutate({ kind: 'pause' }, { onSuccess: () => showSuccess('Фокус на паузе: учёт по задаче остановлен') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mismatch])

  return null
}

/**
 * Плашка перерыва на других экранах: учёта в перерыве нет, и без неё не видно, что фокус
 * идёт. Во время работы её роль играет обычная плашка учёта.
 */
export function FocusBreakBar() {
  const { data: run } = useFocusRun()
  const { pathname } = useLocation()
  useTicker(run?.state === 'running')
  // работа на паузе видна на «Фокусе»; здесь — перерыв и работа, ждущая старта
  if (!run || (run.phase_kind === 'work' && run.state !== 'ready') || pathname === '/focus') return null
  const ready = run.state === 'ready'
  return (
    <Link
      to="/focus"
      data-top-bar
      className="safe-top-box mx-4 mb-2 flex items-center gap-3 rounded-md bg-success-soft px-3.5 py-2.5"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-success-text">Фокус</span>
        <span className="block truncate text-base font-medium text-text">
          {ready ? 'Перерыв окончен — начните работу' : run.state === 'paused' ? 'Перерыв на паузе' : 'Перерыв'}
        </span>
      </span>
      {!ready && <span className="tabular shrink-0 font-mono text-lg font-medium text-success-text">{formatCountdown(secondsLeft(run))}</span>}
    </Link>
  )
}
