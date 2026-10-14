import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Check, Close } from '../components/Icon'

interface ToastAction {
  label: string
  onAction: () => void
}

interface Toast {
  id: number
  message: string
  tone: 'error' | 'success'
  action?: ToastAction
}

interface ToastContextValue {
  showError: (message: string) => void
  showSuccess: (message: string, action?: ToastAction) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: Toast['tone'], action?: ToastAction) => {
      const id = nextId++
      // не больше трёх сразу: новый вытесняет самый старый
      setToasts((prev) => [...prev, { id, message, tone, action }].slice(-3))
      // «готово» — коротко; с «Вернуть» — успеть дотянуться; ошибку — успеть прочитать
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : action ? 5000 : 3000)
    },
    [dismiss],
  )

  const showError = useCallback((message: string) => push(message, 'error'), [push])
  const showSuccess = useCallback(
    (message: string, action?: ToastAction) => push(message, 'success', action),
    [push],
  )

  return (
    <ToastContext.Provider value={{ showError, showSuccess }}>
      {children}
      {/* снизу по центру, над таб-баром: сверху и так живут плашка учёта и «нет сети».
          На широком экране — в правом нижнем углу */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+96px)] z-[var(--z-toast)] flex flex-col items-center gap-2 px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className="toast-pop pointer-events-auto flex max-w-[min(92vw,420px)] items-center gap-2.5 rounded-md border border-border bg-surface py-2 pr-2 pl-3 text-base text-text shadow-popover"
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                t.tone === 'error' ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
              }`}
              aria-hidden
            >
              {t.tone === 'error' ? <span className="text-xs font-semibold">!</span> : <Check size={14} />}
            </span>
            <span className="min-w-0 flex-1 py-0.5 leading-[1.4]">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onAction()
                  dismiss(t.id)
                }}
                className="hit-44 min-h-9 shrink-0 rounded-sm px-2 font-medium text-accent-text hover:bg-surface-sunken"
              >
                {t.action.label}
              </button>
            )}
            {t.tone === 'error' && (
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Закрыть"
                className="hit-44 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-sunken"
              >
                <Close size={16} />
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

/**
 * Ошибка, текст которой уже написан для человека (например, ответ серверной функции:
 * «Telegram не принял сообщение…»). describeError показывает её как есть, а не прячет
 * под общим «Не удалось сохранить».
 */
export class UserError extends Error {}

/** Best-effort readable message for a Supabase/Postgres error surfaced from a mutation. */
export function describeError(error: unknown): string {
  if (error instanceof UserError) return error.message
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  // свои проверки база пишет по-русски («…есть в задачах — его можно отправить в архив»):
  // их показываем как есть, а английские системные — переводим или обобщаем
  if (/[а-яё]/i.test(message)) return message
  if (message.includes('violates foreign key constraint')) {
    return 'Нельзя удалить: используется в других записях.'
  }
  if (/Failed to fetch|NetworkError|Load failed|Network request failed/i.test(message)) {
    return 'Нет связи с сервером — ничего не изменилось. Повторите, когда сеть вернётся.'
  }
  return 'Не удалось сохранить изменение. Попробуйте ещё раз.'
}
