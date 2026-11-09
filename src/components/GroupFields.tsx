import { useState } from 'react'
import { PickerField } from './PickerField'
import { Plus } from './Icon'
import { Chip, FieldLabel, Sheet, fieldClass } from './ui'
import { describeError, useToast } from '../lib/Toast'
import { pickableItems, setGroupValue, type GroupModel } from '../lib/groups'
import { useCreateGroup, useCreateGroupItem } from '../lib/queries/groups'

/** группы, которые заводят чаще всего: одно касание — и поле появилось в задаче */
const QUICK_GROUPS: { name: string; item: string }[] = [
  { name: 'Клиенты', item: 'Клиент' },
  { name: 'Проекты', item: 'Проект' },
  { name: 'Виды работ', item: 'Вид работ' },
  { name: 'Сферы', item: 'Сфера' },
]

/** пока значений мало — объяснить, зачем группы и что нужное можно добавить прямо здесь */
const HINT_UNTIL_ITEMS = 3

function GroupsHint({ children }: { children: React.ReactNode }) {
  return <p className="col-span-2 -mt-0.5 text-xs leading-[1.45] text-text-secondary">{children}</p>
}

/**
 * Групп ещё нет (0.66.2): раньше в новой задаче просто не было полей, и завести клиента
 * можно было только в настройках структуры. Теперь — кнопка здесь же: шаблон или своё название.
 */
function OfferGroup() {
  const create = useCreateGroup()
  const { showError } = useToast()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function add(groupName: string, itemName: string) {
    if (!groupName.trim() || create.isPending) return
    create.mutate(
      { name: groupName.trim(), item_name: itemName.trim() || groupName.trim() },
      {
        onError: (e) => showError(describeError(e)),
        onSuccess: () => {
          setOpen(false)
          setName('')
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel>Группа</FieldLabel>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-10 w-full items-center gap-1.5 rounded-sm px-3 text-left text-base text-accent-text"
        style={{ background: 'var(--surface)', border: '1px dashed var(--border-strong)' }}
      >
        <Plus size={14} className="shrink-0" />
        <span className="truncate">Клиент, проект…</span>
      </button>
      <GroupsHint>
        Группы раскладывают задачи по клиентам и проектам — по ним считаются часы и строится отчёт.
      </GroupsHint>

      <Sheet anchored open={open} onClose={() => setOpen(false)} title="Новая группа">
        <p className="text-sm leading-[1.45] text-text-secondary">
          В задаче появится поле — например «Клиент», а в нём ваш список клиентов. Значения добавите сразу после.
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_GROUPS.map((g) => (
            <Chip key={g.name} onClick={() => add(g.name, g.item)}>
              {g.name}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                add(name, name)
              }
            }}
            placeholder="Своё название, например: Направления"
            aria-label="Название группы"
            className={`${fieldClass} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => add(name, name)}
            disabled={!name.trim() || create.isPending}
            className="flex h-11 shrink-0 items-center rounded-sm bg-accent px-4 text-base font-medium text-on-accent disabled:opacity-50"
          >
            Создать
          </button>
        </div>
        <p className="text-xs leading-[1.45] text-text-secondary">
          Связи между группами и цвета — в профиле, раздел «Группы».
        </p>
      </Sheet>
    </div>
  )
}

/**
 * Поля выбора по всем группам пользователя — компактные строки, по нажатию окно с поиском.
 * Ряды чипов здесь не годятся: групп может быть сколько угодно, а значений в каждой — десятки,
 * и форма создания задачи растягивалась на весь экран.
 */
export function GroupFields({
  model,
  value,
  onChange,
  rows = false,
  offerGroup = false,
}: {
  model: GroupModel
  value: string[]
  onChange: (itemIds: string[]) => void
  /** строки списка свойств карточки, а не сетка полей */
  rows?: boolean
  /** новая задача: групп нет — предложить завести, значений мало — пояснить */
  offerGroup?: boolean
}) {
  const createItem = useCreateGroupItem()
  const { showError } = useToast()

  if (model.groups.length === 0) return offerGroup && !rows ? <OfferGroup /> : null
  const itemCount = model.groups.reduce((n, g) => n + model.itemsOf(g.id).filter((i) => !i.archived).length, 0)

  const fields = model.groups.map((group) => {
        const parentGroup = group.parent_group_id ? model.groupById.get(group.parent_group_id) : undefined
        const parentValue = parentGroup ? model.valueOf({ item_ids: value }, parentGroup.id) : undefined
        const options = pickableItems(model, group, value).map((i) => ({
          id: i.id,
          name: i.archived ? `${i.name} (в архиве)` : i.name,
        }))
        return (
          <PickerField
            key={group.id}
            row={rows}
            dotOf={(id) => {
              const color = group.show_in_list ? model.itemById.get(id)?.color : null
              return color ? `var(--${color})` : null
            }}
            label={group.item_name}
            items={options}
            value={model.valueOf({ item_ids: value }, group.id)?.id ?? null}
            onChange={(id) => onChange(setGroupValue(model, value, group.id, id))}
            placeholder="Название"
            emptyLabel="Выбрать"
            noneLabel={group.required ? undefined : 'Не указано'}
            hint={
              parentGroup && parentValue
                ? `Показаны входящие в «${parentValue.name}» и ни во что не входящие`
                : undefined
            }
            onCreate={(name, onCreated) =>
              createItem.mutate(
                // новое значение сразу входит в то, что выбрано в родительской группе
                { groupId: group.id, name, parentItemId: parentValue?.id ?? null },
                { onError: (e) => showError(describeError(e)), onSuccess: (row) => onCreated(row.id) },
              )
            }
          />
        )
  })
  // строки — прямо в список свойств (без обёртки: у общего списка разделители между детьми)
  if (rows) return <>{fields}</>
  return (
    <div className="grid grid-cols-2 gap-[9px]">
      {fields}
      {offerGroup && itemCount < HINT_UNTIL_ITEMS && (
        <GroupsHint>
          По группам считаются часы и отчёт. Нужного значения нет — нажмите на поле и добавьте его прямо здесь.
        </GroupsHint>
      )}
    </div>
  )
}
