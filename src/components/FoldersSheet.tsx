import { useState } from 'react'
import { Check, Close, Plus } from './Icon'
import { Button, Chip, ListGroup, Overline, Sheet, fieldClass } from './ui'
import type { GroupModel } from '../lib/groups'
import { SPECIAL_LABEL, condLabel, sourceGroupId, type FolderCond, type FolderSettings } from '../lib/taskFolders'

/** Что стоит в папках: значения любой группы, свои папки с условием или ничего. */
export function FoldersSheet({
  open,
  onClose,
  settings,
  onChange,
  model,
}: {
  open: boolean
  onClose: () => void
  settings: FolderSettings
  onChange: (next: FolderSettings) => void
  model: GroupModel
}) {
  const [name, setName] = useState('')
  const [cond, setCond] = useState<FolderCond | null>(null)
  const groupId = sourceGroupId(settings, model)
  const source = settings.source === 'custom' || settings.source === 'off' ? settings.source : groupId ? `group:${groupId}` : 'off'

  const options = [
    ...model.groups.map((g) => ({ value: `group:${g.id}`, label: g.name, hint: 'папка на каждое значение' })),
    { value: 'custom', label: 'Свои папки', hint: 'название и условие — какие задачи в ней' },
    { value: 'off', label: 'Без папок', hint: 'только поиск и фильтр' },
  ]
  const add = () => {
    if (!name.trim() || !cond) return
    onChange({ ...settings, source: 'custom', custom: [...settings.custom, { id: crypto.randomUUID(), name: name.trim(), cond }] })
    setName('')
    setCond(null)
  }
  const condKey = (c: FolderCond | null) => (c ? (c.kind === 'item' ? `item:${c.itemId}` : c.kind) : '')

  return (
    <Sheet anchored open={open} onClose={onClose} title="Папки">
      <ListGroup>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange({ ...settings, source: o.value })}
            className="flex min-h-13 items-center gap-3 px-3.5 py-2 text-left"
          >
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-base text-text">{o.label}</span>
              <span className="text-sm text-text-secondary">{o.hint}</span>
            </span>
            {source === o.value && <Check size={16} className="shrink-0 text-accent" />}
          </button>
        ))}
      </ListGroup>

      {source === 'custom' && (
        <>
          {settings.custom.length > 0 && (
            <ListGroup>
              {settings.custom.map((f) => (
                <div key={f.id} className="flex min-h-12 items-center gap-3 px-3.5">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-base text-text">{f.name}</span>
                    <span className="truncate text-sm text-text-secondary">{condLabel(f.cond, model)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange({ ...settings, custom: settings.custom.filter((x) => x.id !== f.id) })}
                    aria-label={`Удалить папку «${f.name}»`}
                    className="hit-44 flex shrink-0 text-text-secondary"
                  >
                    <Close size={16} />
                  </button>
                </div>
              ))}
            </ListGroup>
          )}
          <div className="flex flex-col gap-2.5 rounded-md border border-dashed border-border-strong p-3">
            <Overline>Новая папка</Overline>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" aria-label="Название папки" className={fieldClass} />
            <span className="text-sm text-text-secondary">Какие задачи в ней</span>
            <div className="flex flex-wrap gap-2">
              {(['today', 'hot', 'noplan'] as const).map((k) => (
                <Chip key={k} active={condKey(cond) === k} onClick={() => setCond({ kind: k })}>
                  {SPECIAL_LABEL[k]}
                </Chip>
              ))}
            </div>
            {model.groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-1.5">
                <span className="text-xs text-text-secondary">{g.name}</span>
                <div className="flex flex-wrap gap-2">
                  {model
                    .itemsOf(g.id)
                    .filter((i) => !i.archived)
                    .map((i) => (
                      <Chip
                        key={i.id}
                        active={condKey(cond) === `item:${i.id}`}
                        onClick={() => {
                          setCond({ kind: 'item', itemId: i.id })
                          if (!name.trim()) setName(i.name)
                        }}
                      >
                        {i.name}
                      </Chip>
                    ))}
                </div>
              </div>
            ))}
            <Button variant="secondary" onClick={add} disabled={!name.trim() || !cond}>
              <Plus size={15} /> Добавить папку
            </Button>
          </div>
        </>
      )}
    </Sheet>
  )
}
