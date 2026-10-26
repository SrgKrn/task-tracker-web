import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTip } from '../lib/tips'
import { useQueryClient } from '@tanstack/react-query'
import { switchWorkspace, useOtherWorkspace } from '../lib/workspace'
import { Ring, StopGlyph } from './Ring'
import { Button, ClientDot, Segmented, Sheet, fieldClass } from './ui'
import { Comment } from './Icon'
import { describeError, useToast } from '../lib/Toast'
import { tap } from '../lib/haptics'
import { useGroupModel } from '../lib/groups'
import { useTask } from '../lib/queries/tasks'
import { useAddComment } from '../lib/queries/comments'
import { useActiveTimer, useStopTimer } from '../lib/queries/timer'
import { formatClock, sessionHourPct, useTicker } from '../lib/time'
import { formatCountdown, secondsLeft } from '../lib/focus'
import { useFocusRun } from '../lib/queries/focus'
import { focusOnOpen } from '../lib/device'
import { TIMER_NOTE_MAX, useTimerNote, useTimerNotePreview, type NoteStatus } from '../lib/timerNote'
import type { ActiveTimer } from '../lib/types'

const NOTE_STATUS: Record<NoteStatus, string> = {
  idle: '',
  saving: 'сохраняется…',
  saved: 'сохранено',
  offline: 'сохранится, когда появится сеть',
}

/**
 * Плашка учёта (0.57). На телефоне — внизу, над таб-баром, на любом экране: остановить
 * учёт и оставить комментарий можно, не уходя со страницы. На широком экране — сверху,
 * как раньше: там внизу ничего нет и тянуться туда мышью дольше.
 */
export function ActiveTimerBar({ placement }: { placement: 'top' | 'bottom' }) {
  const { data: activeTimer } = useActiveTimer()
  const { data: task } = useTask(activeTimer?.task_id)
  const { data: parent } = useTask(task?.parent_id ?? undefined)
  const model = useGroupModel()
  const location = useLocation()
  const stopTimer = useStopTimer()
  const { showError } = useToast()
  const { data: run } = useFocusRun()
  const [noteOpen, setNoteOpen] = useState(false)
  useTicker(!!activeTimer)
  // учёт один на профиль: задача может быть из другого пространства — тогда подпись и
  // переход туда по нажатию
  const other = useOtherWorkspace(task?.workspace_id)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const notePreview = useTimerNotePreview(activeTimer)
  const focus = run?.state === 'running' && run.phase_kind === 'work' && run.task_id === activeTimer?.task_id ? run : null

  // подсказка о комментарии — когда учёт идёт уже пару минут: человек точно занят делом
  useTip(
    'timer-note',
    placement === 'bottom' && !!activeTimer && !!task && Date.now() - new Date(activeTimer.started_at).getTime() >= 120_000,
  )

  if (!activeTimer || !task) return null
  // в карточке идущей задачи свой закреп под шапкой — вторая плашка не нужна
  if (location.pathname === `/tasks/${task.id}`) return null

  const label = model.listLabel(task)
  const stop = () => {
    tap()
    stopTimer.mutate(undefined, { onError: (e) => showError(describeError(e)) })
  }
  const open = (e: React.MouseEvent) => {
    if (!other) return
    e.preventDefault()
    switchWorkspace(other.id, qc)
    navigate(`/tasks/${task.id}`)
  }

  const sub = notePreview ? (
    <span className="min-w-0 truncate">{notePreview}</span>
  ) : other ? (
    <>
      <ClientDot color={other.color} size={7} />
      <span className="min-w-0 truncate">в «{other.name}»</span>
    </>
  ) : parent || label ? (
    <>
      {!parent && <ClientDot color={model.colorOf(task)} size={7} />}
      <span className="min-w-0 truncate">{parent ? parent.name : label}</span>
    </>
  ) : (
    <span>{focus ? 'Фокус' : 'Идёт учёт'}</span>
  )
  const clock = focus ? formatCountdown(secondsLeft(focus)) : formatClock(activeTimer.started_at)

  const noteButton = (
    <button
      type="button"
      onClick={() => setNoteOpen(true)}
      aria-label="Комментарий"
      aria-haspopup="dialog"
      data-tip={placement === 'bottom' ? 'timer-note' : undefined}
      className="hit-44 relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface text-[var(--timer-text)]"
    >
      <Comment size={16} />
      {notePreview && <span className="absolute top-1 right-1 h-1.75 w-1.75 rounded-full border border-surface bg-accent" aria-hidden />}
    </button>
  )
  const sheet = <QuickNoteSheet open={noteOpen} onClose={() => setNoteOpen(false)} timer={activeTimer} taskId={task.id} taskName={task.name} />

  if (placement === 'bottom') {
    return (
      <div data-mini-bar className="mini-bar fixed inset-x-0 z-40 px-3 lg:hidden">
        <div className="mini-bar-pill mx-auto flex max-w-lg items-center gap-2.5 rounded-lg border border-[var(--timer-border)] py-1.5 pr-1.5 pl-3.5 shadow-popover">
          <span className="live-dot shrink-0" aria-hidden />
          <Link to={focus ? '/focus' : `/tasks/${task.id}`} onClick={open} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
            <span className="truncate text-sm font-medium text-text">{task.name}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-text-secondary">{sub}</span>
          </Link>
          <span className="tabular shrink-0 font-mono text-base font-medium text-[var(--timer-text)]" aria-label={focus ? 'До конца отрезка' : 'Идёт учёт'}>
            {clock}
          </span>
          {noteButton}
          <button
            type="button"
            onClick={stop}
            aria-label="Остановить учёт"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
          >
            <StopGlyph size={11} color="var(--on-accent)" />
          </button>
        </div>
        {createPortal(sheet, document.body)}
      </div>
    )
  }

  return (
    <div
      data-top-bar
      className="safe-top-box mx-4 mb-2 hidden items-center gap-3 rounded-md border border-[var(--timer-border)] bg-[var(--timer-bg)] px-3 py-2.5 lg:flex"
    >
      <Ring
        size={34}
        pct={sessionHourPct(activeTimer.started_at)}
        state="running"
        track="var(--timer-track)"
        centerBg="var(--timer-bg)"
        onClick={stop}
        ariaLabel="Остановить учёт"
      >
        <StopGlyph size={9} />
      </Ring>
      <Link to={`/tasks/${task.id}`} className="min-w-0 flex-1" onClick={open}>
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-[var(--timer-text)]">
          <span className="shrink-0">{focus ? 'Фокус' : 'Идёт учёт'}</span>
          {other ? (
            <>
              <span aria-hidden>·</span>
              <ClientDot color={other.color} size={7} />
              <span className="min-w-0 truncate">в «{other.name}»</span>
            </>
          ) : (
            <>
              {(parent || label) && <span aria-hidden>·</span>}
              {!parent && <ClientDot color={model.colorOf(task)} size={7} />}
              {(parent || label) && <span className="min-w-0 truncate">{parent ? parent.name : label}</span>}
            </>
          )}
        </span>
        <span className="block truncate text-base font-medium text-text">{task.name}</span>
        {notePreview && <span className="block truncate text-xs text-text-secondary">{notePreview}</span>}
      </Link>
      {noteButton}
      <Link
        to={focus ? '/focus' : `/tasks/${task.id}`}
        className="tabular shrink-0 font-mono text-lg font-medium text-[var(--timer-text)]"
        aria-label={focus ? 'До конца отрезка' : undefined}
      >
        {clock}
      </Link>
      {createPortal(sheet, document.body)}
    </div>
  )
}

/**
 * Комментарий с любого экрана: к идущему учёту (сохраняется сам и после остановки уходит
 * в историю задачи) или сразу к задаче — в её обсуждение.
 */
export function QuickNoteSheet({
  open,
  onClose,
  timer,
  taskId,
  taskName,
}: {
  open: boolean
  onClose: () => void
  timer: ActiveTimer
  taskId: string
  taskName: string
}) {
  const [mode, setMode] = useState<'timer' | 'task'>('timer')
  const { text, status, setText } = useTimerNote(timer)
  const [comment, setComment] = useState('')
  const addComment = useAddComment()
  const { showError, showSuccess } = useToast()

  const send = () => {
    const body = comment.trim()
    if (!body) return
    addComment.mutate(
      { taskId, body },
      {
        onError: (e) => showError(describeError(e)),
        onSuccess: () => {
          setComment('')
          showSuccess('Комментарий добавлен')
          onClose()
        },
      },
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Комментарий"
      headerAction={
        open && mode === 'timer' && NOTE_STATUS[status] ? (
          <span className={`text-sm ${status === 'saved' ? 'text-success-text' : 'text-text-secondary'}`} role="status">
            {NOTE_STATUS[status]}
          </span>
        ) : undefined
      }
    >
      <span className="-mt-2 truncate text-sm text-text-secondary">{taskName}</span>
      <Segmented
        stretch
        value={mode}
        onChange={setMode}
        options={[
          { value: 'timer', label: 'К учёту' },
          { value: 'task', label: 'К задаче' },
        ]}
      />
      {mode === 'timer' ? (
        <>
          <textarea
            autoFocus={focusOnOpen}
            rows={4}
            maxLength={TIMER_NOTE_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Что делаю сейчас"
            aria-label="Комментарий к учёту"
            className={`${fieldClass} h-auto resize-none py-2.5 leading-[1.5]`}
          />
          <span className="text-sm text-text-secondary">Сохраняется само. После остановки учёта попадёт в историю задачи.</span>
        </>
      ) : (
        <>
          <textarea
            autoFocus={focusOnOpen}
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Комментарий к задаче"
            aria-label="Комментарий к задаче"
            className={`${fieldClass} h-auto resize-none py-2.5 leading-[1.5]`}
          />
          <Button variant="primary" size="lg" onClick={send} loading={addComment.isPending} disabled={!comment.trim()}>
            Отправить
          </Button>
        </>
      )}
    </Sheet>
  )
}
