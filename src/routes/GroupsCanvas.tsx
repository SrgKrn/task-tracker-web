import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ArrowLeft, ChevronRight, Close, Plus } from '../components/Icon'
import { Button, Chip, ClientDot, ListGroup, Overline, Segmented, Sheet, Switch } from '../components/ui'
import { PresetStructure } from '../components/PresetPreview'
import { PRESETS, presetByCode, presetPayload } from '../lib/presets'
import { useApplyPreset } from '../lib/queries/userSettings'
import { activeWorkspaceId } from '../lib/workspace'
import { NewGroupSheet } from './GroupsAdmin'
import { NODE_H, NODE_W, TASK_H, TASK_W, edgePath, layoutCanvas, taskFields, wouldCycle, type Point } from '../lib/canvas'
import { useGroupModel, type GroupModel } from '../lib/groups'
import { useCreateGroup, useCreateGroupItem, useUpdateGroup } from '../lib/queries/groups'
import { describeError, useToast } from '../lib/Toast'
import { tap } from '../lib/haptics'
import { plural } from '../lib/time'
import { RoomNote, useRoom } from '../components/Upgrade'
import type { Group, GroupItem } from '../lib/types'

const VALUES: [string, string, string] = ['значение', 'значения', 'значений']

/** шаблоны групп, которые чаще всего заводят: название, подпись поля, первые значения */
const TEMPLATES: { name: string; item: string; values: string[]; hint: string }[] = [
  { name: 'Клиенты', item: 'Клиент', values: [], hint: 'Для кого работа — к ним удобно привязать проекты' },
  { name: 'Виды работ', item: 'Вид работ', values: ['Дизайн', 'Разработка', 'Встречи', 'Правки'], hint: 'Что именно делаете' },
  { name: 'Контексты', item: 'Где', values: ['Дома', 'В городе', 'Онлайн', 'С телефона'], hint: 'Где задачу можно сделать' },
  { name: 'Сферы', item: 'Сфера', values: ['Здоровье', 'Дом', 'Финансы', 'Развитие'], hint: 'Для личных дел' },
  { name: 'Энергия', item: 'Энергия', values: ['Много', 'Средне', 'Мало'], hint: 'Сколько сил нужно' },
]

type LinkStep = { step: 'child' } | { step: 'parent'; childId: string } | null
type Pending = { childId: string; parentId: string | null; title: string; description: string }

/**
 * Структура холстом: группа — блок со значениями, «входит в» — стрелка к группе, в которую
 * она входит. Внизу — «Задача»: по значению из каждой группы, связанные подставятся сами.
 * Блоки двигаются пальцем, место запоминается. Старый список — по ссылке «Списком».
 */
export function GroupsCanvas() {
  const navigate = useNavigate()
  const model = useGroupModel()
  const update = useUpdateGroup()
  const { showError, showSuccess } = useToast()
  const onError = (e: unknown) => showError(describeError(e))

  const [view, setView] = useState<'groups' | 'values'>('groups')
  const [link, setLink] = useState<LinkStep>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [creatingOwn, setCreatingOwn] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [drag, setDrag] = useState<{ id: string; p: Point } | null>(null)

  const hostRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(340)
  useLayoutEffect(() => {
    const el = hostRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [view])

  const { pos, task, height } = layoutCanvas(model.groups, width)
  const at = (id: string) => (drag?.id === id ? drag.p : pos.get(id)!)
  const fields = taskFields(model.groups)
  // стрелки в «Задачу» — к её середине: блок шире группы
  const taskAnchor = { x: task.x + (TASK_W - NODE_W) / 2, y: task.y }

  /** связать или отвязать: если у значений уже есть «входит в», они сбросятся — спросить */
  function relink(childId: string, parentId: string | null) {
    const child = model.groupById.get(childId)!
    const linkedValues = model.itemsOf(childId).filter((i) => i.parent_item_id).length
    const parent = parentId ? model.groupById.get(parentId) : undefined
    const apply = () =>
      update.mutate(
        { id: childId, fields: { parent_group_id: parentId } },
        {
          onError,
          onSuccess: () =>
            showSuccess(parent ? `«${child.name}» входит в «${parent.name}»` : `«${child.name}» больше ни во что не входит`),
        },
      )
    if (linkedValues > 0 && child.parent_group_id) {
      const was = model.groupById.get(child.parent_group_id)
      setPending({
        childId,
        parentId,
        title: parent ? `«${child.name}» — в «${parent.name}»?` : `Отвязать «${child.name}»?`,
        description: `У ${plural(linkedValues, VALUES)} группы указано, в какое значение «${was?.name ?? ''}» они входят. Эти связи сбросятся — их нужно будет расставить заново.`,
      })
      return
    }
    apply()
  }

  function tapNode(id: string) {
    tap()
    if (!link) return setSelected(id)
    if (link.step === 'child') return setLink({ step: 'parent', childId: id })
    if (id === link.childId) return
    const child = model.groupById.get(link.childId)!
    const parent = model.groupById.get(id)!
    setLink(null)
    if (wouldCycle(model.groups, link.childId, id)) {
      showError(`Получился бы круг: «${parent.name}» уже входит в «${child.name}»`)
      return
    }
    if (child.parent_group_id === id) return
    relink(link.childId, id)
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>, g: Group) {
    if (e.button !== 0) return
    const el = e.currentTarget
    const start = { x: e.clientX, y: e.clientY }
    const origin = pos.get(g.id)!
    let moved = false
    let last = origin
    el.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x
      const dy = ev.clientY - start.y
      if (!moved && Math.hypot(dx, dy) < 6) return
      moved = true
      last = {
        x: Math.min(Math.max(0, origin.x + dx), Math.max(0, width - NODE_W)),
        y: Math.max(0, origin.y + dy),
      }
      setDrag({ id: g.id, p: last })
    }
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      if (!moved) {
        setDrag(null)
        tapNode(g.id)
        return
      }
      // место — в базу; пока ответ идёт, блок стоит, где его отпустили
      update.mutate(
        { id: g.id, fields: { canvas_x: Math.round(last.x), canvas_y: Math.round(last.y) } },
        { onError, onSettled: () => setDrag(null) },
      )
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const hint =
    link?.step === 'child'
      ? 'Выберите группу, которая будет входить в другую'
      : link?.step === 'parent'
        ? `Теперь — во что входит «${model.groupById.get(link.childId)?.name}»`
        : null

  return (
    <div className="safe-top-page page mx-auto max-w-lg px-5 pt-3.5 pb-8 lg:max-w-[var(--page-wide)]">
      <button onClick={() => navigate('/settings')} className="mb-4 flex items-center gap-2 text-base text-text-secondary lg:hidden">
        <ArrowLeft size={15} />
        Профиль
      </button>
      <h1 className="mb-1 text-xl font-semibold tracking-[-0.01em] text-text">Структура</h1>
      <p className="mb-4 text-sm text-text-secondary">
        Группы — то, по чему раскладываются задачи. Стрелка «входит в»: выберете проект в задаче — клиент подставится сам.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented<'groups' | 'values'>
          value={view}
          onChange={(v) => {
            setView(v)
            setLink(null)
          }}
          options={[
            { value: 'groups', label: 'Группы' },
            { value: 'values', label: 'Значения' },
          ]}
        />
        <span className="flex-1" />
        {view === 'groups' && (
          <>
            <Button
              variant={link ? 'primary' : 'secondary'}
              onClick={() => setLink(link ? null : { step: 'child' })}
              disabled={model.groups.length < 2}
            >
              {link ? 'Отмена' : 'Связать'}
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus size={15} />
              Группа
            </Button>
          </>
        )}
      </div>

      {hint && <p className="mb-2 rounded-sm bg-accent-soft px-3 py-2 text-sm text-accent-text">{hint}</p>}

      {view === 'groups' ? (
        <>
          <div
            ref={hostRef}
            className="relative w-full overflow-hidden rounded-md bg-surface-sunken"
            style={{
              height,
              backgroundImage: 'radial-gradient(var(--border-strong) 1px, transparent 1.2px)',
              backgroundSize: '16px 16px',
            }}
          >
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              <defs>
                <marker id="canvas-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M0 0L10 5L0 10z" fill="var(--text-secondary)" />
                </marker>
              </defs>
              {/* в «Задачу» — пунктир от каждой группы; бледный — значение подставится само */}
              {fields.map((f) => {
                const e = edgePath(at(f.group.id), taskAnchor)
                return (
                  <path
                    key={`t-${f.group.id}`}
                    d={e.d}
                    fill="none"
                    stroke={f.auto ? 'var(--border-strong)' : 'var(--text-tertiary)'}
                    strokeWidth={1.4}
                    strokeDasharray="4 4"
                    markerEnd="url(#canvas-arrow)"
                  />
                )
              })}
              {model.groups
                .filter((g) => g.parent_group_id && pos.has(g.parent_group_id))
                .map((g) => (
                  <path
                    key={`e-${g.id}`}
                    d={edgePath(at(g.id), at(g.parent_group_id!)).d}
                    fill="none"
                    stroke="var(--text-secondary)"
                    strokeWidth={1.8}
                    markerEnd="url(#canvas-arrow)"
                  />
                ))}
            </svg>

            {/* подписи стрелок — кнопки: крестик отвязывает */}
            {model.groups
              .filter((g) => g.parent_group_id && pos.has(g.parent_group_id))
              .map((g) => {
                const { mid } = edgePath(at(g.id), at(g.parent_group_id!))
                return (
                  <span
                    key={`l-${g.id}`}
                    className="absolute z-10 flex h-6 -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border border-border bg-surface pr-0.5 pl-2 text-xs text-text-secondary"
                    style={{ left: mid.x, top: mid.y }}
                  >
                    входит в
                    <button
                      type="button"
                      onClick={() => relink(g.id, null)}
                      className="hit-44 flex h-5 w-5 items-center justify-center rounded-full text-text-tertiary hover:text-text"
                      aria-label={`Отвязать «${g.name}» от «${model.groupById.get(g.parent_group_id!)?.name}»`}
                    >
                      <Close size={11} />
                    </button>
                  </span>
                )
              })}

            {model.groups.map((g) => (
              <GroupNode
                key={g.id}
                group={g}
                model={model}
                at={at(g.id)}
                dragging={drag?.id === g.id}
                pickable={!!link && !(link.step === 'parent' && link.childId === g.id)}
                picked={link?.step === 'parent' && link.childId === g.id}
                onPointerDown={(e) => onPointerDown(e, g)}
                onKey={() => tapNode(g.id)}
              />
            ))}

            <div
              className="absolute flex flex-col items-center justify-center rounded-md bg-text px-3 text-center text-text-inverse"
              style={{ left: task.x, top: task.y, width: TASK_W, height: TASK_H }}
            >
              <span className="text-sm font-semibold">Задача</span>
              <span className="text-xs opacity-70">по значению из каждой группы</span>
            </div>

            {!model.loading && model.groups.length === 0 && (
              <p className="absolute inset-x-6 top-10 text-center text-base text-text-secondary">
                Групп пока нет — задачи живут одним списком. Добавьте первую кнопкой «Группа».
              </p>
            )}
          </div>

          {fields.length > 0 && (
            <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-surface px-3.5 py-3">
              <span className="text-sm text-text-secondary">Новая задача получит поля</span>
              <span className="flex flex-wrap gap-1.5">
                {fields.map((f) => (
                  <span
                    key={f.group.id}
                    className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${
                      f.auto ? 'border border-dashed border-border-strong text-text-tertiary' : 'bg-surface-sunken text-text-secondary'
                    }`}
                  >
                    {f.group.item_name}
                    {f.group.required && !f.auto ? ' *' : ''}
                  </span>
                ))}
              </span>
              <span className="text-sm text-text-secondary">
                {fields.some((f) => f.auto)
                  ? fields
                      .filter((f) => f.auto)
                      .map((f) => `«${f.group.item_name}» подставится сам из «${f.from?.item_name}»`)
                      .join('; ') + '.'
                  : 'Связей нет — каждое поле выбирается отдельно.'}
              </span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-text-tertiary">Блоки двигаются пальцем — место запоминается</span>
            <span className="flex gap-3">
              {model.groups.some((g) => g.canvas_x != null) && (
                <button
                  type="button"
                  className="min-h-11 font-medium text-accent-text"
                  onClick={() =>
                    model.groups
                      .filter((g) => g.canvas_x != null)
                      .forEach((g) => update.mutate({ id: g.id, fields: { canvas_x: null, canvas_y: null } }, { onError }))
                  }
                >
                  Выровнять
                </button>
              )}
              <Link to="/groups/list" className="flex min-h-11 items-center font-medium text-accent-text">
                Списком
              </Link>
            </span>
          </div>
        </>
      ) : (
        <ValuesTree model={model} />
      )}

      {selected && model.groupById.get(selected) && (
        <GroupSheet
          group={model.groupById.get(selected)!}
          model={model}
          onClose={() => setSelected(null)}
          onLink={() => {
            setLink({ step: 'parent', childId: selected })
            setSelected(null)
          }}
          onUnlink={() => {
            relink(selected, null)
            setSelected(null)
          }}
        />
      )}

      <AddGroupSheet
        open={adding}
        onClose={() => setAdding(false)}
        onOwn={() => {
          setAdding(false)
          setCreatingOwn(true)
        }}
        existing={model.groups.map((g) => g.name.toLowerCase())}
      />
      <NewGroupSheet
        open={creatingOwn}
        model={model}
        onClose={() => setCreatingOwn(false)}
        onCreated={(g) => {
          setCreatingOwn(false)
          showSuccess(`Группа «${g.name}» добавлена`)
        }}
      />

      <ConfirmDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        description={pending?.description}
        confirmLabel={pending?.parentId ? 'Связать' : 'Отвязать'}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            const { childId, parentId } = pending
            const child = model.groupById.get(childId)
            update.mutate(
              { id: childId, fields: { parent_group_id: parentId } },
              { onError, onSuccess: () => showSuccess(parentId ? 'Связь изменена' : `«${child?.name}» отвязана`) },
            )
          }
          setPending(null)
        }}
      />
    </div>
  )
}

function GroupNode({
  group,
  model,
  at,
  dragging,
  pickable,
  picked,
  onPointerDown,
  onKey,
}: {
  group: Group
  model: GroupModel
  at: Point
  dragging: boolean
  pickable: boolean
  picked: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void
  onKey: () => void
}) {
  const items = model.itemsOf(group.id).filter((i) => !i.archived)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Группа «${group.name}», ${plural(items.length, VALUES)}`}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onKey()
        }
      }}
      className={`absolute z-20 flex touch-none flex-col rounded-md border-2 bg-surface px-2.5 pt-2 pb-2.5 select-none ${
        dragging ? 'cursor-grabbing shadow-drag' : 'cursor-grab shadow-sm'
      } ${picked ? 'border-accent' : pickable ? 'border-dashed border-accent' : 'border-border'}`}
      style={{ left: at.x, top: at.y, width: NODE_W, height: NODE_H }}
    >
      <span className="flex items-baseline justify-between gap-1.5">
        <span className="truncate text-sm font-semibold text-text">{group.name}</span>
        <span className="tabular font-mono text-xs text-text-tertiary">{items.length}</span>
      </span>
      <span className="truncate text-xs text-text-tertiary">поле «{group.item_name}»</span>
      {/* два ряда значений ровно по высоте: третий не режется посередине, он просто не показан */}
      <span className="mt-1.5 flex h-11 flex-wrap content-start gap-1 overflow-hidden">
        {items.slice(0, 4).map((i) => (
          <span key={i.id} className="inline-flex h-5 max-w-full items-center gap-1 rounded-full bg-surface-sunken px-1.5 text-xs text-text-secondary">
            <ClientDot color={i.color} size={6} />
            <span className="truncate">{i.name}</span>
          </span>
        ))}
      </span>
      <span className="mt-auto flex gap-1 truncate text-xs">
        <span className={group.required ? 'text-accent-text' : 'text-text-tertiary'}>{group.required ? 'обяз.' : 'по желанию'}</span>
        {group.show_in_list && <span className="text-accent-text">· в строке</span>}
      </span>
    </div>
  )
}

/** Настройки группы в шторке: переключатели сразу, значения и удаление — на странице группы. */
function GroupSheet({
  group,
  model,
  onClose,
  onLink,
  onUnlink,
}: {
  group: Group
  model: GroupModel
  onClose: () => void
  onLink: () => void
  onUnlink: () => void
}) {
  const update = useUpdateGroup()
  const { showError } = useToast()
  const onError = (e: unknown) => showError(describeError(e))
  const parent = group.parent_group_id ? model.groupById.get(group.parent_group_id) : undefined
  const children = model.childGroupsOf(group.id)
  const items = model.itemsOf(group.id).filter((i) => !i.archived)
  const row = 'flex min-h-14 items-center gap-3 px-3.5 py-2.5'
  return (
    <Sheet open onClose={onClose} title={group.name}>
      <p className="-mt-2 text-sm text-text-secondary">
        Поле в задаче: «{group.item_name}» · {plural(items.length, VALUES)}
      </p>
      <ListGroup>
        <div className={row}>
          <span className="min-w-0 flex-1">
            <span className="block text-base text-text">Обязательная</span>
            <span className="block text-sm text-text-secondary">Без значения задачу не создать</span>
          </span>
          <Switch on={group.required} onChange={(v) => update.mutate({ id: group.id, fields: { required: v } }, { onError })} ariaLabel="Обязательная" />
        </div>
        <div className={row}>
          <span className="min-w-0 flex-1">
            <span className="block text-base text-text">Видна в строке задачи</span>
            <span className="block text-sm text-text-secondary">Значение показывается в списках</span>
          </span>
          <Switch
            on={group.show_in_list}
            onChange={(v) => update.mutate({ id: group.id, fields: { show_in_list: v } }, { onError })}
            ariaLabel="Видна в строке задачи"
          />
        </div>
        <div className={row}>
          <span className="min-w-0 flex-1">
            <span className="block text-base text-text">Входит в</span>
            <span className="block text-sm text-text-secondary">
              {parent ? `«${parent.name}»` : 'Ни во что — верхний уровень'}
              {children.length ? ` · в неё входит ${children.map((c) => `«${c.name}»`).join(', ')}` : ''}
            </span>
          </span>
          {parent ? (
            <Button variant="ghost" onClick={onUnlink}>
              Отвязать
            </Button>
          ) : (
            model.groups.length > 1 && (
              <Button variant="ghost" className="text-accent-text" onClick={onLink}>
                Связать
              </Button>
            )
          )}
        </div>
      </ListGroup>
      {items.length > 0 && (
        <span className="flex flex-wrap gap-1.5">
          {items.slice(0, 12).map((i) => (
            <Link
              key={i.id}
              to={`/items/${i.id}`}
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 text-sm text-text-secondary"
            >
              <ClientDot color={i.color} size={7} />
              {i.name}
            </Link>
          ))}
          {items.length > 12 && <span className="inline-flex h-7 items-center px-1 text-sm text-text-tertiary">ещё {items.length - 12}</span>}
        </span>
      )}
      <Link
        to={`/groups/${group.id}`}
        className="flex min-h-12 items-center justify-between rounded-md border border-border px-3.5 text-base font-medium text-text"
      >
        Значения, цвета и удаление
        <ChevronRight size={15} className="text-text-secondary" />
      </Link>
    </Sheet>
  )
}

function AddGroupSheet({
  open,
  onClose,
  onOwn,
  existing,
}: {
  open: boolean
  onClose: () => void
  onOwn: () => void
  existing: string[]
}) {
  const create = useCreateGroup()
  const createItem = useCreateGroupItem()
  const { showError, showSuccess } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [presetCode, setPresetCode] = useState<string | null>(null)
  const room = useRoom('groups', existing.length)

  async function add(t: (typeof TEMPLATES)[number]) {
    setBusy(t.name)
    try {
      const g = await create.mutateAsync({ name: t.name, item_name: t.item })
      for (const v of t.values) await createItem.mutateAsync({ groupId: g.id, name: v })
      showSuccess(`Группа «${t.name}» добавлена — перетащите её и свяжите`)
      setBusy(null)
      onClose()
    } catch (e) {
      showError(describeError(e))
      setBusy(null)
    }
  }

  return (
    presetCode ? (
      <PresetMergeSheet code={presetCode} onCode={setPresetCode} existing={existing} onClose={() => { setPresetCode(null); onClose() }} />
    ) : (
    !room.allowed ? (
      <Sheet open={open} onClose={onClose} title="Новая группа">
        <RoomNote room={room} what="Ещё одна группа в этом пространстве" max="Это максимум групп в пространстве." />
      </Sheet>
    ) : (
    <Sheet open={open} onClose={onClose} title="Новая группа">
      <p className="-mt-2 text-sm text-text-secondary">Шаблон потом можно переименовать и дополнить</p>
      <ListGroup>
        {TEMPLATES.filter((t) => !existing.includes(t.name.toLowerCase())).map((t) => (
          <button
            key={t.name}
            type="button"
            disabled={!!busy}
            onClick={() => add(t)}
            className="flex min-h-14 items-center gap-3 px-3.5 py-2.5 text-left active:bg-surface-sunken disabled:opacity-60 lg:hover:bg-surface-hover"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-base text-text">{t.name}</span>
              <span className="block truncate text-sm text-text-secondary">{t.values.length ? t.values.join(', ') : t.hint}</span>
            </span>
            <span className="text-sm font-medium text-accent-text">{busy === t.name ? 'Добавляю…' : 'Добавить'}</span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPresetCode(PRESETS[0].code)}
          className="flex min-h-14 items-center gap-3 px-3.5 py-2.5 text-left active:bg-surface-sunken lg:hover:bg-surface-hover"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-base text-text">Из пресета</span>
            <span className="block text-sm text-text-secondary">Готовые наборы: клиенты, учёба, спорт… — добавятся недостающие</span>
          </span>
          <ChevronRight size={15} className="text-text-secondary" />
        </button>
        <button
          type="button"
          onClick={onOwn}
          className="flex min-h-14 items-center gap-3 px-3.5 py-2.5 text-left active:bg-surface-sunken lg:hover:bg-surface-hover"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-base text-text">Своя группа</span>
            <span className="block text-sm text-text-secondary">Название и поле — ваши</span>
          </span>
          <ChevronRight size={15} className="text-text-secondary" />
        </button>
      </ListGroup>
    </Sheet>
    )
    )
  )
}

/**
 * Пресет поверх своей структуры: добавятся только группы и значения, которых ещё нет; свои
 * группы, связи и этапы не трогаются. Методика и примеры — по желанию.
 */
function PresetMergeSheet({
  code,
  onCode,
  existing,
  onClose,
}: {
  code: string
  onCode: (code: string) => void
  existing: string[]
  onClose: () => void
}) {
  const apply = useApplyPreset()
  const { showError, showSuccess } = useToast()
  const preset = presetByCode(code)!
  const fresh = preset.groups.filter((g) => !existing.includes(g.name.toLowerCase()))
  return (
    <Sheet open onClose={onClose} title="Добавить из пресета">
      <span className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {PRESETS.map((p) => (
          <Chip key={p.code} active={p.code === code} onClick={() => onCode(p.code)}>
            {p.title}
          </Chip>
        ))}
      </span>
      {fresh.length ? (
        <PresetStructure preset={preset} examples={false} skip={existing} merge />
      ) : (
        <p className="text-base text-text-secondary">
          Все группы этого пресета у вас уже есть — добавятся только недостающие значения.
        </p>
      )}
      <p className="text-sm text-text-secondary">Ваши группы, связи и этапы останутся как есть.</p>
      <Button
        variant="primary"
        size="lg"
        loading={apply.isPending}
        onClick={() =>
          apply.mutate(
            { preset: presetPayload(preset, {}, { merge: true }), options: { settings: false, examples: false }, workspace: activeWorkspaceId() },
            {
              onError: (e) => showError(describeError(e)),
              onSuccess: (r) => {
                showSuccess(
                  r.groups || r.values || r.tasks
                    ? `Добавлено: ${[r.groups ? plural(r.groups, GROUPS) : null, r.values ? plural(r.values, VALUES) : null, r.tasks ? plural(r.tasks, TASK_WORDS) : null].filter(Boolean).join(', ')}`
                    : 'Нового нет — всё уже на месте',
                )
                onClose()
              },
            },
          )
        }
      >
        Добавить
      </Button>
    </Sheet>
  )
}

const GROUPS: [string, string, string] = ['группа', 'группы', 'групп']
const TASK_WORDS: [string, string, string] = ['задача', 'задачи', 'задач']

/** Те же связи на уровень глубже: клиенты и их проекты деревом. Нажатие — карточка значения. */
function ValuesTree({ model }: { model: GroupModel }) {
  const roots = model.groups.filter((g) => !g.parent_group_id || !model.groupById.has(g.parent_group_id))
  const live = (groupId: string) => model.itemsOf(groupId).filter((i) => !i.archived)

  function Kids({ item, group, depth }: { item: GroupItem; group: Group; depth: number }) {
    const childGroups = model.childGroupsOf(group.id)
    const kids = childGroups.flatMap((cg) => live(cg.id).filter((i) => i.parent_item_id === item.id).map((i) => ({ i, cg })))
    if (kids.length === 0 || depth > 3) return null
    return (
      <span className="mt-1.5 ml-1 flex flex-col gap-1.5 border-l-2 border-border-strong pl-3">
        {kids.map(({ i, cg }) => (
          <span key={i.id} className="flex flex-col">
            <Link to={`/items/${i.id}`} className="rounded-sm bg-surface-sunken px-2.5 py-1.5 text-sm text-text">
              {i.name}
            </Link>
            <Kids item={i} group={cg} depth={depth + 1} />
          </span>
        ))}
      </span>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {roots.map((g) => {
        const childGroups = model.childGroupsOf(g.id)
        const items = live(g.id)
        if (childGroups.length === 0) {
          return (
            <section key={g.id} className="flex flex-col gap-2">
              <Overline>
                {g.name} · {items.length}
              </Overline>
              <span className="flex flex-wrap gap-1.5">
                {items.map((i) => (
                  <Link key={i.id} to={`/items/${i.id}`} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 text-sm text-text">
                    <ClientDot color={i.color} size={7} />
                    {i.name}
                  </Link>
                ))}
                {items.length === 0 && <span className="text-sm text-text-tertiary">Значений нет</span>}
              </span>
            </section>
          )
        }
        const loose = childGroups.flatMap((cg) => live(cg.id).filter((i) => !i.parent_item_id))
        return (
          <section key={g.id} className="flex flex-col gap-2">
            <Overline>
              {g.name} → {childGroups.map((c) => c.name).join(', ')}
            </Overline>
            {items.map((i) => (
              <div key={i.id} className="rounded-md border border-border bg-surface px-3 py-2.5">
                <Link to={`/items/${i.id}`} className="flex items-center gap-2 text-base font-semibold text-text">
                  <ClientDot color={i.color} />
                  {i.name}
                </Link>
                <Kids item={i} group={g} depth={1} />
              </div>
            ))}
            {loose.length > 0 && (
              <div className="rounded-md border border-dashed border-border-strong px-3 py-2.5">
                <span className="text-sm text-text-secondary">Ещё не распределены: </span>
                <span className="text-sm text-text">{loose.map((i) => i.name).join(', ')}</span>
                <span className="block text-xs text-text-tertiary">Укажите, во что входят, на странице группы</span>
              </div>
            )}
          </section>
        )
      })}
      <p className="text-sm text-text-tertiary">Нажмите на значение — откроется его карточка с описанием, файлами и историей.</p>
    </div>
  )
}
