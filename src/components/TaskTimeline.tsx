import { useEffect, useState } from 'react'
import { Overline, Sheet, SheetActions } from './ui'
import { useAttachments, type AttachmentWithUrl } from '../lib/queries/attachments'
import {
  useAddComment,
  useComments,
  useDeleteComment,
  useRestoreComment,
  useUpdateComment,
} from '../lib/queries/comments'
import { useSetEntryNote, useTimeEntries } from '../lib/queries/timer'
import { describeError, useToast } from '../lib/Toast'
import { entryNote } from '../lib/notes'
import { entrySeconds, formatDuration, plural } from '../lib/time'
import type { Comment, TimeEntry } from '../lib/types'
import { ArrowUp, Comment as CommentIcon, MoreDots } from './Icon'

const ADJUSTMENTS: [string, string, string] = ['правка', 'правки', 'правок']

type TimelineRow =
  | { kind: 'timer'; at: string; entry: TimeEntry }
  | { kind: 'adjustment'; at: string; entry: TimeEntry; count: number; seconds: number }
  | { kind: 'comment'; at: string; comment: Comment }
  | { kind: 'file'; at: string; file: AttachmentWithUrl }

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function clock(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : ''
}

/** «9 окт, 14:40–15:18 · 38 мин» — чтобы было видно, к какой именно сессии комментарий */
function entrySummary(entry: TimeEntry): string {
  const day = new Date(`${entry.effective_date}T00:00:00`)
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    .replace('.', '')
  const span = entry.entry_type === 'timer' && entry.started_at ? `, ${clock(entry.started_at)}–${clock(entry.ended_at)}` : ''
  return `${day}${span} · ${formatDuration(entrySeconds(entry))}`
}

export function TaskTimeline({ taskId, isRunning }: { taskId: string; isRunning: boolean }) {
  const [noting, setNoting] = useState<TimeEntry | null>(null)
  const [editing, setEditing] = useState<Comment | null>(null)
  const { data: entries = [] } = useTimeEntries(taskId)
  const { data: comments = [] } = useComments(taskId)
  const { data: files = [] } = useAttachments({ taskIds: [taskId] })

  /*
   * Ручные правки за день — одной строкой с суммой: пять нажатий «+15 мин» давали пять
   * одинаковых строк «Ручная правка: 15 мин». Правка со своим комментарием остаётся
   * отдельной строкой, чтобы комментарий было к чему показать. Нажатие на общую строку
   * открывает комментарий к последней правке дня.
   */
  const adjustmentsByDay = new Map<string, TimeEntry[]>()
  for (const e of entries) {
    if (e.entry_type !== 'manual_adjustment' || entryNote(e)) continue
    adjustmentsByDay.set(e.effective_date, [...(adjustmentsByDay.get(e.effective_date) ?? []), e])
  }
  const adjustmentRows = [...adjustmentsByDay.values()].map((list): TimelineRow => {
    const latest = list.reduce((a, b) => (b.created_at > a.created_at ? b : a))
    return {
      kind: 'adjustment',
      at: latest.created_at,
      entry: latest,
      count: list.length,
      seconds: list.reduce((sum, e) => sum + entrySeconds(e), 0),
    }
  })

  const rows: TimelineRow[] = [
    ...entries
      .filter((e) => e.entry_type === 'timer' || entryNote(e))
      .map((entry): TimelineRow =>
        entry.entry_type === 'timer'
          ? { kind: 'timer', at: entry.created_at, entry }
          : { kind: 'adjustment', at: entry.created_at, entry, count: 1, seconds: entrySeconds(entry) },
      ),
    ...adjustmentRows,
    ...comments.map((comment): TimelineRow => ({ kind: 'comment', at: comment.created_at, comment })),
    // файл — тоже событие в истории задачи: видно, когда пришёл договор или макет
    ...files.map((file): TimelineRow => ({ kind: 'file', at: file.created_at, file })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  return (
    <div className="mt-1 flex flex-col gap-[9px]">
      <Overline>Таймлайн</Overline>

      <div className="flex flex-col">
        {rows.map((row, i) => {
          const entry = row.kind === 'timer' || row.kind === 'adjustment' ? row.entry : null
          const note = entry ? entryNote(entry) : null
          return (
            <div
              key={i}
              className="flex items-start gap-[11px] py-[9px]"
              style={{ borderBottom: '1px solid var(--s-hairline-3)' }}
            >
              <span
                className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: isRunning && i === 0 ? 'var(--s-accent)' : 'var(--s-dot)' }}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {/* строка учёта целиком — цель нажатия: по ней открывается комментарий к ней */}
                {entry ? (
                  <button
                    type="button"
                    onClick={() => setNoting(entry)}
                    className="self-start text-left text-sm leading-[1.35] text-slate-300"
                  >
                    {row.kind === 'timer' ? 'Трекинг' : 'Ручная правка'}:{' '}
                    {formatDuration(row.kind === 'adjustment' ? row.seconds : entrySeconds(entry))}
                    {row.kind === 'adjustment' && row.count > 1 && (
                      <span className="text-slate-500"> · {plural(row.count, ADJUSTMENTS)} за день</span>
                    )}
                  </button>
                ) : row.kind === 'comment' ? (
                  // свой комментарий — нажатием править или удалить
                  <button
                    type="button"
                    onClick={() => setEditing(row.comment)}
                    className="self-start text-left text-sm leading-[1.35] text-slate-300"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {row.comment.body}
                  </button>
                ) : (
                  <p className="text-sm leading-[1.35] text-slate-300">
                    {row.kind === 'file' && (
                      <a href={row.file.url ?? undefined} target="_blank" rel="noopener noreferrer" className="text-brass-600">
                        Файл «{row.file.name}»
                      </a>
                    )}
                  </p>
                )}
                {/* комментарий к самой сессии — под ней, нажатием правится */}
                {entry && note && (
                  <button
                    type="button"
                    onClick={() => setNoting(entry)}
                    className="self-start rounded-[9px] px-2.5 py-1.5 text-left text-xs leading-[1.45] text-slate-300"
                    style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-hairline)', overflowWrap: 'anywhere' }}
                  >
                    «{note}»
                  </button>
                )}
              </div>
              <span className="shrink-0 font-mono text-2xs leading-[1.4] text-slate-600">
                {formatDateTime(row.at)}
              </span>
              {entry && (
                <button
                  type="button"
                  onClick={() => setNoting(entry)}
                  aria-label={note ? 'Изменить комментарий к сессии' : 'Комментарий к сессии'}
                  title="Комментарий к этой строке"
                  className="hit-44 -my-0.5 flex h-5 w-5 shrink-0 items-center justify-center"
                  style={{ color: note ? 'var(--s-accent-text)' : 'var(--s-placeholder)' }}
                >
                  <CommentIcon size={14} />
                </button>
              )}
              {row.kind === 'comment' && (
                <button
                  type="button"
                  onClick={() => setEditing(row.comment)}
                  aria-label="Изменить или удалить комментарий"
                  className="hit-44 -my-0.5 flex h-5 w-5 shrink-0 items-center justify-center"
                  style={{ color: 'var(--s-placeholder)' }}
                >
                  <MoreDots size={14} />
                </button>
              )}
              {!entry && row.kind !== 'comment' && <span className="w-5 shrink-0" />}
            </div>
          )
        })}
        {rows.length === 0 && <p className="py-2 text-sm text-slate-600">Пока ничего нет.</p>}
      </div>

      <EntryNoteSheet entry={noting} onClose={() => setNoting(null)} />
      <CommentSheet comment={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

/** Комментарий к одной строке учёта: что делалось именно в эти полчаса. */
function EntryNoteSheet({ entry, onClose }: { entry: TimeEntry | null; onClose: () => void }) {
  const setNote = useSetEntryNote()
  const { showError } = useToast()
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (entry) setDraft(entryNote(entry) ?? '')
  }, [entry])

  if (!entry) return null
  const save = (note: string) =>
    setNote.mutate({ entry, note }, { onError: (e) => showError(describeError(e)), onSuccess: onClose })

  return (
    <Sheet
      open
      onClose={onClose}
      title={entry.entry_type === 'timer' ? 'Комментарий к сессии' : 'Комментарий к правке'}
    >
      <span className="-mt-2 font-mono text-xs text-slate-500">{entrySummary(entry)}</span>
      <textarea
        autoFocus
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Что делали в это время"
        className="resize-none rounded-[14px] px-3.5 py-3 text-sm leading-[1.5] text-slate-100 placeholder:text-[var(--s-placeholder)]"
        style={{ background: 'var(--s-input)', border: '1px solid var(--s-border-strong)' }}
      />
      {entryNote(entry) && (
        <button type="button" onClick={() => save('')} className="-my-1 self-start py-1 text-xs text-terra-400">
          Удалить комментарий
        </button>
      )}
      <SheetActions
        onCancel={onClose}
        onConfirm={() => save(draft)}
        confirmLabel="Сохранить"
        confirmDisabled={setNote.isPending || draft.trim() === (entryNote(entry) ?? '')}
      />
    </Sheet>
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
        className="h-[42px] min-w-0 flex-1 rounded-full px-4 text-sm text-slate-100 placeholder:text-[var(--s-placeholder)]"
        style={{ background: 'var(--s-input-2)', border: '1px solid var(--s-border-strong)' }}
      />
      <button
        type="button"
        onClick={submit}
        aria-label="Добавить комментарий"
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-lg"
        style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
      >
        <ArrowUp size={16} className="mx-auto" />
      </button>
    </div>
  )
}

/** Комментарий отдельной строкой: поправить текст или удалить — с возможностью вернуть. */
function CommentSheet({ comment, onClose }: { comment: Comment | null; onClose: () => void }) {
  const update = useUpdateComment()
  const remove = useDeleteComment()
  const restore = useRestoreComment()
  const { showError, showSuccess } = useToast()
  const onError = (e: unknown) => showError(describeError(e))
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (comment) setDraft(comment.body)
  }, [comment])

  if (!comment) return null
  const changed = draft.trim() !== comment.body.trim()

  return (
    <Sheet open onClose={onClose} title="Комментарий">
      <span className="-mt-2 font-mono text-xs text-slate-500">{formatDateTime(comment.created_at)}</span>
      <textarea
        autoFocus
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className="resize-none rounded-[14px] px-3.5 py-3 text-sm leading-[1.5] text-slate-100"
        style={{ background: 'var(--s-input)', border: '1px solid var(--s-border-strong)' }}
      />
      <button
        type="button"
        onClick={() => {
          onClose()
          remove.mutate(comment, {
            onError,
            onSuccess: () =>
              showSuccess('Комментарий удалён', {
                label: 'Вернуть',
                onAction: () => restore.mutate(comment, { onError }),
              }),
          })
        }}
        className="-my-1 self-start py-1 text-xs text-terra-400"
      >
        Удалить комментарий
      </button>
      <SheetActions
        onCancel={onClose}
        onConfirm={() =>
          update.mutate({ comment, body: draft.trim() }, { onError, onSuccess: onClose })
        }
        confirmLabel="Сохранить"
        confirmDisabled={update.isPending || !changed || !draft.trim()}
      />
    </Sheet>
  )
}
