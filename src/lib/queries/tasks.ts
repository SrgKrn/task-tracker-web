import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../supabaseClient'
import { activeWorkspaceId } from '../workspace'
import type { Task } from '../types'
import { removeTaskFiles } from './attachments'

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      // только активное пространство; карточка по id (useTask) открывает задачу из любого
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('workspace_id', activeWorkspaceId())
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as Task[]
    },
  })
}

export function useTask(id: string | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['tasks', id],
    enabled: !!id,
    // задача уже есть в загруженном списке — показываем её сразу: плашка учёта и карточка
    // не ждут отдельного запроса, а без сети не остаются пустыми
    placeholderData: () => qc.getQueryData<Task[]>(['tasks'])?.find((t) => t.id === id),
    queryFn: async () => {
      // maybeSingle: удалённая задача возвращает null, а не ошибку — карточке нужно
      // отличать «ещё грузится» от «больше не существует», чтобы увести на список
      const { data, error } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return (data as Task | null) ?? null
    },
  })
}

export interface NewTaskInput {
  name: string
  /** значения групп; у подзадачи не нужны — база возьмёт их у спринта */
  item_ids?: string[]
  status_id: string | null
  planned_hours: number
  start_date: string | null
  end_date: string | null
  is_daily?: boolean
  duplicated_from?: string | null
  /** спринт, в который кладётся подзадача; значения групп база возьмёт у него */
  parent_id?: string | null
  /** пространство; не указано — активное (у подзадачи — пространство спринта) */
  workspace_id?: string
  /** своя ставка спринта — копия и следующий спринт берут её с собой */
  hourly_rate?: number | null
  rate_currency?: string | null
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewTaskInput) => {
      // головная задача — в активное пространство; подзадача — в пространство спринта (база)
      const row = input.parent_id ? input : { ...input, workspace_id: activeWorkspaceId() }
      const { data, error } = await supabase.from('tasks').insert(row).select().single()
      if (error) throw error
      return data as Task
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export type TaskFieldsInput = Partial<
  Pick<
    Task,
    | 'name'
    | 'item_ids'
    | 'status_id'
    | 'planned_hours'
    | 'start_date'
    | 'end_date'
    | 'is_daily'
    | 'plan_date'
    | 'parent_id'
    | 'urgent'
    | 'important'
    | 'effort'
    | 'abc_letter'
    | 'abc_rank'
    | 'delegated_to'
    | 'hourly_rate'
    | 'rate_currency'
  >
>

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: TaskFieldsInput }) => {
      const { error } = await supabase.from('tasks').update(fields).eq('id', id)
      if (error) throw error
    },
    // поля карточки сохраняются сами по изменению — значение должно встать сразу, а не
    // после ответа сервера; отказ возвращает прежнее
    onMutate: async ({ id, fields }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] })
      const list = qc.getQueryData<Task[]>(['tasks'])
      const one = qc.getQueryData<Task>(['tasks', id])
      if (list) qc.setQueryData<Task[]>(['tasks'], list.map((t) => (t.id === id ? { ...t, ...fields } : t)))
      if (one) qc.setQueryData<Task>(['tasks', id], { ...one, ...fields })
      return { list, one }
    },
    onError: (_e, { id }, snapshot) => {
      if (snapshot?.list) qc.setQueryData(['tasks'], snapshot.list)
      if (snapshot?.one) qc.setQueryData(['tasks', id], snapshot.one)
    },
    onSettled: (_data, _error, variables) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['tasks', variables.id] })
      // смена статуса пишет событие триггером — сводка должна пересчитать «задач закрыто»
      qc.invalidateQueries({ queryKey: ['task_status_events_closed'] })
    },
  })
}

/**
 * Выбор задач на день одним запросом: ids получают дату плана, null — снимаются с плана.
 * Список меняется сразу, отказ возвращает прежнее.
 */
export function useSetPlanDate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ ids, date }: { ids: string[]; date: string | null }) => {
      if (ids.length === 0) return
      const { error } = await supabase.from('tasks').update({ plan_date: date }).in('id', ids)
      if (error) throw error
    },
    onMutate: async ({ ids, date }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] })
      const list = qc.getQueryData<Task[]>(['tasks'])
      const set = new Set(ids)
      if (list) qc.setQueryData<Task[]>(['tasks'], list.map((t) => (set.has(t.id) ? { ...t, plan_date: date } : t)))
      return { list }
    },
    onError: (_e, _v, snapshot) => {
      if (snapshot?.list) qc.setQueryData(['tasks'], snapshot.list)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

/**
 * Лягушка дня: прежняя лягушка этого дня снимается в той же функции базы (лягушка одна
 * в день). taskId null — снять. Список меняется сразу, отказ возвращает прежнее.
 */
export function useSetFrog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ taskId, date }: { taskId: string | null; date: string }) => {
      // лягушка своя в каждом пространстве: снятие — только в текущем
      const { error } = await supabase.rpc('set_frog', { p_task_id: taskId, p_date: date, p_workspace: activeWorkspaceId() })
      if (error) throw error
    },
    onMutate: async ({ taskId, date }) => {
      await qc.cancelQueries({ queryKey: ['tasks'] })
      const list = qc.getQueryData<Task[]>(['tasks'])
      if (list)
        qc.setQueryData<Task[]>(
          ['tasks'],
          list.map((t) =>
            t.id === taskId ? { ...t, frog_date: date } : t.frog_date === date ? { ...t, frog_date: null } : t,
          ),
        )
      return { list }
    },
    onError: (_e, _v, snapshot) => {
      if (snapshot?.list) qc.setQueryData(['tasks'], snapshot.list)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // файлы задачи и её подзадач — из хранилища до удаления строк
      const { data: children } = await supabase.from('tasks').select('id').eq('parent_id', id)
      await removeTaskFiles([id, ...(children ?? []).map((c: { id: string }) => c.id)])
      const { error } = await supabase.from('tasks').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['attachments'] })
    },
  })
}

/**
 * Копия задачи со ссылкой на оригинал: план и привязки переносятся, факт и история — нет.
 * Живёт здесь, а не в карточке, потому что дублировать можно и свайпом из списка.
 */
/** что можно переопределить у копии, не трогая остальные поля оригинала */
export interface DuplicateOverrides {
  name?: string
  start_date?: string | null
  end_date?: string | null
}

export function useDuplicateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ task, overrides }: { task: Task; overrides?: DuplicateOverrides }) => {
      const input: NewTaskInput = {
        name: overrides?.name?.trim() || `${task.name} (копия)`,
        item_ids: task.item_ids,
        status_id: task.status_id,
        planned_hours: task.planned_hours,
        start_date: overrides?.start_date !== undefined ? overrides.start_date : task.start_date,
        end_date: overrides?.end_date !== undefined ? overrides.end_date : task.end_date,
        is_daily: task.is_daily,
        duplicated_from: task.id,
        // копия подзадачи остаётся в том же спринте, а не выпадает в список отдельной задачей
        parent_id: task.parent_id,
        workspace_id: task.workspace_id,
        hourly_rate: task.hourly_rate,
        rate_currency: task.rate_currency,
      }
      const { data, error } = await supabase.from('tasks').insert(input).select().single()
      if (error) throw error
      return data as Task
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}

export interface NextSprintInput {
  from: Task
  name: string
  planned_hours: number
  start_date: string | null
  end_date: string | null
  status_id: string | null
  /** незакрытые подзадачи, которые едут в новый спринт — с остатком плана, без факта */
  carry: { name: string; planned_hours: number }[]
}

/**
 * «Новый период»: «Спринт 6 → Спринт 7» с незакрытыми подзадачами.
 * Старый спринт не трогаем — его часы, закрытые подзадачи и история остаются в нём.
 */
export function useCreateNextSprint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: NextSprintInput) => {
      const head: NewTaskInput = {
        name: input.name.trim(),
        item_ids: input.from.item_ids,
        status_id: input.status_id,
        planned_hours: input.planned_hours,
        start_date: input.start_date,
        end_date: input.end_date,
        is_daily: input.from.is_daily,
        duplicated_from: input.from.id,
        workspace_id: input.from.workspace_id,
        hourly_rate: input.from.hourly_rate,
        rate_currency: input.from.rate_currency,
      }
      const { data, error } = await supabase.from('tasks').insert(head).select().single()
      if (error) throw error
      const sprint = data as Task

      if (input.carry.length > 0) {
        const rows: NewTaskInput[] = input.carry.map((c) => ({
          name: c.name,
          status_id: null,
          planned_hours: c.planned_hours,
          start_date: null,
          end_date: null,
          parent_id: sprint.id,
        }))
        const { error: childError } = await supabase.from('tasks').insert(rows)
        if (childError) throw childError
      }
      return sprint
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks'] }),
  })
}
