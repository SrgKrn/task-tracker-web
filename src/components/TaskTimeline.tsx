import { useState } from 'react'
import { Overline } from './ui'
import { useAddComment, useComments } from '../lib/queries/comments'
import { useTimeEntries } from '../lib/queries/timer'
import { describeError, useToast } from '../lib/Toast'
import type { Comment, TimeEntry } from '../lib/types'

type TimelineRow =
  | { kind: 'timer'; at: string; entry: TimeEntry }
  | { kind: 'adjustment'; at: string; entry: TimeEntry }
  | { kind: 'comment'; at: string; comment: Comment }

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatMinutes(minutes: number): string {
  const sign = minutes < 0 ? '−' : ''
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `${sign}${h > 0 ? `${h} ч ` : ''}${m} мин`
}

export function TaskTimeline({ taskId, isRunning }: { taskId: string; isRunning: boolean }) {
  const { data: entries = [] } = useTimeEntries(taskId)
  const { data: comments = [] } = useComments(taskId)

  const rows: TimelineRow[] = [
    ...entries.map((entry): TimelineRow =>
      entry.entry_type === 'timer'
        ? { kind: 'timer', at: entry.created_at, entry }
        : { kind: 'adjustment', at: entry.created_at, entry },
    ),
    ...comments.map((comment): TimelineRow => ({ kind: 'comment', at: comment.created_at, comment })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="mt-1 flex flex-col gap-[9px]">
      <Overline>Таймлайн</Overline>

      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex items-start gap-[11px] py-[9px]"
            style={{ borderBottom: '1px solid var(--s-hairline-3)' }}
          >
            <span
              className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: isRunning && i === 0 ? 'var(--s-accent)' : '#3a3a42' }}
            />
            <p className="flex-1 text-sm leading-[1.35] text-slate-300">
              {row.kind === 'timer' && `Трекинг: ${formatMinutes(row.entry.duration_minutes)}`}
              {row.kind === 'adjustment' && `Ручная правка: ${formatMinutes(row.entry.duration_minutes)}`}
              {row.kind === 'comment' && row.comment.body}
            </p>
            <span className="shrink-0 font-mono text-2xs leading-[1.4] text-slate-600">
              {formatDateTime(row.at)}
            </span>
          </div>
        ))}
        {rows.length === 0 && <p className="py-2 text-sm text-slate-600">Пока ничего нет.</p>}
      </div>
    </div>
  )
}

/** Поле комментария, закреплённое внизу карточки. */
export function CommentBar({ taskId }: { taskId: string }) {
  const addComment = useAddComment()
  const { showError } = useToast()
  const [draft, setDraft] = useState('')

  function submit() {
    const body = draft.trim()
    if (!body) return
    addComment.mutate(
      { taskId, body },
      { onError: (e) => showError(describeError(e)), onSuccess: () => setDraft('') },
    )
  }

  return (
    <div
      className="safe-bottom flex items-center gap-[9px] px-4 pt-3 pb-2"
      style={{ borderTop: '1px solid var(--s-hairline-2)', background: 'var(--s-chrome)' }}
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Комментарий"
        className="h-[42px] min-w-0 flex-1 rounded-full px-4 text-sm text-slate-100 placeholder:text-[#83838c]"
        style={{ background: '#17171c', border: '1px solid var(--s-border-strong)' }}
      />
      <button
        type="button"
        onClick={submit}
        aria-label="Добавить комментарий"
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-lg"
        style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
      >
        ↑
      </button>
    </div>
  )
}
