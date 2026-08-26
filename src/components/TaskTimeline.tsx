import { useState } from 'react'
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

export function TaskTimeline({ taskId }: { taskId: string }) {
  const { data: entries = [] } = useTimeEntries(taskId)
  const { data: comments = [] } = useComments(taskId)
  const addComment = useAddComment()
  const { showError } = useToast()
  const [draft, setDraft] = useState('')

  const rows: TimelineRow[] = [
    ...entries.map((entry): TimelineRow =>
      entry.entry_type === 'timer'
        ? { kind: 'timer', at: entry.created_at, entry }
        : { kind: 'adjustment', at: entry.created_at, entry },
    ),
    ...comments.map((comment): TimelineRow => ({ kind: 'comment', at: comment.created_at, comment })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  function submitComment() {
    const body = draft.trim()
    if (!body) return
    addComment.mutate(
      { taskId, body },
      { onError: (e) => showError(describeError(e)), onSuccess: () => setDraft('') },
    )
  }

  return (
    <div className="mt-6">
      <h2 className="mb-2 text-sm font-medium text-slate-400">Таймлайн</h2>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start justify-between gap-3 text-sm">
            <p className="text-slate-300">
              {row.kind === 'timer' && `Трекинг: ${formatMinutes(row.entry.duration_minutes)}`}
              {row.kind === 'adjustment' && `Ручная правка: ${formatMinutes(row.entry.duration_minutes)}`}
              {row.kind === 'comment' && row.comment.body}
            </p>
            <span className="shrink-0 text-xs text-slate-500">{formatDateTime(row.at)}</span>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-500">Пока ничего нет.</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submitComment()}
          placeholder="Добавить комментарий"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
        <button
          onClick={submitComment}
          className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-slate-900 active:bg-sky-700"
        >
          Добавить
        </button>
      </div>
    </div>
  )
}
