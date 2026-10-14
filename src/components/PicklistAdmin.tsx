import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from './ConfirmDialog'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronUp, Close } from './Icon'
import { Button, fieldClass } from './ui'

interface Item {
  id: string
  sort_order: number
}

interface PicklistAdminProps<T extends Item> {
  title: string
  placeholder: string
  items: T[]
  loading?: boolean
  labelOf: (item: T) => string
  onCreate: (name: string) => void
  onUpdate: (id: string, name: string) => void
  onDelete: (id: string) => void
  onReorder: (items: T[]) => void
  /** optional "this item marks something done" flag, e.g. statuses.is_final */
  finalOf?: (item: T) => boolean
  onToggleFinal?: (item: T, value: boolean) => void
  /** optional archive flag: a soft alternative to deleting something tasks still reference */
  archivedOf?: (item: T) => boolean
  onToggleArchived?: (item: T, value: boolean) => void
  /** when provided, adds a "view tasks in this bucket" affordance per row */
  onOpen?: (item: T) => void
  /** куда ведёт «назад» и как он подписан */
  backTo?: string
  backLabel?: string
  /** что показать между заголовком и полем добавления (настройки группы) */
  header?: ReactNode
  /** что показать под списком (удаление группы) */
  footer?: ReactNode
  /** подпись над списком значений */
  listTitle?: string
  /** вторая строка под названием (во что входит значение) */
  extraOf?: (item: T) => ReactNode
  /** перед названием (цвет значения) */
  leadingOf?: (item: T) => ReactNode
}

export function PicklistAdmin<T extends Item>({
  title,
  placeholder,
  items,
  loading = false,
  labelOf,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
  finalOf,
  onToggleFinal,
  archivedOf,
  onToggleArchived,
  onOpen,
  backTo = '/settings',
  backLabel = 'Ещё',
  header,
  footer,
  listTitle,
  extraOf,
  leadingOf,
}: PicklistAdminProps<T>) {
  const navigate = useNavigate()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [deletingItem, setDeletingItem] = useState<T | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const archivedCount = archivedOf ? items.filter(archivedOf).length : 0
  const visibleItems = archivedOf && !showArchived ? items.filter((i) => !archivedOf(i)) : items

  function handleCreate() {
    const name = newName.trim()
    if (!name) return
    onCreate(name)
    setNewName('')
  }

  function startEdit(item: T) {
    setEditingId(item.id)
    setEditingValue(labelOf(item))
  }

  function commitEdit() {
    if (editingId && editingValue.trim()) {
      onUpdate(editingId, editingValue.trim())
    }
    setEditingId(null)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= items.length) return
    const reordered = [...items]
    const [item] = reordered.splice(index, 1)
    reordered.splice(target, 0, item)
    onReorder(reordered)
  }

  return (
    <div className="safe-top-page mx-auto max-w-lg px-5 pt-3.5 pb-2 lg:max-w-2xl">
      <button onClick={() => navigate(backTo)} className="mb-4 flex items-center gap-2 text-base text-text-secondary">
        <ArrowLeft size={15} />
        {backLabel}
      </button>
      <h1 className="mb-4 text-xl font-semibold leading-[1.1] tracking-[-.02em] text-text">{title}</h1>

      {header}

      {listTitle && (
        <span className="mb-2 block text-sm font-medium text-text-secondary">
          {listTitle}
        </span>
      )}

      <div className="mb-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder={placeholder}
          className={`${fieldClass} min-w-0 flex-1`}
        />
        <Button variant="primary" className="shrink-0" onClick={handleCreate}>
          Добавить
        </Button>
      </div>

      {archivedOf && archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="mb-1 py-2.5 text-sm text-text-secondary"
        >
          {showArchived ? 'Скрыть архив' : `Показать архив (${archivedCount})`}
        </button>
      )}

      <ul className="space-y-2">
        {visibleItems.map((item) => {
          const index = items.indexOf(item)
          const archived = archivedOf?.(item) ?? false
          return (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2.5 lg:hover:bg-surface-hover"
              style={archived ? { opacity: 0.55 } : undefined}
            >
              <div className="flex flex-col text-xs leading-none lg:flex-row lg:gap-1">
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="flex h-6 w-6 items-center justify-center text-text-secondary disabled:opacity-20"
                  aria-label="Переместить выше"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === items.length - 1}
                  className="flex h-6 w-6 items-center justify-center text-text-secondary disabled:opacity-20"
                  aria-label="Переместить ниже"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              {leadingOf?.(item)}

              <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                {editingId === item.id ? (
                  <input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                    className="w-full min-w-0 rounded-sm border border-accent bg-surface px-2 py-1 text-base text-text"
                  />
                ) : (
                  <button
                    onClick={() => startEdit(item)}
                    title={labelOf(item)}
                    className="w-full min-w-0 truncate text-left text-base text-text"
                  >
                    {labelOf(item)}
                  </button>
                )}
                {extraOf?.(item)}
              </div>

              {onOpen && (
                <button
                  onClick={() => onOpen(item)}
                  className="hit-44 shrink-0 px-1 text-text-secondary active:text-accent-text"
                  aria-label="Открыть задачи"
                >
                  <ArrowRight size={15} className="mx-auto" />
                </button>
              )}

              {finalOf && onToggleFinal && (
                <label className="flex shrink-0 items-center gap-1.5 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={finalOf(item)}
                    onChange={(e) => onToggleFinal(item, e.target.checked)}
                    className="accent-accent"
                  />
                  Финальный
                </label>
              )}

              {archivedOf && onToggleArchived && (
                <button
                  onClick={() => onToggleArchived(item, !archived)}
                  className="-my-2.5 shrink-0 py-2.5 text-sm text-text-secondary active:text-accent-text"
                >
                  {archived ? 'Вернуть' : 'В архив'}
                </button>
              )}

              <button
                onClick={() => setDeletingItem(item)}
                className="hit-44 shrink-0 px-1 text-danger-text active:text-danger"
                aria-label="Удалить"
              >
                <Close size={15} className="mx-auto" />
              </button>
            </li>
          )
        })}
        {visibleItems.length === 0 && (
          <li className="py-4 text-center text-base text-text-secondary">
            {loading ? 'Загрузка…' : 'Пока пусто.'}
          </li>
        )}
      </ul>

      {footer}

      <ConfirmDialog
        open={deletingItem !== null}
        title={`Удалить «${deletingItem ? labelOf(deletingItem) : ''}»?`}
        onCancel={() => setDeletingItem(null)}
        onConfirm={() => {
          if (deletingItem) onDelete(deletingItem.id)
          setDeletingItem(null)
        }}
      />
    </div>
  )
}
