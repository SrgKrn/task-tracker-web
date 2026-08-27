import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog } from './ConfirmDialog'

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
  /** when provided, adds a "view tasks in this bucket" affordance per row */
  onOpen?: (item: T) => void
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
  onOpen,
}: PicklistAdminProps<T>) {
  const navigate = useNavigate()
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingValue, setEditingValue] = useState('')
  const [deletingItem, setDeletingItem] = useState<T | null>(null)

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
    <div className="safe-top mx-auto max-w-lg px-5 pt-3.5 pb-2 lg:max-w-2xl">
      <button onClick={() => navigate('/settings')} className="mb-4 flex items-center gap-2 text-[13px] text-slate-400">
        <span className="text-[15px]">←</span>Ещё
      </button>
      <h1 className="mb-4 text-[26px] font-semibold leading-[1.1] tracking-[-.02em] text-slate-100">{title}</h1>

      <div className="mb-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder={placeholder}
          className="h-[38px] min-w-0 flex-1 rounded-[11px] border border-slate-700 bg-slate-800 px-3 text-[13.5px] text-slate-100 outline-none placeholder:text-[#6e6e77] focus:border-sky-600"
        />
        <button
          onClick={handleCreate}
          className="h-[38px] shrink-0 rounded-[11px] px-4 text-[13.5px] font-semibold"
          style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
        >
          Добавить
        </button>
      </div>

      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="flex items-center gap-2 rounded-[15px] border border-slate-700 bg-slate-800 px-3 py-2.5 lg:hover:bg-[var(--s-surface-active)]"
          >
            <div className="flex flex-col text-[11px] leading-none lg:flex-row lg:gap-1">
              <button
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="text-slate-500 disabled:opacity-20"
                aria-label="Переместить выше"
              >
                ▲
              </button>
              <button
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                className="text-slate-500 disabled:opacity-20"
                aria-label="Переместить ниже"
              >
                ▼
              </button>
            </div>

            {editingId === item.id ? (
              <input
                autoFocus
                value={editingValue}
                onChange={(e) => setEditingValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                className="min-w-0 flex-1 rounded-lg border border-sky-600 bg-slate-900 px-2 py-1 text-sm text-slate-100 outline-none"
              />
            ) : (
              <button onClick={() => startEdit(item)} className="min-w-0 flex-1 truncate text-left text-sm text-slate-100">
                {labelOf(item)}
              </button>
            )}

            {onOpen && (
              <button
                onClick={() => onOpen(item)}
                className="shrink-0 text-slate-400 active:text-sky-600"
                aria-label="Открыть задачи"
              >
                →
              </button>
            )}

            {finalOf && onToggleFinal && (
              <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={finalOf(item)}
                  onChange={(e) => onToggleFinal(item, e.target.checked)}
                  className="accent-sky-600"
                />
                Финальный
              </label>
            )}

            <button
              onClick={() => setDeletingItem(item)}
              className="text-red-400 active:text-red-500"
              aria-label="Удалить"
            >
              ✕
            </button>
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-4 text-center text-[13px] text-slate-600">
            {loading ? 'Загрузка…' : 'Пока пусто.'}
          </li>
        )}
      </ul>

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
