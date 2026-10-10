import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { UserError } from '../Toast'
import type { Group, GroupItem } from '../types'

const BUCKET = 'attachments'

/** Группы пользователя по порядку: первая — верхний уровень отчёта и сводки. */
export function useGroups() {
  return useQuery({
    queryKey: ['groups'],
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('*').order('sort_order').order('created_at')
      if (error) throw error
      return data as Group[]
    },
  })
}

/** Значения всех групп разом: их немного, а нужны они почти на каждом экране. */
export function useGroupItems() {
  return useQuery({
    queryKey: ['group_items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_items')
        .select('*')
        .order('sort_order')
        .order('created_at')
      if (error) throw error
      return data as GroupItem[]
    },
  })
}

/** Значения групп меняют и задачи: база перекладывает их при связях и удалениях. */
function useInvalidateGroups() {
  const qc = useQueryClient()
  return () => {
    qc.invalidateQueries({ queryKey: ['groups'] })
    qc.invalidateQueries({ queryKey: ['group_items'] })
    qc.invalidateQueries({ queryKey: ['tasks'] })
  }
}

async function nextOrder(table: 'groups' | 'group_items', groupId?: string): Promise<number> {
  let q = supabase.from(table).select('sort_order').order('sort_order', { ascending: false }).limit(1)
  if (groupId) q = q.eq('group_id', groupId)
  const { data } = await q
  return data && data.length > 0 ? (data[0] as { sort_order: number }).sort_order + 1 : 0
}

export type GroupFields = Partial<
  Pick<Group, 'name' | 'item_name' | 'required' | 'show_in_list' | 'parent_group_id'>
>

export function useCreateGroup() {
  const qc = useQueryClient()
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: async (fields: { name: string; item_name: string; parent_group_id?: string | null }) => {
      const sort_order = await nextOrder('groups')
      const { data, error } = await supabase
        .from('groups')
        .insert({ ...fields, sort_order })
        .select()
        .single()
      if (error) throw error
      return data as Group
    },
    // новая группа сразу в кэше: её страница открывается раньше, чем список успеет перечитаться
    onSuccess: (group) => {
      qc.setQueryData<Group[]>(['groups'], (list) => (list ? [...list, group] : [group]))
      invalidate()
    },
  })
}

export function useUpdateGroup() {
  const qc = useQueryClient()
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: GroupFields }) => {
      const { error } = await supabase.from('groups').update(fields).eq('id', id)
      if (error) throw error
    },
    // переключатели меняются сразу: ждать сервера ради галочки незачем
    onMutate: ({ id, fields }) =>
      qc.setQueryData<Group[]>(['groups'], (list) => list?.map((g) => (g.id === id ? { ...g, ...fields } : g))),
    onSettled: invalidate,
  })
}

export function useReorderGroups() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ordered: Group[]) => {
      await Promise.all(ordered.map((g, index) => supabase.from('groups').update({ sort_order: index }).eq('id', g.id)))
    },
    onMutate: (ordered) =>
      qc.setQueryData<Group[]>(['groups'], ordered.map((g, index) => ({ ...g, sort_order: index }))),
    onSettled: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  })
}

/** Файлы значений из хранилища: строки в таблице база удалит каскадом, а сами файлы — нет. */
async function removeItemFiles(itemIds: string[]) {
  if (itemIds.length === 0) return
  const { data, error } = await supabase.from('attachments').select('path').in('item_id', itemIds)
  if (error) throw error
  const paths = (data ?? []).map((r: { path: string }) => r.path)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
}

/**
 * Удалить группу целиком: её значения, их файлы и значения этой группы у задач.
 * Сами задачи остаются — пропадает только эта раскладка.
 */
export function useDeleteGroup() {
  const invalidate = useInvalidateGroups()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (group: Group) => {
      const { data: items, error: itemsError } = await supabase.from('group_items').select('id').eq('group_id', group.id)
      if (itemsError) throw itemsError
      await removeItemFiles((items ?? []).map((i: { id: string }) => i.id))
      const { error } = await supabase.from('groups').delete().eq('id', group.id)
      if (error) throw error
      return group
    },
    // убираем сразу, не дожидаясь перечитывания: иначе удалённая группа мелькала в списке
    onSuccess: (group) => {
      qc.setQueryData<Group[]>(['groups'], (list) =>
        list
          ?.filter((g) => g.id !== group.id)
          .map((g) => (g.parent_group_id === group.id ? { ...g, parent_group_id: null } : g)),
      )
      qc.setQueryData<GroupItem[]>(['group_items'], (list) => list?.filter((i) => i.group_id !== group.id))
      invalidate()
      qc.invalidateQueries({ queryKey: ['attachments'] })
    },
  })
}

export function useCreateGroupItem() {
  const qc = useQueryClient()
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: async (input: { groupId: string; name: string; parentItemId?: string | null }) => {
      const sort_order = await nextOrder('group_items', input.groupId)
      const { data, error } = await supabase
        .from('group_items')
        .insert({
          group_id: input.groupId,
          name: input.name,
          parent_item_id: input.parentItemId ?? null,
          sort_order,
        })
        .select()
        .single()
      if (error) throw error
      return data as GroupItem
    },
    // созданное прямо из формы задачи значение должно сразу показаться выбранным
    onSuccess: (item) => {
      qc.setQueryData<GroupItem[]>(['group_items'], (list) => (list ? [...list, item] : [item]))
      invalidate()
    },
  })
}

export type GroupItemFields = Partial<Pick<GroupItem, 'name' | 'description' | 'archived' | 'parent_item_id'>>

export function useUpdateGroupItem() {
  const qc = useQueryClient()
  const invalidate = useInvalidateGroups()
  return useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: GroupItemFields }) => {
      const { error } = await supabase.from('group_items').update(fields).eq('id', id)
      if (error) throw error
    },
    onMutate: ({ id, fields }) =>
      qc.setQueryData<GroupItem[]>(['group_items'], (list) =>
        list?.map((i) => (i.id === id ? { ...i, ...fields } : i)),
      ),
    // «входит в» перекладывает значения у задач — их тоже перечитываем
    onSettled: invalidate,
  })
}

export function useReorderGroupItems() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ordered: GroupItem[]) => {
      await Promise.all(
        ordered.map((item, index) => supabase.from('group_items').update({ sort_order: index }).eq('id', item.id)),
      )
    },
    onMutate: (ordered) => {
      const order = new Map(ordered.map((item, index) => [item.id, index]))
      qc.setQueryData<GroupItem[]>(['group_items'], (list) =>
        list
          ?.map((i) => (order.has(i.id) ? { ...i, sort_order: order.get(i.id)! } : i))
          .sort((a, b) => a.sort_order - b.sort_order),
      )
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['group_items'] }),
  })
}

/** Значение, которое есть в задачах, база удалить не даст — в ответ придёт понятная ошибка. */
export function useDeleteGroupItem() {
  const invalidate = useInvalidateGroups()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: GroupItem) => {
      const { count } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .contains('item_ids', [item.id])
      if (count) throw new UserError(`«${item.name}» есть в задачах — его можно отправить в архив`)
      await removeItemFiles([item.id])
      const { error } = await supabase.from('group_items').delete().eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['attachments'] })
    },
  })
}
