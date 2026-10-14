import { Sheet, SheetActions } from './ui'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Подтверждение — тот же лист, что и остальные диалоги: фокус внутри, Esc и подложка
 * закрывают. Деструктивное действие — кнопка danger справа, «Отмена» слева от неё.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Удалить',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Sheet open={open} onClose={onCancel} title={title}>
      {description && <p className="text-base leading-[1.5] text-text-secondary">{description}</p>}
      <SheetActions onCancel={onCancel} onConfirm={onConfirm} confirmLabel={confirmLabel} danger={danger} />
    </Sheet>
  )
}
