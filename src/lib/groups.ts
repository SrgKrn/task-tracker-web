import { useMemo } from 'react'
import { useGroupItems, useGroups } from './queries/groups'
import type { Group, GroupItem, Task } from './types'

type WithItems = Pick<Task, 'item_ids'>

/**
 * Группы и их значения в одном месте: что показать в строке задачи, какое значение у задачи
 * в группе, как сменить значение с учётом связей. Экраны больше не знают ни о проектах,
 * ни о разделах — только о группах, которые завёл пользователь.
 */
export interface GroupModel {
  /** по порядку: первая — верхний уровень отчёта и сводки */
  groups: Group[]
  items: GroupItem[]
  groupById: Map<string, Group>
  itemById: Map<string, GroupItem>
  /** значения группы по порядку, вместе с архивными */
  itemsOf: (groupId: string) => GroupItem[]
  /** значение задачи в группе */
  valueOf: (task: WithItems, groupId: string) => GroupItem | undefined
  /** все значения задачи по порядку групп */
  valuesOf: (task: WithItems) => { group: Group; item: GroupItem }[]
  /** подпись задачи в списках: значения групп «в строке» через точку */
  listLabel: (task: WithItems) => string
  /** группы, которые входят в эту («Проекты» для «Клиентов») */
  childGroupsOf: (groupId: string) => Group[]
  loading: boolean
}

export function buildGroupModel(groups: Group[], items: GroupItem[], loading = false): GroupModel {
  const groupById = new Map(groups.map((g) => [g.id, g]))
  const itemById = new Map(items.map((i) => [i.id, i]))
  const byGroup = new Map<string, GroupItem[]>()
  for (const item of items) byGroup.set(item.group_id, [...(byGroup.get(item.group_id) ?? []), item])
  for (const list of byGroup.values()) list.sort((a, b) => a.sort_order - b.sort_order)
  const order = new Map(groups.map((g, i) => [g.id, i]))

  const valuesOf = (task: WithItems) =>
    (task.item_ids ?? [])
      .map((id) => itemById.get(id))
      .filter((i): i is GroupItem => !!i && groupById.has(i.group_id))
      .sort((a, b) => (order.get(a.group_id) ?? 0) - (order.get(b.group_id) ?? 0))
      .map((item) => ({ group: groupById.get(item.group_id)!, item }))

  return {
    groups,
    items,
    groupById,
    itemById,
    itemsOf: (groupId) => byGroup.get(groupId) ?? [],
    valueOf: (task, groupId) => {
      for (const id of task.item_ids ?? []) {
        const item = itemById.get(id)
        if (item?.group_id === groupId) return item
      }
      return undefined
    },
    valuesOf,
    listLabel: (task) =>
      valuesOf(task)
        .filter((v) => v.group.show_in_list)
        .map((v) => v.item.name)
        .join(' · '),
    childGroupsOf: (groupId) => groups.filter((g) => g.parent_group_id === groupId),
    loading,
  }
}

export function useGroupModel(): GroupModel {
  const { data: groups = [], isLoading: groupsLoading } = useGroups()
  const { data: items = [], isLoading: itemsLoading } = useGroupItems()
  const loading = groupsLoading || itemsLoading
  return useMemo(() => buildGroupModel(groups, items, loading), [groups, items, loading])
}

/**
 * Сменить значение задачи в группе. Повторяет правила базы, чтобы форма сразу показывала то,
 * что сохранится: значение тянет за собой родительское («проект → его клиент»), а значения
 * дочерних групп, которые больше не подходят, сбрасываются.
 */
export function setGroupValue(model: GroupModel, itemIds: string[], groupId: string, itemId: string | null): string[] {
  let next = itemIds.filter((id) => model.itemById.get(id)?.group_id !== groupId)
  if (itemId) next.push(itemId)

  // вверх: значение тянет своё родительское
  for (let guard = 0; guard < 10; guard++) {
    const missing = next
      .map((id) => model.itemById.get(id)?.parent_item_id)
      .find((parentId): parentId is string => !!parentId && !next.includes(parentId))
    if (!missing) break
    const parentGroup = model.itemById.get(missing)?.group_id
    next = next.filter((id) => model.itemById.get(id)?.group_id !== parentGroup)
    next.push(missing)
  }

  // вниз: значения дочерних групп, которые входят во что-то другое, сбрасываем
  for (let guard = 0; guard < 10; guard++) {
    const stale = next.find((id) => {
      const item = model.itemById.get(id)
      if (!item?.parent_item_id) return false
      const parent = model.itemById.get(item.parent_item_id)
      if (!parent) return false
      const chosen = next.find((x) => model.itemById.get(x)?.group_id === parent.group_id)
      return chosen !== undefined && chosen !== parent.id
    })
    if (!stale) break
    next = next.filter((id) => id !== stale)
  }
  return next
}

/**
 * Какие значения группы предлагать: без архивных (кроме уже выбранного) и, если группа
 * входит в другую и там уже что-то выбрано, — только входящие в выбранное или ни во что.
 */
export function pickableItems(model: GroupModel, group: Group, itemIds: string[]): GroupItem[] {
  const selected = model.valueOf({ item_ids: itemIds }, group.id)
  const parentValue = group.parent_group_id ? model.valueOf({ item_ids: itemIds }, group.parent_group_id) : undefined
  return model
    .itemsOf(group.id)
    .filter((i) => !i.archived || i.id === selected?.id)
    .filter((i) => !parentValue || !i.parent_item_id || i.parent_item_id === parentValue.id || i.id === selected?.id)
}

/** Обязательные группы, у которых нет значения: без них задачу не сохранить. */
export function missingRequired(model: GroupModel, itemIds: string[]): Group[] {
  return model.groups.filter((g) => g.required && !model.valueOf({ item_ids: itemIds }, g.id))
}
