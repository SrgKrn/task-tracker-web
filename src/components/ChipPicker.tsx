import { useState } from 'react'
import { Check, Close, Plus } from './Icon'
import { Chip, FieldLabel } from './ui'

interface ChipPickerProps {
  label: string
  items: { id: string; name: string }[]
  value: string | null
  onChange: (id: string | null) => void
  /** создаёт запись и отдаёт её id, чтобы сразу её и выбрать */
  onCreate: (name: string, onCreated: (id: string) => void) => void
  placeholder: string
  /** подпись варианта «ничего не выбрано»; без неё выбор обязателен */
  noneLabel?: string
}

/**
 * Ряд чипов с кнопкой «+»: новый раздел или проект заводится прямо здесь.
 * Раньше это было только в форме карточки и только через нативный prompt —
 * при быстром создании задачи выбирать было не из чего, если справочник пуст.
 */
export function ChipPicker({
  label,
  items,
  value,
  onChange,
  onCreate,
  placeholder,
  noneLabel,
}: ChipPickerProps) {
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')

  function submit() {
    const name = draft.trim()
    if (!name) {
      setCreating(false)
      return
    }
    onCreate(name, (id) => {
      onChange(id)
      setDraft('')
      setCreating(false)
    })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>{label}</FieldLabel>

      <div className="flex flex-wrap gap-2">
        {noneLabel && (
          <Chip active={value === null} onClick={() => onChange(null)}>
            {noneLabel}
          </Chip>
        )}
        {items.map((item) => (
          <Chip key={item.id} active={value === item.id} onClick={() => onChange(item.id)}>
            {item.name}
          </Chip>
        ))}
        {!creating && (
          <Chip onClick={() => setCreating(true)} className="flex items-center gap-1.5">
            <Plus size={13} />
            Новый
          </Chip>
        )}
      </div>

      {creating && (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
              if (e.key === 'Escape') {
                setDraft('')
                setCreating(false)
              }
            }}
            placeholder={placeholder}
            className="h-10 min-w-0 flex-1 rounded-sm px-3 border border-border bg-surface text-[length:var(--input-size)] text-text placeholder:text-text-tertiary focus:border-accent"
            
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim()}
            aria-label="Создать"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            <Check size={17} />
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft('')
              setCreating(false)
            }}
            aria-label="Отменить создание"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm text-text-secondary"
            style={{ border: '1px solid var(--border-strong)' }}
          >
            <Close size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
