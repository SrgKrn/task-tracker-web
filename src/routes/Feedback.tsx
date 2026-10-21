import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, EmptyState, FieldLabel, Overline, Segmented, Tag, fieldClass, type TagTone } from '../components/ui'
import { Camera, Close, Star } from '../components/Icon'
import { describeError, useToast } from '../lib/Toast'
import {
  KIND_LABEL,
  MAX_SCREENSHOTS,
  STATUS_LABEL,
  useMarkRepliesSeen,
  useMyFeedback,
  useScreenshotUrls,
  useSendFeedback,
  type Feedback,
  type FeedbackKind,
  type FeedbackStatus,
} from '../lib/queries/feedback'
import { SettingsPage } from './Settings'

const KIND_HINT: Record<FeedbackKind, string> = {
  idea: 'Чего не хватает или что сделать удобнее',
  bug: 'Что сделали, что ожидали и что получилось. Скриншот очень поможет',
  review: 'Как вам трекер в целом',
  other: 'Вопрос, тариф, что угодно',
}

export const STATUS_TONE: Record<FeedbackStatus, TagTone> = {
  new: 'neutral',
  in_progress: 'accent',
  done: 'success',
  declined: 'neutral',
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')
}

/** Оценка звёздами: пять кнопок, выбранные — залиты. */
export function Stars({ value, onChange, size = 28 }: { value: number | null; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="flex gap-1" role={onChange ? 'radiogroup' : undefined} aria-label="Оценка">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = value !== null && n <= value
        const star = <Star size={size} filled={on} className={on ? 'text-accent' : 'text-text-tertiary'} />
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} из 5`}
            onClick={() => onChange(n)}
            className="hit-44 flex items-center justify-center"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        )
      })}
    </div>
  )
}

/** «Профиль → Написать нам»: форма обращения и свои обращения с ответами. */
export function FeedbackPage() {
  return (
    <SettingsPage title="Написать нам">
      <FeedbackForm />
      <MyFeedback />
    </SettingsPage>
  )
}

function FeedbackForm() {
  const [kind, setKind] = useState<FeedbackKind>('idea')
  const [rating, setRating] = useState<number | null>(null)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const send = useSendFeedback()
  const { showError, showSuccess } = useToast()

  const previews = useObjectUrls(files)
  const canSend = body.trim().length > 0 && (kind !== 'review' || rating !== null)

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSend) return
        send.mutate(
          { kind, rating, body, files },
          {
            onError: (err) => showError(describeError(err)),
            onSuccess: () => {
              setBody('')
              setRating(null)
              setFiles([])
              showSuccess('Отправлено. Ответ придёт сюда и пушем')
            },
          },
        )
      }}
    >
      <p className="text-sm leading-[1.5] text-text-secondary">
        Предложение, ошибка или отзыв — всё читаем сами. Ответ придёт уведомлением и появится ниже.
      </p>
      <Segmented<FeedbackKind>
        stretch
        value={kind}
        onChange={setKind}
        options={(Object.keys(KIND_LABEL) as FeedbackKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
      />
      {kind === 'review' && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Оценка</FieldLabel>
          <Stars value={rating} onChange={setRating} />
        </div>
      )}
      <label className="flex flex-col gap-1.5">
        <FieldLabel>{KIND_HINT[kind]}</FieldLabel>
        <textarea
          id="feedback-body"
          rows={5}
          maxLength={5000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={kind === 'bug' ? 'Например: нажимаю «Начать учёт» в карточке — ничего не происходит' : 'Напишите как есть'}
          className={`${fieldClass} h-auto resize-none py-2.5 leading-[1.5]`}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        {previews.map((url, i) => (
          <div key={url} className="relative h-16 w-16 overflow-hidden rounded-sm border border-border">
            <img src={url} alt={`Скриншот ${i + 1}`} className="h-full w-full object-cover" />
            <button
              type="button"
              aria-label="Убрать скриншот"
              onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
              className="hit-44 absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-surface text-text"
            >
              <Close size={12} />
            </button>
          </div>
        ))}
        {files.length < MAX_SCREENSHOTS && (
          <Button type="button" onClick={() => fileRef.current?.click()}>
            <Camera size={16} />
            {files.length ? 'Ещё скриншот' : 'Скриншот'}
          </Button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])].filter((f) => f.type.startsWith('image/'))
            e.target.value = ''
            const tooBig = picked.find((f) => f.size > 10 * 1024 * 1024)
            if (tooBig) showError('Скриншот больше 10 МБ — уменьшите или выберите другой')
            setFiles((f) => [...f, ...picked.filter((x) => x.size <= 10 * 1024 * 1024)].slice(0, MAX_SCREENSHOTS))
          }}
        />
      </div>

      <Button type="submit" variant="primary" size="lg" disabled={!canSend} loading={send.isPending}>
        Отправить
      </Button>
    </form>
  )
}

/** временные ссылки на выбранные файлы для превью; освобождаются при смене списка */
function useObjectUrls(files: File[]): string[] {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return urls
}

function MyFeedback() {
  const { data = [], isLoading } = useMyFeedback()
  const markSeen = useMarkRepliesSeen()

  // открыли страницу — новые ответы прочитаны (отметка в профиле гаснет)
  const unseen = data.filter((f) => f.reply && !f.reply_seen_at).map((f) => f.id)
  const unseenKey = unseen.join(',')
  useEffect(() => {
    if (unseenKey) markSeen.mutate(unseenKey.split(','))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unseenKey])

  if (isLoading) return null
  return (
    <section className="mt-6 flex flex-col gap-2">
      <Overline>Мои обращения</Overline>
      {data.length === 0 ? (
        <EmptyState title="Пока пусто">Отправленные обращения и ответы на них будут здесь.</EmptyState>
      ) : (
        data.map((f) => <FeedbackCard key={f.id} f={f} fresh={unseen.includes(f.id)} />)
      )}
    </section>
  )
}

function FeedbackCard({ f, fresh }: { f: Feedback; fresh: boolean }) {
  const { data: shots = [] } = useScreenshotUrls(f.screenshots)
  return (
    <article className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3.5">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text">{KIND_LABEL[f.kind]}</span>
        <span className="text-xs text-text-tertiary">{dateTime(f.created_at)}</span>
        <span className="ml-auto">
          <Tag tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Tag>
        </span>
      </div>
      {f.rating && <Stars value={f.rating} size={16} />}
      <p className="text-sm leading-[1.5] whitespace-pre-wrap text-text-secondary" style={{ overflowWrap: 'anywhere' }}>
        {f.body}
      </p>
      {shots.length > 0 && (
        <div className="flex gap-2">
          {shots.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="h-14 w-14 overflow-hidden rounded-sm border border-border">
              <img src={url} alt={`Скриншот ${i + 1}`} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}
      {f.reply && (
        <div className="flex flex-col gap-1 rounded-sm bg-surface-sunken px-3 py-2.5">
          <span className="flex items-center gap-2 text-xs font-medium text-text-secondary">
            Ответ{f.replied_at ? ` · ${dateTime(f.replied_at)}` : ''}
            {fresh && <Tag tone="accent">новый</Tag>}
          </span>
          <p className="text-sm leading-[1.5] whitespace-pre-wrap text-text" style={{ overflowWrap: 'anywhere' }}>
            {f.reply}
          </p>
        </div>
      )}
    </article>
  )
}
