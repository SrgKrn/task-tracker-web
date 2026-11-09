import { useState } from 'react'
import { Check, ChevronDown, Close } from '../Icon'
import { Sheet } from '../ui'
import { seriesColor } from './charts'
import type { GroupModel } from '../../lib/groups'
import { EMPTY_FILTER, isFilterEmpty, toggleIn, type ReportFilter } from '../../lib/reportViews'
import type { Group } from '../../lib/types'

/**
 * Срез отчёта: значения любых групп (клиенты, разделы…) и отдельные задачи. Всё, что ниже
 * на экране, и обе выгрузки считаются по этому срезу. Выбрать можно здесь или нажатием на
 * строку в «Куда ушло время».
 */
export function ReportFilters({
  model,
  filter,
  onChange,
  taskName,
  compact = false,
}: {
  model: GroupModel
  filter: ReportFilter
  onChange: (f: ReportFilter) => void
  taskName: (id: string) => string
  /** телефон: группы без выбора не показываем — их открывает кнопка среза */
  compact?: boolean
}) {
  const [openGroup, setOpenGroup] = useState<Group | null>(null)
  const groups = model.groups.filter(
    (g) => model.itemsOf(g.id).length > 0 && (!compact || model.itemsOf(g.id).some((i) => filter.items.includes(i.id))),
  )
  if (compact ? isFilterEmpty(filter) : groups.length === 0 && isFilterEmpty(filter)) return null

  const pill = 'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm'
  return (
    <div className="sc -mx-5 flex items-center gap-1.5 overflow-x-auto px-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
      {groups.map((g) => {
        const picked = model.itemsOf(g.id).filter((i) => filter.items.includes(i.id))
        const on = picked.length > 0
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => setOpenGroup(g)}
            className={`${pill} ${
              on
                ? 'border-[var(--selected-border)] bg-surface-selected font-medium text-accent-text'
                : 'border-border bg-surface text-text-secondary hover:border-border-strong'
            }`}
          >
            {on ? (picked.length === 1 ? picked[0].name : `${g.name}: ${picked.length}`) : g.name}
            <ChevronDown size={14} />
          </button>
        )
      })}
      {filter.tasks.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange({ ...filter, tasks: filter.tasks.filter((x) => x !== id) })}
          className={`${pill} max-w-56 border-[var(--selected-border)] bg-surface-selected font-medium text-accent-text`}
          aria-label={`Убрать задачу «${taskName(id)}» из среза`}
        >
          <span className="truncate">{taskName(id)}</span>
          <Close size={13} />
        </button>
      ))}
      {!isFilterEmpty(filter) && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_FILTER)}
          className="inline-flex h-8 shrink-0 items-center rounded-full px-2.5 text-sm text-text-secondary hover:text-text"
        >
          Сбросить
        </button>
      )}

      <Sheet open={!!openGroup} onClose={() => setOpenGroup(null)} title={openGroup?.name ?? ''} anchored>
        {openGroup && (
          <div className="-mx-1 flex max-h-80 flex-col overflow-y-auto">
            {model.itemsOf(openGroup.id).map((i) => {
              const on = filter.items.includes(i.id)
              return (
                <button
                  key={i.id}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => onChange({ ...filter, items: toggleIn(filter.items, i.id) })}
                  className="flex min-h-9 items-center gap-2 rounded-sm px-2 text-left text-base text-text hover:bg-surface-sunken"
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border ${
                      on ? 'border-accent bg-accent text-on-accent' : 'border-border-strong'
                    }`}
                  >
                    {on && <Check size={12} />}
                  </span>
                  {i.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seriesColor(i.color) }} aria-hidden />}
                  <span className={`min-w-0 flex-1 truncate ${i.archived ? 'text-text-secondary' : ''}`}>{i.name}</span>
                </button>
              )
            })}
          </div>
        )}
      </Sheet>
    </div>
  )
}

/** Кнопка среза для телефона: воронка со счётчиком, по нажатию — все группы в одном окне. */
export function FilterButton({
  model,
  filter,
  onChange,
}: {
  model: GroupModel
  filter: ReportFilter
  onChange: (f: ReportFilter) => void
}) {
  const [open, setOpen] = useState(false)
  const groups = model.groups.filter((g) => model.itemsOf(g.id).length > 0)
  if (groups.length === 0) return null
  const count = filter.items.length + filter.tasks.length
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={count ? `Срез: выбрано ${count}` : 'Срез по группам'}
        className={`relative ml-1 inline-flex h-[var(--tap)] w-11 shrink-0 items-center justify-center rounded-sm border ${
          count ? 'border-[var(--selected-border)] bg-surface-selected text-accent-text' : 'border-border bg-surface text-text-secondary'
        }`}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        {count > 0 && (
          <span className="tabular absolute -top-1.5 -right-1.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-accent px-1 font-mono text-xs text-on-accent">
            {count}
          </span>
        )}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Срез отчёта">
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <div key={g.id} className="flex flex-col">
              <span className="pb-1 text-sm font-medium text-text-secondary">{g.name}</span>
              {model.itemsOf(g.id).map((i) => {
                const on = filter.items.includes(i.id)
                return (
                  <button
                    key={i.id}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={on}
                    onClick={() => onChange({ ...filter, items: toggleIn(filter.items, i.id) })}
                    className="flex min-h-11 items-center gap-2.5 text-left text-base text-text"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border ${
                        on ? 'border-accent bg-accent text-on-accent' : 'border-border-strong'
                      }`}
                    >
                      {on && <Check size={14} />}
                    </span>
                    {i.color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seriesColor(i.color) }} aria-hidden />}
                    <span className={`min-w-0 flex-1 truncate ${i.archived ? 'text-text-secondary' : ''}`}>{i.name}</span>
                  </button>
                )
              })}
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={count === 0}
              onClick={() => onChange(EMPTY_FILTER)}
              className="h-12 rounded-sm border border-border text-base font-medium text-text disabled:opacity-50"
            >
              Сбросить
            </button>
            <button type="button" onClick={() => setOpen(false)} className="h-12 rounded-sm bg-accent text-base font-medium text-on-accent">
              Показать
            </button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
