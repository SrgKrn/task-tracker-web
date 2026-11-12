import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePopoverMode } from './Popover'
import { namePastedFiles } from '../lib/pastedFiles'
import { ConfirmDialog } from './ConfirmDialog'
import { Close, Drive, Paperclip, Plus } from './Icon'
import { FieldLabel, MOD_KEY } from './ui'
import { describeError, useToast } from '../lib/Toast'
import { pickFromDrive, useGoogleStatus } from '../lib/google'
import { useGate } from './Upgrade'
import { planLimitMessage } from '../lib/limits'
import {
  useAddDriveFiles,
  useAttachments,
  useDeleteAttachment,
  useUploadAttachments,
  type AttachmentWithUrl,
  useStorageUsed,
} from '../lib/queries/attachments'

/** лимит хранилища на один файл */
const MB = 1024 * 1024
/** предел хранилища на один файл; тариф может ограничить сильнее */
const MAX_BYTES = 50 * MB

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
  /** null — без подписи: заголовок у раздела снаружи */
  title?: string | null
  emptyText: string
  /** папка проекта на Диске: окно выбора откроется в ней */
  driveFolderId?: string | null
  /**
   * Компьютер (0.65): файлы можно бросить на всю карточку (ближайший .task-detail-pane),
   * а снимок экрана — вставить через Ctrl+V, пока карточка открыта.
   */
  catchFiles?: boolean
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
  driveFolderId,
  catchFiles = false,
}: AttachmentsBlockProps) {
  const scope = taskId ? { taskIds: taskIds?.length ? taskIds : [taskId] } : { itemId, taskIds }
  const { data: files = [], isLoading } = useAttachments(scope)
  const upload = useUploadAttachments()
  const remove = useDeleteAttachment()
  const addDrive = useAddDriveFiles()
  const { data: google } = useGoogleStatus()
  const driveReady = !!google?.linked?.drive && !!google.apiKey
  const { showError, showSuccess } = useToast()
  const gate = useGate()
  const { data: used = 0 } = useStorageUsed()
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [deleting, setDeleting] = useState<AttachmentWithUrl | null>(null)
  const desktop = usePopoverMode()
  const catching = catchFiles && desktop
  const rootRef = useRef<HTMLDivElement>(null)
  /** куда бросают файлы: рамка поверх карточки, пока их держат над ней */
  const [dropRect, setDropRect] = useState<DOMRect | null>(null)
  const pickRef = useRef(onPick)
  useEffect(() => {
    pickRef.current = onPick
  })

  useEffect(() => {
    if (!catching) return
    const zone = rootRef.current?.closest<HTMLElement>('.task-detail-pane')
    if (!zone) return
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')
    const reset = () => {
      depth = 0
      setDropRect(null)
    }
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth += 1
      setDropRect(zone.getBoundingClientRect())
    }
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDropRect(null)
    }
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      reset()
      pickRef.current(Array.from(e.dataTransfer?.files ?? []))
    }
    // снимок экрана из буфера; текст в поле ввода вставляется как обычно
    const paste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? [])
      if (files.length === 0 || document.querySelector('[aria-modal="true"]')) return
      const target = e.target as HTMLElement | null
      const editable = !!target?.closest('input, textarea, [contenteditable="true"]')
      if (editable && e.clipboardData?.types.includes('text/plain')) return
      e.preventDefault()
      pickRef.current(namePastedFiles(files))
    }
    zone.addEventListener('dragenter', enter)
    zone.addEventListener('dragover', over)
    zone.addEventListener('dragleave', leave)
    zone.addEventListener('drop', drop)
    window.addEventListener('dragend', reset)
    document.addEventListener('paste', paste)
    return () => {
      zone.removeEventListener('dragenter', enter)
      zone.removeEventListener('dragover', over)
      zone.removeEventListener('dragleave', leave)
      zone.removeEventListener('drop', drop)
      window.removeEventListener('dragend', reset)
      document.removeEventListener('paste', paste)
    }
  }, [catching])

  function onPick(list: FileList | File[] | null) {
    const picked = Array.from(list ?? [])
    if (inputRef.current) inputRef.current.value = ''
    if (picked.length === 0) return
    // по тарифу (если загрузился), но не больше, чем примет хранилище
    const L = gate.plan?.limits
    const fileMax = Math.min(MAX_BYTES, L?.file_mb != null ? L.file_mb * MB : MAX_BYTES)
    const tooBig = picked.find((f) => f.size > fileMax)
    if (tooBig) {
      showError(
        fileMax < MAX_BYTES
          ? planLimitMessage('plan_limit:file_mb') ?? `«${tooBig.name}» слишком большой`
          : `«${tooBig.name}» больше ${MAX_BYTES / MB} МБ — такой файл не поместится`,
      )
      return
    }
    if (L?.storage_mb != null && used + picked.reduce((s, f) => s + f.size, 0) > L.storage_mb * MB) {
      showError(planLimitMessage('plan_limit:storage_mb') ?? 'Место под файлы закончилось')
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

  /** файлы из Google Диска — ссылкой, без копии и без ограничения размера */
  async function onPickDrive() {
    if (!google) return
    try {
      const picked = await pickFromDrive(google, { startIn: driveFolderId })
      if (picked.length === 0) return
      addDrive.mutate(
        { files: picked, itemId: itemId ?? null, taskId: taskId ?? null },
        {
          onError: (e) => showError(describeError(e)),
          onSuccess: () => showSuccess(picked.length === 1 ? 'Файл из Диска добавлен' : `Добавлено из Диска: ${picked.length}`),
        },
      )
    } catch (e) {
      showError(describeError(e))
    }
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        {title !== null ? (
          <FieldLabel>
            {title}
            {files.length > 0 ? ` · ${files.length}` : ''}
          </FieldLabel>
        ) : (
          // заголовок — у раздела карточки (0.67); здесь только сколько файлов
          <span className="tabular font-mono text-xs text-text-secondary">{files.length > 0 ? files.length : ''}</span>
        )}
        <span className="flex items-center gap-3">
          {driveReady && (
            <button
              type="button"
              onClick={onPickDrive}
              disabled={addDrive.isPending}
              className="-my-2 flex items-center gap-1.5 py-2 pl-3 text-sm font-medium text-accent-text disabled:opacity-50"
            >
              <Drive size={14} />
              Из Диска
            </button>
          )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="-my-2 flex items-center gap-1.5 py-2 pl-3 text-sm font-medium text-accent-text disabled:opacity-50"
        >
          <Plus size={14} />
          {progress ? `Загружаем ${progress.done + 1 > progress.total ? progress.total : progress.done + 1} из ${progress.total}…` : 'Добавить'}
        </button>
        </span>
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
          className="flex flex-col overflow-hidden rounded-sm"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        >
          {files.map((f, i) => (
            <div
              key={f.id}
              className="flex items-center gap-3 py-2 pr-1 pl-3"
              style={i > 0 ? { borderTop: '1px solid var(--divider)' } : undefined}
            >
              <span
                className="flex h-8 w-10 shrink-0 items-center justify-center rounded-sm font-mono text-xs font-medium tracking-[.04em]"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                {f.drive_file_id ? <Drive size={14} /> : kindOf(f.name)}
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
                <span className="block truncate text-base text-text">{f.name}</span>
                <span className="block truncate font-mono text-xs text-text-secondary">
                  {f.drive_file_id ? 'Google Диск' : formatSize(f.size)} · {formatDate(f.created_at)}
                  {taskNames && f.task_id && taskNames.get(f.task_id) ? ` · ${taskNames.get(f.task_id)}` : ''}
                  {taskNames && !f.task_id ? ' · база знаний' : ''}
                </span>
              </a>
              <button
                type="button"
                onClick={() => setDeleting(f)}
                aria-label={`Удалить «${f.name}»`}
                className="flex h-10 w-10 shrink-0 items-center justify-center text-text-secondary"
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
            className="flex min-h-12 items-center gap-2.5 rounded-sm px-3 text-left text-sm leading-[1.45] text-text-secondary"
            style={{ border: '1px dashed var(--border-strong)' }}
          >
            <Paperclip size={15} />
            {emptyText}
          </button>
        )
      )}
      {catching && (
        <span className="text-xs text-text-tertiary">Перетащите файлы на карточку или вставьте снимок экрана — {MOD_KEY}+V</span>
      )}

      {dropRect &&
        createPortal(
          <div
            className="file-drop-overlay"
            style={{ top: dropRect.top + 8, left: dropRect.left + 8, width: dropRect.width - 16, height: dropRect.height - 16 }}
            aria-hidden
          >
            <span className="flex flex-col items-center gap-2">
              <Paperclip size={22} />
              <span className="text-base font-semibold">Отпустите — файлы лягут в задачу</span>
            </span>
          </div>,
          document.body,
        )}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting?.drive_file_id ? `Убрать «${deleting?.name ?? ''}»?` : `Удалить «${deleting?.name ?? ''}»?`}
        description={
          deleting?.drive_file_id
            ? 'Уберётся только ссылка — сам файл останется на Google Диске.'
            : 'Файл удалится насовсем — и из задачи, и из карточек, где он виден.'
        }
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting, { onError: (e) => showError(describeError(e)) })
          setDeleting(null)
        }}
      />
    </div>
  )
}
