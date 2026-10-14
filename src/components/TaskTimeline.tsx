import { useEffect, useState } from 'react'
import { EmptyState, Overline, Sheet, SheetActions, fieldClass } from './ui'
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
import { formatShortDate, toDateString, todayStr, addDays } from '../lib/period'
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

/** «Сегодня», «Вчера», иначе «пн, 13 окт» */
function dayTitle(day: string): string {
  const today = todayStr()
  if (day === today) return 'Сегодня'
  if (day === addDays(today, -1)) return 'Вчера'
  return formatShortDate(day)
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
  ]

  /*
   * История по дням: заголовок дня с суммой учёта, в строках — только время. Раньше это
   * была сплошная лента с «14.10, 18:14» у каждой строки, и сколько ушло за день, не
   * было видно вовсе. День записи учёта — день, к которому она засчитана.
   */
  const dayOf = (row: TimelineRow) =>
    row.kind === 'timer' || row.kind === 'adjustment' ? row.entry.effective_date : toDateString(new Date(row.at))
  rows.sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || b.at.localeCompare(a.at))
  const days: { day: string; seconds: number; rows: TimelineRow[] }[] = []
  for (const row of rows) {
    const day = dayOf(row)
    let group = days[days.length - 1]
    if (!group || group.day !== day) {
      group = { day, seconds: 0, rows: [] }
      days.push(group)
    }
    group.rows.push(row)
    if (row.kind === 'timer') group.seconds += entrySeconds(row.entry)
    if (row.kind === 'adjustment') group.seconds += row.seconds
  }
  const firstRow = rows[0]

  return (
    <div className="mt-1 flex flex-col gap-4">
      {days.map((group) => (
        <section key={group.day} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <Overline className="first-letter:uppercase">{dayTitle(group.day)}</Overline>
            {group.seconds !== 0 && (
              <span className="tabular font-mono text-xs text-text-secondary">{formatDuration(group.seconds)}</span>
            )}
          </div>
          <div className="flex flex-col divide-y divide-divider rounded-md border border-border bg-surface px-3">
            {group.rows.map((row, i) => {
              const entry = row.kind === 'timer' || row.kind === 'adjustment' ? row.entry : null
              const note = entry ? entryNote(entry) : null
              return (
                <div key={i} className="flex items-start gap-2.5 py-2.5">
                  <span
                    className="mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: isRunning && row === firstRow ? 'var(--accent)' : 'var(--border-strong)' }}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {/* строка учёта целиком — цель нажатия: по ней открывается комментарий к ней */}
                    {entry ? (
                      <button
                        type="button"
                        onClick={() => setNoting(entry)}
                        className="self-start text-left text-base leading-[1.4] text-text"
                      >
                        {row.kind === 'timer' ? 'Учёт' : 'Правка'}{' '}
                        <span className="tabular font-mono text-sm">
                          {formatDuration(row.kind === 'adjustment' ? row.seconds : entrySeconds(entry))}
                        </span>
                        {row.kind === 'adjustment' && row.count > 1 && (
                          <span className="text-text-secondary"> · {plural(row.count, ADJUSTMENTS)} за день</span>
                        )}
                      </button>
                    ) : row.kind === 'comment' ? (
                      // свой комментарий — нажатием править или удалить
                      <button
                        type="button"
                        onClick={() => setEditing(row.comment)}
                        className="self-start text-left text-base leading-[1.4] text-text"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        {row.comment.body}
                      </button>
                    ) : (
                      <p className="text-base leading-[1.4] text-text">
                        {row.kind === 'file' && (
                          <a href={row.file.url ?? undefined} target="_blank" rel="noopener noreferrer" className="text-accent-text">
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
                        className="self-start rounded-sm bg-surface-sunken px-2.5 py-1.5 text-left text-sm leading-[1.45] text-text"
                        style={{ overflowWrap: 'anywhere' }}
                      >
                        «{note}»
                      </button>
                    )}
                  </div>
                  <span className="tabular shrink-0 pt-0.5 font-mono text-xs leading-[1.4] text-text-secondary">
                    {row.kind === 'timer' && entry?.started_at ? clock(entry.started_at) : clock(row.at)}
                  </span>
                  {entry && (
                    <button
                      type="button"
                      onClick={() => setNoting(entry)}
                      aria-label={note ? 'Изменить комментарий к записи' : 'Комментарий к записи'}
                      title="Комментарий к этой строке"
                      className={`hit-44 flex h-5 w-5 shrink-0 items-center justify-center ${note ? 'text-accent-text' : 'text-text-tertiary'}`}
                    >
                      <CommentIcon size={14} />
                    </button>
                  )}
                  {row.kind === 'comment' && (
                    <button
                      type="button"
                      onClick={() => setEditing(row.comment)}
                      aria-label="Изменить или удалить комментарий"
                      className="hit-44 flex h-5 w-5 shrink-0 items-center justify-center text-text-tertiary"
                    >
                      <MoreDots size={14} />
                    </button>
                  )}
                  {!entry && row.kind !== 'comment' && <span className="w-5 shrink-0" />}
                </div>
              )
            })}
          </div>
        </section>
      ))}
      {rows.length === 0 && (
        <EmptyState title="Истории пока нет">Здесь появятся сессии учёта, правки, комментарии и файлы.</EmptyState>
      )}

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
      <span className="-mt-2 font-mono text-sm text-text-secondary">{entrySummary(entry)}</span>
      <textarea
        autoFocus
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Что делали в это время"
        className={`${fieldClass} h-auto resize-none py-2.5 leading-[1.5]`}
      />
      {entryNote(entry) && (
        <button type="button" onClick={() => save('')} className="min-h-11 self-start text-sm font-medium text-danger-text">
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
      className="safe-bottom flex items-center gap-2 border-t border-border bg-surface px-4 pt-3 pb-2"
    >
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Комментарий"
        aria-label="Комментарий к задаче"
        className="h-11 min-w-0 flex-1 rounded-full border border-border bg-surface-sunken px-4 text-[length:var(--input-size)] text-text placeholder:text-text-tertiary"
      />
      <button
        type="button"
        onClick={submit}
        aria-label="Добавить комментарий"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent"
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
      <span className="-mt-2 font-mono text-sm text-text-secondary">{formatDateTime(comment.created_at)}</span>
      <textarea
        autoFocus
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        className={`${fieldClass} h-auto resize-none py-2.5 leading-[1.5]`}
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
        className="min-h-11 self-start text-sm font-medium text-danger-text"
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
