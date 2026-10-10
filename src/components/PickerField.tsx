import { useMemo, useState } from 'react'
import { Check, ChevronDown, Plus, Search } from './Icon'
import { Chip, FieldLabel, Sheet } from './ui'

export interface PickerOption {
  id: string
  name: string
}

interface PickerFieldProps {
  label: string
  items: PickerOption[]
  value: string | null
  onChange: (id: string | null) => void
  /** создаёт запись и отдаёт её id, чтобы сразу её и выбрать; без него создавать нельзя */
  onCreate?: (name: string, onCreated: (id: string) => void) => void
  placeholder: string
  /** подпись варианта «ничего не выбрано»; без неё выбор обязателен */
  noneLabel?: string
  /** что написано в поле, пока ничего не выбрано (по умолчанию — placeholder) */
  emptyLabel?: string
  /** подсказка под списком в окне выбора */
  hint?: string
  /** маленький чип вместо поля с подписью — для строк списков */
  chip?: boolean
  /** чип-кнопка действия, а не метка: крупнее, чтобы попадать пальцем */
  chipLarge?: boolean
}

/**
 * Компактная строка со значением, по нажатию — лист с поиском.
 *
 * Ряд чипов хорош, пока записей единицы: на тринадцати проектах блок выбора занимал
 * 198px из 812 и форму приходилось прокручивать целиком. Здесь строка в 40px, а поиск
 * начинает окупаться как раз на таком количестве.
 */
export function PickerField({
  label,
  items,
  value,
  onChange,
  onCreate,
  placeholder,
  noneLabel,
  emptyLabel,
  hint,
  chip = false,
  chipLarge = false,
}: PickerFieldProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState('')
  const [creating, setCreating] = useState(false)

  const selected = items.find((i) => i.id === value) ?? null

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items
  }, [items, query])

  function close() {
    setOpen(false)
    setQuery('')
    setDraft('')
    setCreating(false)
  }

  function create() {
    const name = draft.trim() || query.trim()
    if (!name || !onCreate) return
    onCreate(name, (id) => {
      onChange(id)
      close()
    })
  }

  const shown = selected?.name ?? noneLabel ?? emptyLabel ?? placeholder

  return (
    <div className={chip ? 'flex min-w-0 max-w-full' : 'flex min-w-0 flex-col gap-1.5'}>
      {chip ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex max-w-full items-center gap-1 ${
            chipLarge ? 'min-h-9 rounded-[9px] px-3 py-2 text-xs' : 'rounded-[7px] px-2 py-[3px] text-2xs'
          }`}
          style={{
            background: selected ? 'var(--s-accent-ghost)' : 'transparent',
            border: `1px ${selected ? 'solid' : 'dashed'} var(--s-border-strong-2)`,
            color: selected ? 'var(--s-accent-text)' : 'var(--s-muted-text)',
          }}
        >
          <span className="truncate">{selected ? `${label}: ${selected.name}` : shown}</span>
          <ChevronDown size={11} className="shrink-0 opacity-70" />
        </button>
      ) : (
        <>
          <FieldLabel>{label}</FieldLabel>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex h-10 w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm"
            style={{
              background: 'var(--s-surface)',
              border: '1px solid var(--s-border)',
              color: selected ? 'var(--color-slate-100)' : 'var(--s-placeholder)',
            }}
          >
            <span className="truncate">{shown}</span>
            <ChevronDown size={14} className="text-slate-600" />
          </button>
        </>
      )}

      <Sheet open={open} onClose={close} title={label}>
        <div
          className="flex h-11 items-center gap-2 rounded-xl px-3"
          style={{ background: 'var(--s-input)', border: '1px solid var(--s-border-strong)' }}
        >
          <Search size={15} className="text-slate-600" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 placeholder:text-[var(--s-placeholder)]"
          />
        </div>

        <div className="sc -mx-1 flex max-h-[46vh] flex-col overflow-y-auto px-1">
          {noneLabel && !query.trim() && (
            <button
              type="button"
              onClick={() => {
                onChange(null)
                close()
              }}
              className="flex min-h-12 items-center justify-between gap-3 px-1 text-left text-sm text-slate-400"
              style={{ borderBottom: '1px solid var(--s-hairline-3)' }}
            >
              {noneLabel}
              {value === null && <Check size={16} className="text-brass-600" />}
            </button>
          )}
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange(item.id)
                close()
              }}
              className="flex min-h-12 items-center justify-between gap-3 px-1 text-left text-sm text-slate-100"
              style={{ borderBottom: '1px solid var(--s-hairline-3)' }}
            >
              <span className="min-w-0 truncate">{item.name}</span>
              {value === item.id && <Check size={16} className="shrink-0 text-brass-600" />}
            </button>
          ))}
          {filtered.length === 0 && !creating && (
            <p className="py-4 text-center text-xs text-slate-600">Ничего не нашлось</p>
          )}
        </div>

        {hint && <p className="-mt-1 text-2xs leading-[1.45] text-slate-500">{hint}</p>}

        {!onCreate ? null : creating ? (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  create()
                }
              }}
              placeholder={placeholder}
              className="h-11 min-w-0 flex-1 rounded-xl px-3 text-sm text-slate-100 placeholder:text-[var(--s-placeholder)]"
              style={{ background: 'var(--s-input)', border: '1px solid var(--s-accent)' }}
            />
            <button
              type="button"
              onClick={create}
              disabled={!draft.trim()}
              aria-label="Создать"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-40"
              style={{ background: 'var(--s-accent)', color: 'var(--s-on-accent)' }}
            >
              <Check size={17} />
            </button>
          </div>
        ) : (
          <Chip
            className="flex items-center gap-1.5 self-start"
            onClick={() => {
              setCreating(true)
              // то, что искали и не нашли, — скорее всего и есть новое название
              setDraft(query.trim())
            }}
          >
            <Plus size={13} />
            {query.trim() ? `Создать «${query.trim()}»` : 'Новый'}
          </Chip>
        )}
      </Sheet>
    </div>
  )
}
