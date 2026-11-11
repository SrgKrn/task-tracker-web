import { useLayoutEffect, useRef, useState } from 'react'
import { useUpdateTask } from '../lib/queries/tasks'
import { describeError, useToast } from '../lib/Toast'
import type { Task } from '../lib/types'

/**
 * Описание задачи (0.66.6): поле растёт по тексту и сохраняется само, когда уходишь с него, —
 * как описание значения группы. После сохранения — уведомление с «Вернуть».
 */
export function TaskDescription({ task }: { task: Task }) {
  const update = useUpdateTask()
  const { showError, showSuccess } = useToast()
  const saved = task.description ?? ''
  const [draft, setDraft] = useState(saved)
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  // другая задача или правка с другого устройства — показываем новое, если сейчас не печатают
  const [shown, setShown] = useState({ id: task.id, saved })
  if (shown.id !== task.id || (!focused && shown.saved !== saved)) {
    setShown({ id: task.id, saved })
    setDraft(saved)
  }

  // высота по тексту: без прокрутки внутри поля; пересчёт и при смене ширины (поворот,
  // граница списка на компьютере) — иначе осталась бы высота для прежних переносов
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + 2}px`
    }
    fit()
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [draft])

  const commit = (value: string) => {
    setFocused(false)
    const next = value.replace(/\s+$/, '')
    if (next === saved) return
    update.mutate(
      { id: task.id, fields: { description: next } },
      {
        onError: (err) => showError(describeError(err)),
        onSuccess: () =>
          showSuccess(next ? 'Описание сохранено' : 'Описание удалено', {
            label: 'Вернуть',
            onAction: () =>
              update.mutate({ id: task.id, fields: { description: saved } }, { onError: (err) => showError(describeError(err)) }),
          }),
      },
    )
  }

  return (
    <textarea
      ref={ref}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur()
        if (e.key === 'Escape') {
          e.stopPropagation()
          setDraft(saved)
          setFocused(false)
          requestAnimationFrame(() => ref.current?.blur())
        }
      }}
      rows={2}
      maxLength={20000}
      aria-label="Описание задачи"
      placeholder="Что сделать, о чём договорились, ссылки. Сохраняется само"
      className="min-h-[var(--tap)] w-full resize-none overflow-hidden rounded-md border border-border bg-surface px-3.5 py-3 text-base leading-[1.5] text-text placeholder:text-text-tertiary focus:border-accent"
    />
  )
}
