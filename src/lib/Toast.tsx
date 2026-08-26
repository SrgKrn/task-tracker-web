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
      <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 safe-bottom">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`w-full max-w-sm rounded-lg border px-4 py-3 text-sm shadow-lg ${
              t.tone === 'error'
                ? 'border-red-500/40 bg-red-500/15 text-red-400'
                : 'border-emerald-600/40 bg-emerald-600/15 text-emerald-400'
            }`}
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
