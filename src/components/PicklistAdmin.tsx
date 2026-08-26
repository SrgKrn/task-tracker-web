import { useState } from 'react'
import { ConfirmDialog } from './ConfirmDialog'

interface Item {
  id: string
  sort_order: number
}

interface PicklistAdminProps<T extends Item> {
  title: string
  placeholder: string
  items: T[]
  labelOf: (item: T) => string
  onCreate: (name: string) => void
  onUpdate: (id: string, name: string) => void
  onDelete: (id: string) => void
  onReorder: (items: T[]) => void
}

export function PicklistAdmin<T extends Item>({
  title,
  placeholder,
  items,
  labelOf,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: PicklistAdminProps<T>) {
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
    <div className="mx-auto max-w-lg px-4 py-6 safe-top safe-bottom">
      <h1 className="mb-4 text-xl font-semibold text-slate-100">{title}</h1>

      <div className="mb-4 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none"
        />
        <button
          onClick={handleCreate}
          className="rounded-lg bg-sky-600 px-4 py-2 font-medium text-slate-900 active:bg-sky-700"
        >
          Добавить
        </button>
      </div>

      <ul className="space-y-2">
        {items.map((item, index) => (
          <li
            key={item.id}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2"
          >
            <div className="flex flex-col">
              <button
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="text-slate-400 disabled:opacity-20"
                aria-label="Переместить выше"
              >
                ▲
              </button>
              <button
                onClick={() => move(index, 1)}
                disabled={index === items.length - 1}
                className="text-slate-400 disabled:opacity-20"
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
                className="flex-1 rounded border border-sky-600 bg-slate-900 px-2 py-1 text-slate-100 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => startEdit(item)}
                className="flex-1 text-left text-slate-100"
              >
                {labelOf(item)}
              </button>
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
        {items.length === 0 && <li className="text-slate-500">Пока пусто.</li>}
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
