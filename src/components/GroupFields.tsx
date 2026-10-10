import { PickerField } from './PickerField'
import { describeError, useToast } from '../lib/Toast'
import { pickableItems, setGroupValue, type GroupModel } from '../lib/groups'
import { useCreateGroupItem } from '../lib/queries/groups'

/**
 * Поля выбора по всем группам пользователя — компактные строки, по нажатию окно с поиском.
 * Ряды чипов здесь не годятся: групп может быть сколько угодно, а значений в каждой — десятки,
 * и форма создания задачи растягивалась на весь экран.
 */
export function GroupFields({
  model,
  value,
  onChange,
}: {
  model: GroupModel
  value: string[]
  onChange: (itemIds: string[]) => void
}) {
  const createItem = useCreateGroupItem()
  const { showError } = useToast()

  if (model.groups.length === 0) return null

  return (
    <div className="grid grid-cols-2 gap-[9px]">
      {model.groups.map((group) => {
        const parentGroup = group.parent_group_id ? model.groupById.get(group.parent_group_id) : undefined
        const parentValue = parentGroup ? model.valueOf({ item_ids: value }, parentGroup.id) : undefined
        const options = pickableItems(model, group, value).map((i) => ({
          id: i.id,
          name: i.archived ? `${i.name} (в архиве)` : i.name,
        }))
        return (
          <PickerField
            key={group.id}
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
      })}
    </div>
  )
}
