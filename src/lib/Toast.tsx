import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

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
      setToasts((prev) => [...prev, { id, message, tone, action }])
      // короче предыдущих 4с: тост наверху не должен задерживать взгляд на экране,
      // но с кнопкой отмены нужно успеть до неё дотянуться
      setTimeout(() => dismiss(id), action ? 5000 : 2200)
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
      <div className="safe-top pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-1.5 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-pop flex max-w-[88vw] items-center gap-2.5 rounded-full px-3.5 py-2 text-xs leading-tight backdrop-blur-sm ${
              t.action ? 'pointer-events-auto' : ''
            }`}
            style={
              t.tone === 'error'
                ? {
                    background: 'var(--s-toast-err-bg)',
                    border: '1px solid var(--s-danger-line)',
                    color: 'var(--s-danger-text)',
                  }
                : {
                    background: 'var(--s-toast-ok-bg)',
                    border: '1px solid var(--s-success-line)',
                    color: 'var(--s-success-text)',
                  }
            }
          >
            {t.message}
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.onAction()
                  dismiss(t.id)
                }}
                className="shrink-0 font-semibold underline underline-offset-2"
              >
                {t.action.label}
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
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Нет связи с сервером — ничего не изменилось. Повторите, когда сеть вернётся.'
  }
  return 'Не удалось сохранить изменение. Попробуйте ещё раз.'
}
