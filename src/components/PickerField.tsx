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
  /** строка списка свойств: подпись слева, значение справа */
  row?: boolean
  /** цвет точки у варианта (CSS-цвет): клиент — метка, этап — цвет этапа */
  dotOf?: (id: string) => string | null
  /** ссылка-действие под списком в окне выбора (например «Настроить этапы») */
  footer?: React.ReactNode
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
  row = false,
  dotOf,
  footer,
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
  const dot = (id: string | null) => {
    const color = id && dotOf ? dotOf(id) : null
    return color ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden /> : null
  }

  return (
    <div className={chip || row ? 'flex min-w-0 max-w-full' : 'flex min-w-0 flex-col gap-1.5'}>
      {row ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-12 w-full items-center gap-3 px-3 text-left text-base active:bg-surface-sunken"
        >
          <span className="shrink-0 text-text-secondary">{label}</span>
          <span className={`flex min-w-0 flex-1 items-center justify-end gap-1.5 ${selected ? 'text-text' : 'text-text-tertiary'}`}>
            {dot(value)}
            <span className="truncate">{shown}</span>
          </span>
          <ChevronDown size={14} className="shrink-0 text-text-tertiary" />
        </button>
      ) : chip ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`flex max-w-full items-center gap-1 ${
            chipLarge ? 'min-h-9 rounded-sm px-3 py-2 text-sm' : 'rounded-sm px-2 py-[3px] text-xs'
          }`}
          style={{
            background: selected ? 'var(--accent-soft)' : 'transparent',
            border: `1px ${selected ? 'solid' : 'dashed'} var(--border-strong)`,
            color: selected ? 'var(--accent-text)' : 'var(--text-secondary)',
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
            className="flex h-10 w-full items-center justify-between gap-2 rounded-sm px-3 text-left text-base"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: selected ? 'var(--text)' : 'var(--text-tertiary)',
            }}
          >
            <span className="truncate">{shown}</span>
            <ChevronDown size={14} className="text-text-secondary" />
          </button>
        </>
      )}

      <Sheet open={open} onClose={close} title={label}>
        <div
          className="flex h-11 items-center gap-2 rounded-sm bg-surface-sunken px-2.5 text-text-secondary"
        >
          <Search size={16} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск"
            aria-label={`Поиск: ${label}`}
            className="min-w-0 flex-1 bg-transparent text-[length:var(--input-size)] text-text placeholder:text-text-tertiary"
            style={{ outline: 'none', boxShadow: 'none' }}
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
              className="flex min-h-12 items-center justify-between gap-3 px-1 text-left text-base text-text-secondary"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              {noneLabel}
              {value === null && <Check size={16} className="text-accent" />}
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
              className="flex min-h-12 items-center justify-between gap-3 px-1 text-left text-base text-text"
              style={{ borderBottom: '1px solid var(--divider)' }}
            >
              <span className="flex min-w-0 items-center gap-2">
                {dot(item.id)}
                <span className="truncate">{item.name}</span>
              </span>
              {value === item.id && <Check size={16} className="shrink-0 text-accent" />}
            </button>
          ))}
          {filtered.length === 0 && !creating && (
            <p className="py-4 text-center text-sm text-text-secondary">Ничего не нашлось</p>
          )}
        </div>

        {hint && <p className="-mt-1 text-sm leading-[1.45] text-text-secondary">{hint}</p>}
        {footer}

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
              className="h-11 min-w-0 flex-1 rounded-sm border border-accent bg-surface px-2.5 text-[length:var(--input-size)] text-text placeholder:text-text-tertiary"
            />
            <button
              type="button"
              onClick={create}
              disabled={!draft.trim()}
              aria-label="Создать"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-accent text-on-accent disabled:opacity-50"
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
