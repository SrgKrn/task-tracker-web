import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useUpdateTask } from '../lib/queries/tasks'
import { describeError, useToast } from '../lib/Toast'
import type { Task } from '../lib/types'
import { linkifyParts, shortUrl } from '../lib/linkify'
import { ExternalLink } from './Icon'

/**
 * Описание задачи (0.66.6): поле растёт по тексту и сохраняется само, когда уходишь с него, —
 * как описание значения группы. После сохранения — уведомление с «Вернуть».
 * Готовый текст показывается со ссылками (0.67): ссылка открывается в новой вкладке, касание
 * мимо ссылки — правка. Поле ввода ссылки кликабельными сделать не может.
 */
export function TaskDescription({ task }: { task: Task }) {
  const update = useUpdateTask()
  const { showError, showSuccess } = useToast()
  const saved = task.description ?? ''
  const [draft, setDraft] = useState(saved)
  const [focused, setFocused] = useState(false)
  // правка открыта касанием по готовому тексту — поле сразу в фокус
  const [editing, setEditing] = useState(false)
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
  }, [draft, editing])

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  const commit = (value: string) => {
    setFocused(false)
    setEditing(false)
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

  if (!editing && !focused && draft.trim()) {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="Описание задачи. Нажмите, чтобы изменить"
        onClick={() => {
          // выделяли текст, чтобы скопировать, — не открываем правку
          if (window.getSelection()?.toString()) return
          setEditing(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) {
            e.preventDefault()
            setEditing(true)
          }
        }}
        className="min-h-[var(--tap)] w-full cursor-text rounded-md border border-border bg-surface px-3.5 py-3 text-base leading-[1.5] break-words whitespace-pre-wrap text-text lg:hover:border-border-strong"
      >
        {linkifyParts(draft).map((part, i) =>
          part.kind === 'text' ? (
            part.text
          ) : (
            <a
              key={i}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              title={part.href}
              onClick={(e) => e.stopPropagation()}
              className="text-accent-text underline decoration-1 underline-offset-2"
            >
              {shortUrl(part.text)}
              <ExternalLink size={12} className="ml-0.5 inline" />
            </a>
          ),
        )}
      </div>
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
          setEditing(false)
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
