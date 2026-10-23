import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Comment } from './Icon'
import { Sheet, fieldClass } from './ui'
import { focusOnOpen } from '../lib/device'
import { TIMER_NOTE_MAX, useTimerNote, type NoteStatus } from '../lib/timerNote'
import type { ActiveTimer } from '../lib/types'

const STATUS: Record<NoteStatus, string> = {
  idle: '',
  saving: 'сохраняется…',
  saved: 'сохранено',
  offline: 'сохранится, когда появится сеть',
}

/** Окно комментария к идущему учёту: текст сохраняется сам, кнопки «Сохранить» нет. */
export function TimerNoteSheet({ open, onClose, timer }: { open: boolean; onClose: () => void; timer: ActiveTimer }) {
  const { text, status, setText } = useTimerNote(timer)
  // окно — в корень страницы: плашка учёта живёт в липкой полосе со своим слоем (z-40),
  // и изнутри неё окно оказывалось под нижней панелью вкладок
  return createPortal(
    <Sheet
      open={open}
      onClose={onClose}
      title="Комментарий к учёту"
      headerAction={
        open && STATUS[status] ? (
          <span className={`text-sm ${status === 'saved' ? 'text-success-text' : 'text-text-secondary'}`} role="status">
            {STATUS[status]}
          </span>
        ) : undefined
      }
    >
      <textarea
        autoFocus={focusOnOpen}
        rows={5}
        maxLength={TIMER_NOTE_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Что делаю сейчас"
        aria-label="Комментарий к учёту"
        className={`${fieldClass} h-auto resize-none py-2.5 leading-[1.5]`}
      />
      <span className="text-sm text-text-secondary">Сохраняется само. После остановки учёта попадёт в историю задачи.</span>
    </Sheet>,
    document.body,
  )
}

/** Кнопка комментария в плашке учёта: точка — комментарий уже есть. */
export function TimerNoteButton({ timer, className = '' }: { timer: ActiveTimer; className?: string }) {
  const [open, setOpen] = useState(false)
  const { text } = useTimerNote(timer)
  const has = text.trim().length > 0
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={has ? 'Изменить комментарий к учёту' : 'Комментарий к учёту'}
        data-tip="timer-note"
        aria-haspopup="dialog"
        className={`hit-44 relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--timer-border)] bg-surface text-[var(--timer-text)] ${className}`}
      >
        <Comment size={15} />
        {has && <span className="absolute top-1 right-1 h-1.75 w-1.75 rounded-full border border-surface bg-accent" aria-hidden />}
      </button>
      <TimerNoteSheet open={open} onClose={() => setOpen(false)} timer={timer} />
    </>
  )
}

/** Строка в карточке задачи, пока по ней идёт учёт (плашки там нет). */
export function TimerNoteRow({ timer }: { timer: ActiveTimer }) {
  const [open, setOpen] = useState(false)
  const { text } = useTimerNote(timer)
  const has = text.trim().length > 0
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        data-tip="timer-note"
        className="flex min-h-11 w-full items-center gap-2.5 rounded-sm border border-[var(--timer-border)] bg-[var(--timer-bg)] px-3 py-2 text-left"
      >
        <Comment size={15} className="shrink-0 text-[var(--timer-text)]" />
        <span className={`min-w-0 flex-1 truncate text-sm ${has ? 'text-text' : 'text-text-secondary'}`}>
          {has ? text : 'Комментарий к учёту'}
        </span>
      </button>
      <TimerNoteSheet open={open} onClose={() => setOpen(false)} timer={timer} />
    </>
  )
}
