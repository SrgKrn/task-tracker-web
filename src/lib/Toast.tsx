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
      // «готово» — коротко, чтобы не задерживать взгляд; с кнопкой отмены — успеть до
      // неё дотянуться; ошибку — успеть прочитать: за 2 с её не замечали вовсе
      setTimeout(() => dismiss(id), tone === 'error' ? 7000 : action ? 5000 : 2200)
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
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={`toast-pop flex max-w-[92vw] items-center gap-2.5 backdrop-blur-sm ${
              t.tone === 'error'
                ? 'pointer-events-auto rounded-2xl py-2.5 pr-1.5 pl-3.5 text-sm font-medium leading-snug shadow-lg'
                : `rounded-full px-3.5 py-2 text-xs leading-tight ${t.action ? 'pointer-events-auto' : ''}`
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
            {t.tone === 'error' && (
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Закрыть"
                className="-my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base leading-none opacity-70"
              >
                ×
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
