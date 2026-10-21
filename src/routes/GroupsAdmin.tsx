import { focusOnOpen } from '../lib/device'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, Plus } from '../components/Icon'
import { PickerField } from '../components/PickerField'
import { PicklistAdmin } from '../components/PicklistAdmin'
import { FieldLabel, Overline, Sheet, SheetActions, fieldClass } from '../components/ui'
import { describeError, useToast } from '../lib/Toast'
import { useGroupModel, type GroupModel } from '../lib/groups'
import {
  useCreateGroup,
  useCreateGroupItem,
  useDeleteGroup,
  useDeleteGroupItem,
  useGroups,
  useReorderGroupItems,
  useReorderGroups,
  useUpdateGroup,
  useUpdateGroupItem,
} from '../lib/queries/groups'
import { useTasks } from '../lib/queries/tasks'
import { plural } from '../lib/time'
import { RoomNote, useRoom } from '../components/Upgrade'
import type { Group, GroupItem, LabelColor } from '../lib/types'

const VALUES: [string, string, string] = ['значение', 'значения', 'значений']
/** «у 1 задачи», «у 5 задач» */
const TASKS_GEN: [string, string, string] = ['задачи', 'задач', 'задач']

/** группы, в которые можно войти этой: не она сама и не те, что уже входят в неё */
function allowedParents(model: GroupModel, group: Group | null): Group[] {
  if (!group) return model.groups
  const below = new Set<string>([group.id])
  let grew = true
  while (grew) {
    grew = false
    for (const g of model.groups) {
      if (g.parent_group_id && below.has(g.parent_group_id) && !below.has(g.id)) {
        below.add(g.id)
        grew = true
      }
    }
  }
  return model.groups.filter((g) => !below.has(g.id))
}

/**
 * Конструктор групп. Группа — измерение, по которому раскладываются задачи: проекты, разделы,
 * клиенты, типы работ. Порядок важен: по первой группе строятся верхний уровень отчёта
 * и сводка, по второй — то, что внутри.
 */
export function GroupsAdmin() {
  const navigate = useNavigate()
  const model = useGroupModel()
  const reorder = useReorderGroups()
  const { showError } = useToast()
  const [creating, setCreating] = useState(false)

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= model.groups.length) return
    const next = [...model.groups]
    const [g] = next.splice(index, 1)
    next.splice(target, 0, g)
    reorder.mutate(next, { onError: (e) => showError(describeError(e)) })
  }

  return (
    <div className="safe-top-page page mx-auto max-w-lg px-5 pt-3.5 pb-8">
      <button onClick={() => navigate('/settings')} className="mb-4 flex items-center gap-2 text-base text-text-secondary lg:hidden">
        <ArrowLeft size={15} />
        Профиль
      </button>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h1 className="text-xl font-semibold leading-[1.1] tracking-[-.02em] text-text">Группы</h1>
        <Link to="/groups" className="text-sm font-medium text-accent-text">
          Холстом
        </Link>
      </div>
      <p className="mb-4 text-sm leading-[1.5] text-text-secondary">
        То, по чему раскладываются задачи: проекты, разделы, клиенты, типы работ — какие нужны именно вам.
        Порядок важен: первая группа — верхний уровень отчёта и сводки, вторая — то, что внутри.
      </p>

      <ul className="flex flex-col gap-2">
        {model.groups.map((g, index) => {
          const parent = g.parent_group_id ? model.groupById.get(g.parent_group_id) : undefined
          const count = model.itemsOf(g.id).filter((i) => !i.archived).length
          const facts = [
            plural(count, VALUES),
            g.required ? 'обязательная' : null,
            parent ? `входит в «${parent.name}»` : null,
          ].filter(Boolean)
          return (
            <li
              key={g.id}
              className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2.5"
            >
              <div className="flex flex-col text-xs leading-none lg:flex-row lg:gap-1">
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="flex h-6 w-6 items-center justify-center text-text-secondary disabled:opacity-20"
                  aria-label="Переместить выше"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === model.groups.length - 1}
                  className="flex h-6 w-6 items-center justify-center text-text-secondary disabled:opacity-20"
                  aria-label="Переместить ниже"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
              <Link to={`/groups/${g.id}`} className="flex min-w-0 flex-1 items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium text-text">{g.name}</span>
                  <span className="block truncate text-xs text-text-secondary">{facts.join(' · ')}</span>
                </span>
                <span className="font-mono text-xs text-text-secondary">{index + 1}</span>
                <ArrowRight size={15} className="shrink-0 text-text-secondary" />
              </Link>
            </li>
          )
        })}
        {!model.loading && model.groups.length === 0 && (
          <li className="py-4 text-center text-base text-text-secondary">
            Групп нет — задачи живут одним списком. Добавьте первую, когда захочется их разложить.
          </li>
        )}
      </ul>

      <button
        type="button"
        onClick={() => setCreating(true)}
        className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm text-base font-semibold"
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        <Plus size={15} />
        Новая группа
      </button>

      <NewGroupSheet
        open={creating}
        model={model}
        onClose={() => setCreating(false)}
        onCreated={(g) => {
          setCreating(false)
          navigate(`/groups/${g.id}`)
        }}
      />
    </div>
  )
}

export function NewGroupSheet({
  open,
  model,
  onClose,
  onCreated,
}: {
  open: boolean
  model: GroupModel
  onClose: () => void
  onCreated: (g: Group) => void
}) {
  const create = useCreateGroup()
  const { showError } = useToast()
  const [name, setName] = useState('')
  const [itemName, setItemName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName('')
    setItemName('')
    setParentId(null)
  }, [open])

  const canCreate = !!name.trim()
  // лимит групп пространства по тарифу
  const room = useRoom('groups', model.groups.length)

  if (!room.allowed) {
    return (
      <Sheet open={open} onClose={onClose} title="Новая группа">
        <RoomNote room={room} what="Ещё одна группа в этом пространстве" max="Это максимум групп в пространстве." />
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title="Новая группа">
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Как называется группа</FieldLabel>
        <input
          autoFocus={focusOnOpen}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: Клиенты"
          className={fieldClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Одно значение — это</FieldLabel>
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="Например: Клиент"
          className={fieldClass}
        />
        <span className="text-xs leading-[1.45] text-text-secondary">Так подписано поле в задаче</span>
      </div>
      <PickerField
        label="Входит в группу"
        items={model.groups.map((g) => ({ id: g.id, name: g.name }))}
        value={parentId}
        onChange={setParentId}
        placeholder="Группа"
        noneLabel="Ни во что не входит"
        hint="Например, проекты входят в клиентов: выберете проект в задаче — клиент подставится сам"
      />
      <SheetActions
        onCancel={onClose}
        confirmLabel="Создать"
        confirmDisabled={!canCreate || create.isPending}
        onConfirm={() =>
          create.mutate(
            { name: name.trim(), item_name: itemName.trim() || name.trim(), parent_group_id: parentId },
            { onError: (e) => showError(describeError(e)), onSuccess: onCreated },
          )
        }
      />
    </Sheet>
  )
}

/** Страница группы: её настройки, значения со связями и удаление. */
/** метки дизайн-системы по порядку; названия — для выбора и для экранного диктора */
const LABELS: LabelColor[] = ['label-1', 'label-2', 'label-3', 'label-4', 'label-5', 'label-6', 'label-7', 'label-8']
const LABEL_NAMES: Record<LabelColor, string> = {
  'label-1': 'Терракота',
  'label-2': 'Синий',
  'label-3': 'Фиолетовый',
  'label-4': 'Розовый',
  'label-5': 'Янтарный',
  'label-6': 'Зелёный',
  'label-7': 'Оливковый',
  'label-8': 'Графит',
}

export function GroupPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const model = useGroupModel()
  const { isFetching: groupsFetching } = useGroups()
  const { data: tasks = [] } = useTasks()
  const createItem = useCreateGroupItem()
  const updateItem = useUpdateGroupItem()
  const deleteItem = useDeleteGroupItem()
  const reorderItems = useReorderGroupItems()
  const deleteGroup = useDeleteGroup()
  const { showError, showSuccess } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [coloring, setColoring] = useState<GroupItem | null>(null)

  const group = id ? model.groupById.get(id) : undefined
  const items = id ? model.itemsOf(id) : []
  const parentGroup = group?.parent_group_id ? model.groupById.get(group.parent_group_id) : undefined
  const parentItems = parentGroup ? model.itemsOf(parentGroup.id) : []

  // сколько головных задач потеряют значение, если группу удалить
  const affected = useMemo(() => {
    const ids = new Set(items.map((i) => i.id))
    return tasks.filter((t) => !t.parent_id && t.item_ids.some((x) => ids.has(x))).length
  }, [tasks, items])

  // группы нет и список уже свежий — её удалили или ссылка устарела
  if (!model.loading && !groupsFetching && !group) return <Navigate to="/groups" replace />
  if (!group) return null

  return (
    <>
      <PicklistAdmin<GroupItem>
        title={group.name}
        backTo="/groups"
        backLabel="Группы"
        placeholder={`Новое значение: ${group.item_name.toLowerCase()}`}
        listTitle={`Значения · ${items.filter((i) => !i.archived).length}`}
        items={items}
        loading={model.loading}
        labelOf={(i) => i.name}
        onCreate={(name) => createItem.mutate({ groupId: group.id, name }, { onError })}
        onUpdate={(itemId, name) => updateItem.mutate({ id: itemId, fields: { name } }, { onError })}
        onDelete={(itemId) => {
          const item = items.find((i) => i.id === itemId)
          if (item) deleteItem.mutate(item, { onError, onSuccess: () => showSuccess('Удалено') })
        }}
        onReorder={(ordered) => reorderItems.mutate(ordered, { onError })}
        archivedOf={(i) => i.archived}
        onToggleArchived={(i, archived) => updateItem.mutate({ id: i.id, fields: { archived } }, { onError })}
        onOpen={(i) => navigate(`/items/${i.id}`)}
        // цвет — только у групп «в строке»: у остальных точка в строке задачи не видна
        leadingOf={
          group.show_in_list
            ? (i) => (
                <button
                  type="button"
                  onClick={() => setColoring(i)}
                  aria-label={`Цвет: ${i.name} — ${i.color ? LABEL_NAMES[i.color] : 'без цвета'}`}
                  className="hit-44 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border"
                >
                  {i.color ? (
                    <span className="h-3.5 w-3.5 rounded-full" style={{ background: `var(--${i.color})` }} />
                  ) : (
                    <span className="h-3.5 w-3.5 rounded-full border border-dashed border-text-tertiary" />
                  )}
                </button>
              )
            : undefined
        }
        extraOf={
          parentGroup
            ? (i) => (
                <PickerField
                  chip
                  label={parentGroup.item_name}
                  items={parentItems.filter((p) => !p.archived || p.id === i.parent_item_id)}
                  value={i.parent_item_id}
                  onChange={(parentItemId) =>
                    updateItem.mutate({ id: i.id, fields: { parent_item_id: parentItemId } }, { onError })
                  }
                  placeholder={parentGroup.item_name}
                  emptyLabel={`входит в: ${parentGroup.item_name.toLowerCase()}…`}
                  noneLabel={undefined}
                  hint={`Задачи с «${i.name}» получат это значение сами`}
                  // клиента, которого ещё нет, заводим прямо здесь
                  onCreate={(name, onCreated) =>
                    createItem.mutate({ groupId: parentGroup.id, name }, { onError, onSuccess: (row) => onCreated(row.id) })
                  }
                />
              )
            : undefined
        }
        header={<GroupSettings group={group} model={model} />}
        footer={
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="h-11 rounded-sm text-base font-medium text-danger-text"
              style={{ border: '1px solid var(--danger-line)' }}
            >
              Удалить группу
            </button>
            <p className="text-center text-xs leading-[1.45] text-text-secondary">
              Задачи и их часы останутся — пропадёт только эта раскладка
            </p>
          </div>
        }
      />
      <Sheet open={coloring !== null} onClose={() => setColoring(null)} title={`Цвет: ${coloring?.name ?? ''}`}>
        <p className="text-sm text-text-secondary">Точка этого цвета стоит у задач в списках, на плашке учёта и в сводке.</p>
        <div className="grid grid-cols-4 gap-3 pb-1">
          {LABELS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                if (coloring) updateItem.mutate({ id: coloring.id, fields: { color: c } }, { onError })
                setColoring(null)
              }}
              aria-label={LABEL_NAMES[c]}
              aria-pressed={coloring?.color === c}
              className="flex flex-col items-center gap-1.5 rounded-md py-2 active:bg-surface-sunken"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-full text-text-inverse"
                style={{ background: `var(--${c})` }}
              >
                {coloring?.color === c && <Check size={18} />}
              </span>
              <span className="text-xs text-text-secondary">{LABEL_NAMES[c]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            if (coloring) updateItem.mutate({ id: coloring.id, fields: { color: null } }, { onError })
            setColoring(null)
          }}
          className="min-h-11 rounded-sm text-base font-medium text-text-secondary active:bg-surface-sunken"
        >
          Без цвета
        </button>
      </Sheet>
      <ConfirmDialog
        open={confirmingDelete}
        title={`Удалить группу «${group.name}»?`}
        description={[
          affected > 0 ? `У ${plural(affected, TASKS_GEN)} пропадёт значение этой группы.` : null,
          items.length > 0 ? `Значения группы (${items.length}) удалятся вместе с описаниями и файлами.` : null,
          'Сами задачи, их часы и история останутся.',
        ]
          .filter(Boolean)
          .join(' ')}
        confirmLabel="Удалить"
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false)
          deleteGroup.mutate(group, {
            onError,
            onSuccess: () => {
              showSuccess(`Группа «${group.name}» удалена`)
              navigate('/groups', { replace: true })
            },
          })
        }}
      />
    </>
  )
}

/** Настройки группы сохраняются сразу: имя — по уходу с поля, переключатели — по нажатию. */
function GroupSettings({ group, model }: { group: Group; model: GroupModel }) {
  const update = useUpdateGroup()
  const { showError } = useToast()
  const onError = (error: unknown) => showError(describeError(error))
  const [name, setName] = useState(group.name)
  const [itemName, setItemName] = useState(group.item_name)

  useEffect(() => {
    setName(group.name)
    setItemName(group.item_name)
  }, [group.id, group.name, group.item_name])

  const parents = allowedParents(model, group)

  const toggle = (key: 'required' | 'show_in_list', title: string, hint: string) => (
    <label className="flex min-h-11 items-center gap-2.5 py-1">
      <input
        type="checkbox"
        checked={group[key]}
        onChange={(e) => update.mutate({ id: group.id, fields: { [key]: e.target.checked } }, { onError })}
        className="h-[18px] w-[18px] shrink-0 accent-accent"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-base text-text-secondary">{title}</span>
        <span className="text-xs leading-[1.4] text-text-secondary">{hint}</span>
      </span>
    </label>
  )

  return (
    <div
      className="mb-5 flex flex-col gap-3 rounded-md p-3.5"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
    >
      <Overline>Настройки группы</Overline>
      <div className="grid grid-cols-2 gap-[9px]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <FieldLabel>Группа</FieldLabel>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim()
              if (v && v !== group.name) update.mutate({ id: group.id, fields: { name: v } }, { onError })
              else setName(group.name)
            }}
            className={fieldClass}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <FieldLabel>Одно значение</FieldLabel>
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            onBlur={(e) => {
              const v = e.currentTarget.value.trim()
              if (v && v !== group.item_name) update.mutate({ id: group.id, fields: { item_name: v } }, { onError })
              else setItemName(group.item_name)
            }}
            className={fieldClass}
          />
        </div>
      </div>
      <div className="-my-1 flex flex-col">
        {toggle('required', 'Обязательна в задаче', 'без значения задачу не создать')}
        {toggle('show_in_list', 'Видна в строке задачи', 'значение показывается в списках рядом с часами')}
      </div>
      <PickerField
        label="Входит в группу"
        items={parents.map((g) => ({ id: g.id, name: g.name }))}
        value={group.parent_group_id}
        onChange={(parentId) => update.mutate({ id: group.id, fields: { parent_group_id: parentId } }, { onError })}
        placeholder="Группа"
        noneLabel="Ни во что не входит"
        hint="Каждое значение этой группы можно будет отнести к значению выбранной — в задаче оно подставится само. При смене связи прежние привязки сбрасываются"
      />
    </div>
  )
}
