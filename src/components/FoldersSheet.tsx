import { useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Plus } from './Icon'
import { Button, Chip, ClientDot, ListGroup, Overline, Sheet, fieldClass } from './ui'
import { useTaskFolders } from './useTaskFolders'
import { plural } from '../lib/time'
import {
  FOLDER_FLAGS,
  SPECIAL_HINT,
  SPECIAL_LABEL,
  autoFolderName,
  customMatch,
  folderSummary,
  sourceGroupId,
  type CustomFolder,
  type FolderFlag,
} from '../lib/taskFolders'

type Draft = CustomFolder & { isNew: boolean }

/**
 * Настройка папок «Задач» (0.66.5). Два независимых блока: свои папки (список, касание —
 * правка) и папки из группы (одна группа или никакой). Своя папка правится вторым шагом
 * того же окна: название, значения групп, особые условия и живой счётчик задач.
 */
export function FoldersSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  /** новую папку сразу открываем в списке */
  onPick?: (key: string) => void
}) {
  const { settings, setSettings, model, ctx, heads, isDone } = useTaskFolders()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setDraft(null)
  }

  const groupId = sourceGroupId(settings, model)
  const openHeads = heads.filter((t) => !isDone(t))
  const countOf = (f: Pick<CustomFolder, 'items' | 'flags'>) => openHeads.filter((t) => customMatch(f, t, ctx)).length

  const save = (d: Draft) => {
    const folder: CustomFolder = { id: d.id, name: d.name.trim(), items: d.items, flags: d.flags }
    const custom = d.isNew ? [...settings.custom, folder] : settings.custom.map((f) => (f.id === d.id ? folder : f))
    setSettings({ ...settings, custom })
    if (d.isNew) onPick?.(`c:${d.id}`)
    setDraft(null)
  }
  const remove = (id: string) => {
    setSettings({ ...settings, custom: settings.custom.filter((f) => f.id !== id) })
    setDraft(null)
  }

  if (draft) {
    return (
      <Sheet
        anchored
        open={open}
        onClose={onClose}
        title={draft.isNew ? 'Новая папка' : 'Папка'}
        headerAction={
          <button
            type="button"
            onClick={() => setDraft(null)}
            className="-mr-1 flex min-h-11 items-center gap-0.5 text-sm font-medium text-accent-text lg:min-h-6"
          >
            <ChevronLeft size={16} /> Папки
          </button>
        }
      >
        <FolderEditor
          draft={draft}
          onChange={setDraft}
          count={countOf(draft)}
          onSave={() => save(draft)}
          onCancel={() => setDraft(null)}
          onDelete={draft.isNew ? undefined : () => remove(draft.id)}
        />
      </Sheet>
    )
  }

  const sources = [
    ...model.groups.map((g) => ({ value: `group:${g.id}`, label: g.name, hint: 'папка на каждое значение' })),
    { value: 'off', label: 'Не показывать', hint: 'только свои папки' },
  ]
  const source = groupId ? `group:${groupId}` : 'off'

  return (
    <Sheet anchored open={open} onClose={onClose} title="Папки">
      <div className="flex flex-col gap-1.5">
        <Overline>Свои папки</Overline>
        <ListGroup>
          {settings.custom.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setDraft({ ...f, isNew: false })}
              className="flex min-h-13 items-center gap-3 px-3.5 py-2 text-left active:bg-surface-sunken lg:hover:bg-surface-hover"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base text-text">{f.name || autoFolderName(f, model) || 'Папка'}</span>
                <span className="truncate text-sm text-text-secondary">{folderSummary(f, model)}</span>
              </span>
              <span className="tabular shrink-0 font-mono text-xs text-text-tertiary">{countOf(f)}</span>
              <ChevronRight size={16} className="shrink-0 text-text-tertiary" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDraft({ id: crypto.randomUUID(), name: '', items: [], flags: [], isNew: true })}
            className="flex min-h-12 items-center gap-2 px-3.5 text-left text-base font-medium text-accent-text active:bg-surface-sunken lg:hover:bg-surface-hover"
          >
            <Plus size={16} /> Новая папка
          </button>
        </ListGroup>
        {settings.custom.length === 0 && (
          <p className="px-1 text-sm text-text-secondary">
            Папка собирает задачи по условию: например, «Горит» — всё просроченное, или два клиента сразу.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Overline>Папки из группы</Overline>
        <ListGroup>
          {sources.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setSettings({ ...settings, source: o.value })}
              aria-pressed={source === o.value}
              className="flex min-h-13 items-center gap-3 px-3.5 py-2 text-left active:bg-surface-sunken lg:hover:bg-surface-hover"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-base text-text">{o.label}</span>
                <span className="text-sm text-text-secondary">{o.hint}</span>
              </span>
              {source === o.value && <Check size={16} className="shrink-0 text-accent" />}
            </button>
          ))}
        </ListGroup>
      </div>
    </Sheet>
  )
}

function FolderEditor({
  draft,
  onChange,
  count,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: Draft
  onChange: (d: Draft) => void
  count: number
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const { model } = useTaskFolders()
  const toggleItem = (id: string) =>
    onChange({ ...draft, items: draft.items.includes(id) ? draft.items.filter((x) => x !== id) : [...draft.items, id] })
  const toggleFlag = (f: FolderFlag) =>
    onChange({ ...draft, flags: draft.flags.includes(f) ? draft.flags.filter((x) => x !== f) : [...draft.flags, f] })
  const empty = draft.items.length === 0 && draft.flags.length === 0
  const auto = autoFolderName(draft, model)

  return (
    <>
      <input
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
        placeholder={auto || 'Название'}
        aria-label="Название папки"
        className={fieldClass}
      />

      <div className="flex flex-col gap-2">
        <Overline>Какие задачи в ней</Overline>
        <div className="flex flex-wrap gap-2">
          {FOLDER_FLAGS.map((f) => (
            <Chip key={f} active={draft.flags.includes(f)} onClick={() => toggleFlag(f)}>
              {SPECIAL_LABEL[f]}
            </Chip>
          ))}
        </div>
        {draft.flags.length > 0 && (
          <p className="text-xs text-text-secondary">{draft.flags.map((f) => `${SPECIAL_LABEL[f]} — ${SPECIAL_HINT[f]}`).join('; ')}</p>
        )}
      </div>

      {model.groups.map((g) => {
        const values = model.itemsOf(g.id).filter((i) => !i.archived || draft.items.includes(i.id))
        if (values.length === 0) return null
        return (
          <div key={g.id} className="flex flex-col gap-2">
            <span className="text-sm text-text-secondary">{g.name}</span>
            <div className="flex flex-wrap gap-2">
              {values.map((i) => (
                <Chip key={i.id} active={draft.items.includes(i.id)} onClick={() => toggleItem(i.id)}>
                  <span className="flex items-center gap-1.5">
                    {i.color && <ClientDot color={i.color} size={7} />}
                    {i.name}
                  </span>
                </Chip>
              ))}
            </div>
          </div>
        )
      })}

      <p className="text-sm text-text-secondary">
        {empty
          ? 'Выберите хотя бы одно условие.'
          : `Подходит ${plural(count, ['открытая задача', 'открытые задачи', 'открытых задач'])}.`}
        {model.groups.length > 1 && !empty && ' В одной группе — любое из выбранных, из разных групп — все сразу.'}
      </p>

      <div className="mt-1 flex gap-2">
        {onDelete ? (
          <Button size="lg" variant="ghost" className="text-danger-text" onClick={onDelete}>
            Удалить
          </Button>
        ) : (
          <Button size="lg" onClick={onCancel}>
            Отмена
          </Button>
        )}
        <Button size="lg" variant="primary" className="flex-1" disabled={empty} onClick={onSave}>
          {draft.isNew ? 'Создать папку' : 'Сохранить'}
        </Button>
      </div>
    </>
  )
}
