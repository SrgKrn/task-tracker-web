interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Удалить',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ background: 'rgba(5,5,7,.62)' }}
      onClick={onCancel}
    >
      <div
        className="safe-bottom w-full max-w-sm p-5 sm:rounded-[28px]"
        style={{
          background: 'var(--s-surface-2)',
          border: '1px solid var(--s-border-strong)',
          borderRadius: '28px 28px 44px 44px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold leading-[1.2] text-slate-100">{title}</h2>
        {description && <p className="mt-2 text-sm leading-[1.5] text-slate-400">{description}</p>}
        <div className="mt-5 flex gap-[9px]">
          <button
            onClick={onCancel}
            className="h-12 flex-1 rounded-[15px] text-sm font-medium text-slate-300"
            style={{ border: '1px solid var(--s-border-strong-2)' }}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="h-12 flex-1 rounded-[15px] text-sm font-semibold"
            style={{
              background: danger ? 'var(--s-danger)' : 'var(--s-accent)',
              color: 'var(--s-on-accent)',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
