import { useState } from 'react'
import { MonthGrid } from './DatePicker'
import { Check, Close, Trash } from './Icon'
import { Menu, Popover } from './Popover'
import { MOD_KEY, Overline } from './ui'
import { pickableItems, type GroupModel } from '../lib/groups'
import { addDays, todayStr } from '../lib/period'
import { plural, TASKS } from '../lib/time'
import type { Status, Task } from '../lib/types'

export type BulkPanel = 'stage' | 'due' | 'group'

/**
 * Панель над выделенными задачами (0.63), как в Asana: сколько выбрано и что с ними
 * сделать — этап, срок, группа, новый период, готово, удалить. Всё с «Вернуть» в
 * уведомлении. Этап и срок открываются и с клавиатуры — E и D.
 */
export function BulkBar({
  tasks,
  statuses,
  model,
  panel,
  onPanel,
  onStage,
  onDue,
  onGroup,
  onNextPeriod,
  allDone,
  onDone,
  onDelete,
  onClear,
}: {
  tasks: Task[]
  statuses: Status[]
  model: GroupModel
  panel: BulkPanel | null
  onPanel: (panel: BulkPanel | null) => void
  onStage: (statusId: string | null) => void
  onDue: (date: string | null) => void
  onGroup: (groupId: string, itemId: string | null) => void
  onNextPeriod: () => void
  allDone: boolean
  onDone: () => void
  onDelete: () => void
  onClear: () => void
}) {
  // кнопки в состоянии, а не в ref: по E панель появляется и сразу открывает меню у кнопки
  const [stageEl, setStageEl] = useState<HTMLElement | null>(null)
  const [dueEl, setDueEl] = useState<HTMLElement | null>(null)
  const [groupEl, setGroupEl] = useState<HTMLElement | null>(null)
  const close = () => onPanel(null)
  const today = todayStr()

  const ordered = [...statuses].sort((a, b) => a.sort_order - b.sort_order)
  const commonStatus = tasks.every((t) => t.status_id === tasks[0]?.status_id) ? (tasks[0]?.status_id ?? null) : undefined
  const commonDue = tasks.every((t) => t.end_date === tasks[0]?.end_date) ? (tasks[0]?.end_date ?? null) : undefined
  const groupLabel = model.groups.length === 1 ? model.groups[0].name : 'Группы'

  const button = 'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium text-text hover:bg-surface-hover aria-expanded:bg-surface-selected'
  return (
    <div className="pointer-events-none sticky bottom-4 z-30 mt-4 flex justify-center px-5">
      <div
        role="toolbar"
        aria-label="Действия с выделенными задачами"
        className="bulk-bar sc pointer-events-auto flex max-w-full items-center overflow-x-auto rounded-full border border-border bg-surface p-1 shadow-popover"
      >
        <span className="tabular shrink-0 pr-1.5 pl-3 text-sm font-semibold whitespace-nowrap text-text">{plural(tasks.length, TASKS)}</span>
        <span className="h-5 w-px shrink-0 bg-divider" aria-hidden />
        <button ref={setStageEl} type="button" className={button} aria-expanded={panel === 'stage'} aria-haspopup="menu" onClick={() => onPanel(panel === 'stage' ? null : 'stage')} title="Этап · E">
          Этап
        </button>
        <button ref={setDueEl} type="button" className={button} aria-expanded={panel === 'due'} aria-haspopup="dialog" onClick={() => onPanel(panel === 'due' ? null : 'due')} title="Срок · D">
          Срок
        </button>
        {model.groups.length > 0 && (
          <button ref={setGroupEl} type="button" className={button} aria-expanded={panel === 'group'} aria-haspopup="dialog" onClick={() => onPanel(panel === 'group' ? null : 'group')}>
            {groupLabel}
          </button>
        )}
        <button type="button" className={button} onClick={onNextPeriod} title="Следующий спринт с незакрытыми подзадачами">
          Новый период
        </button>
        <button type="button" className={button} onClick={onDone} title={`${allDone ? 'Вернуть в работу' : 'Готово'} · ${MOD_KEY}+Enter`}>
          <Check size={14} className={allDone ? 'text-success' : 'text-text-secondary'} />
          {allDone ? 'В работу' : 'Готово'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Удалить · Delete"
          aria-label={`Удалить ${plural(tasks.length, TASKS)}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-danger-text hover:bg-danger-soft"
        >
          <Trash size={16} />
        </button>
        <button
          type="button"
          onClick={onClear}
          title="Снять выделение · Esc"
          aria-label="Снять выделение"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text"
        >
          <Close size={15} />
        </button>
      </div>

      {panel === 'stage' && stageEl && (
        <Menu
          anchor={stageEl}
          label="Этап выделенных задач"
          onClose={close}
          items={[
            { label: 'Без этапа', checked: commonStatus === null, onSelect: () => onStage(null) },
            ...ordered.map((s) => ({ label: s.label, checked: commonStatus === s.id, onSelect: () => onStage(s.id) })),
          ]}
        />
      )}

      {panel === 'due' && dueEl && (
        <Popover anchor={dueEl} label="Срок выделенных задач" onClose={close} minWidth={272} maxWidth={272} className="flex flex-col gap-1 p-1.5">
          {[
            { label: 'Сегодня', value: today },
            { label: 'Завтра', value: addDays(today, 1) },
            { label: 'Через неделю', value: addDays(today, 7) },
            { label: 'Без срока', value: null },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => {
                close()
                onDue(o.value)
              }}
              className="flex h-8 items-center justify-between rounded-sm px-2.5 text-left text-sm text-text outline-none hover:bg-surface-hover focus-visible:bg-surface-selected"
            >
              {o.label}
              {commonDue !== undefined && commonDue === o.value && <Check size={14} className="text-accent" />}
            </button>
          ))}
          <span className="mx-1 my-1 h-px bg-divider" aria-hidden />
          <div className="px-1.5 pb-1">
            <MonthGrid
              value={commonDue ?? null}
              onPick={(iso) => {
                close()
                onDue(iso)
              }}
            />
          </div>
        </Popover>
      )}

      {panel === 'group' && groupEl && (
        <Popover anchor={groupEl} label="Группы выделенных задач" onClose={close} minWidth={240} maxWidth={300} className="sc flex max-h-[60vh] flex-col gap-2 overflow-y-auto p-1.5">
          {model.groups.map((g) => {
            const common = tasks.every((t) => model.valueOf(t, g.id)?.id === model.valueOf(tasks[0], g.id)?.id)
              ? (model.valueOf(tasks[0], g.id)?.id ?? null)
              : undefined
            const items = pickableItems(model, g, [])
            return (
              <div key={g.id} className="flex flex-col">
                {model.groups.length > 1 && <Overline className="px-2.5 pt-1 pb-0.5">{g.name}</Overline>}
                {items.map((i) => (
                  <GroupOption key={i.id} label={i.name} checked={common === i.id} onClick={() => (close(), onGroup(g.id, i.id))} />
                ))}
                {!g.required && <GroupOption label="Не указано" muted checked={common === null} onClick={() => (close(), onGroup(g.id, null))} />}
              </div>
            )
          })}
        </Popover>
      )}
    </div>
  )
}

function GroupOption({ label, checked, muted = false, onClick }: { label: string; checked: boolean; muted?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-8 items-center justify-between gap-2 rounded-sm px-2.5 text-left text-sm outline-none hover:bg-surface-hover focus-visible:bg-surface-selected ${
        muted ? 'text-text-secondary' : 'text-text'
      }`}
    >
      <span className="min-w-0 truncate">{label}</span>
      {checked && <Check size={14} className="shrink-0 text-accent" />}
    </button>
  )
}
