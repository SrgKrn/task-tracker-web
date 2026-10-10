import { useRef, useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'
import { Close, Paperclip, Plus } from './Icon'
import { FieldLabel } from './ui'
import { describeError, useToast } from '../lib/Toast'
import {
  useAttachments,
  useDeleteAttachment,
  useUploadAttachments,
  type AttachmentWithUrl,
} from '../lib/queries/attachments'

/** лимит хранилища на один файл */
const MAX_BYTES = 50 * 1024 * 1024

interface AttachmentsBlockProps {
  /**
   * Значение группы (проект, клиент…): блок его карточки показывает все файлы значения
   * и его задач, а новые кладёт в само значение.
   */
  itemId?: string
  /** задача, к которой ляжет новый файл (блок карточки задачи) */
  taskId?: string
  /** чьи файлы показывать: задача и её подзадачи или все задачи значения */
  taskIds?: string[]
  /** подписи задач — в карточке значения видно, откуда файл */
  taskNames?: Map<string, string>
  title?: string
  emptyText: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')
}

/** расширение плашкой: PDF, DOCX, JPG — читается быстрее любой иконки */
function kindOf(name: string): string {
  const m = name.match(/\.([a-z0-9]{1,5})$/i)
  return m ? m[1].toUpperCase() : 'ФАЙЛ'
}

export function AttachmentsBlock({
  itemId,
  taskId,
  taskIds,
  taskNames,
  title = 'Файлы',
  emptyText,
}: AttachmentsBlockProps) {
  const scope = taskId ? { taskIds: taskIds?.length ? taskIds : [taskId] } : { itemId, taskIds }
  const { data: files = [], isLoading } = useAttachments(scope)
  const upload = useUploadAttachments()
  const remove = useDeleteAttachment()
  const { showError, showSuccess } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [deleting, setDeleting] = useState<AttachmentWithUrl | null>(null)

  function onPick(list: FileList | null) {
    const picked = Array.from(list ?? [])
    if (inputRef.current) inputRef.current.value = ''
    if (picked.length === 0) return
    const tooBig = picked.find((f) => f.size > MAX_BYTES)
    if (tooBig) {
      showError(`«${tooBig.name}» больше 50 МБ — такой файл не поместится`)
      return
    }
    setProgress({ done: 0, total: picked.length })
    upload.mutate(
      {
        files: picked,
        itemId: itemId ?? null,
        taskId: taskId ?? null,
        onProgress: (done, total) => setProgress({ done, total }),
      },
      {
        onError: (e) => showError(describeError(e)),
        onSuccess: () => showSuccess(picked.length === 1 ? 'Файл добавлен' : `Добавлено файлов: ${picked.length}`),
        onSettled: () => setProgress(null),
      },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <FieldLabel>
          {title}
          {files.length > 0 ? ` · ${files.length}` : ''}
        </FieldLabel>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="-my-2 flex items-center gap-1.5 py-2 pl-3 text-xs font-medium text-sky-600 disabled:opacity-50"
        >
          <Plus size={14} />
          {progress ? `Загружаем ${progress.done + 1 > progress.total ? progress.total : progress.done + 1} из ${progress.total}…` : 'Добавить'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => onPick(e.target.files)}
        />
      </div>

      {files.length > 0 ? (
        <div
          className="flex flex-col overflow-hidden rounded-xl"
          style={{ background: 'var(--s-surface)', border: '1px solid var(--s-border)' }}
        >
          {files.map((f, i) => (
            <div
              key={f.id}
              className="flex items-center gap-3 py-2 pr-1 pl-3"
              style={i > 0 ? { borderTop: '1px solid var(--s-hairline-3)' } : undefined}
            >
              <span
                className="flex h-8 w-10 shrink-0 items-center justify-center rounded-md font-mono text-[9.5px] font-medium tracking-[.04em]"
                style={{ background: 'var(--s-surface-2)', border: '1px solid var(--s-border)', color: 'var(--color-slate-400)' }}
              >
                {kindOf(f.name)}
              </span>
              {/* ссылка готова заранее: окно, открытое после ожидания сервера, iPhone блокирует */}
              <a
                href={f.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1"
                onClick={(e) => {
                  if (!f.url) {
                    e.preventDefault()
                    showError('Ссылка на файл ещё не готова — попробуйте через секунду')
                  }
                }}
              >
                <span className="block truncate text-sm text-slate-100">{f.name}</span>
                <span className="block truncate font-mono text-2xs text-slate-500">
                  {formatSize(f.size)} · {formatDate(f.created_at)}
                  {taskNames && f.task_id && taskNames.get(f.task_id) ? ` · ${taskNames.get(f.task_id)}` : ''}
                  {taskNames && !f.task_id ? ' · база знаний' : ''}
                </span>
              </a>
              <button
                type="button"
                onClick={() => setDeleting(f)}
                aria-label={`Удалить «${f.name}»`}
                className="flex h-10 w-10 shrink-0 items-center justify-center text-slate-600"
              >
                <Close size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        !isLoading && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-12 items-center gap-2.5 rounded-xl px-3 text-left text-xs leading-[1.45] text-slate-500"
            style={{ border: '1px dashed var(--s-border-strong-2)' }}
          >
            <Paperclip size={15} />
            {emptyText}
          </button>
        )
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={`Удалить «${deleting?.name ?? ''}»?`}
        description="Файл удалится насовсем — и из задачи, и из карточек, где он виден."
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting, { onError: (e) => showError(describeError(e)) })
          setDeleting(null)
        }}
      />
    </div>
  )
}
