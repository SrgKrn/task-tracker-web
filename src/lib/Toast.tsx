import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

interface Toast {
  id: number
  message: string
  tone: 'error' | 'success'
}

interface ToastContextValue {
  showError: (message: string) => void
  showSuccess: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, tone: Toast['tone']) => {
    const id = nextId++
    setToasts((prev) => [...prev, { id, message, tone }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const showError = useCallback((message: string) => push(message, 'error'), [push])
  const showSuccess = useCallback((message: string) => push(message, 'success'), [push])

  return (
    <ToastContext.Provider value={{ showError, showSuccess }}>
      {children}
      <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-[104px] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="w-full max-w-sm rounded-2xl px-4 py-3 text-[13px]"
            style={
              t.tone === 'error'
                ? {
                    background: 'rgba(217,114,86,.12)',
                    border: '1px solid rgba(217,114,86,.45)',
                    color: 'var(--s-danger)',
                  }
                : {
                    background: 'rgba(127,184,148,.14)',
                    border: '1px solid rgba(127,184,148,.4)',
                    color: 'var(--s-success)',
                  }
            }
          >
            {t.message}
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

/** Best-effort readable message for a Supabase/Postgres error surfaced from a mutation. */
export function describeError(error: unknown): string {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error)
  if (message.includes('violates foreign key constraint')) {
    return 'Нельзя удалить: используется в других записях.'
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return 'Нет соединения с сервером. Изменение не сохранено.'
  }
  return 'Не удалось сохранить изменение. Попробуйте ещё раз.'
}
