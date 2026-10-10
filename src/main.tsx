import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'
import { startUpdateWatcher } from './lib/appUpdate'
import { AuthProvider } from './lib/AuthContext'
import { ToastProvider } from './lib/Toast'

const queryClient = new QueryClient()
startUpdateWatcher()

// Safari на iPhone приближает страницу щипком, даже когда масштаб запрещён в viewport.
// Приложению это не нужно: всё и так подогнано под экран, а вернуть масштаб назад неудобно
document.addEventListener('gesturestart', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
