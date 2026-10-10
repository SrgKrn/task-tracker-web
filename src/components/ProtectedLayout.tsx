import { Suspense, useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useLiveTimerNotification } from '../lib/push'
import { useTask } from '../lib/queries/tasks'
import { useActiveTimer } from '../lib/queries/timer'
import { useTheme } from '../lib/theme'
import { ActiveTimerBar } from './ActiveTimerBar'
import { BottomTabBar } from './BottomTabBar'
import { DesktopSidebar } from './DesktopSidebar'
import { NetworkBanner } from './NetworkBanner'
import { NewTaskSheet } from './NewTaskSheet'
import { ReleaseBanner } from './ReleaseBanner'
import { StaleTimerBanner } from './StaleTimerBanner'

/** Фоновые связки приложения: плашка учёта в уведомлениях и переходы по нажатию на них. */
function useAppEffects() {
  const navigate = useNavigate()
  const { data: activeTimer } = useActiveTimer()
  const { data: task } = useTask(activeTimer?.task_id)
  useLiveTimerNotification(activeTimer, task?.name.trim())

  // нажали на уведомление при открытом приложении — воркер просит перейти к задаче
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'semternity:navigate' && typeof e.data.url === 'string') navigate(e.data.url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
}

function SignedIn() {
  const [sheetOpen, setSheetOpen] = useState(false)
  useAppEffects()
  // в карточке задачи у плашки учёта своя шапка с кнопками — при прокрутке плашка
  // наезжала на неё; там плашка уезжает вместе со страницей
  const onTaskCard = /^\/(tasks|items)\/[^/]+/.test(useLocation().pathname)

  return (
    <div className="min-h-full lg:flex">
      <DesktopSidebar onCreate={() => setSheetOpen(true)} />

      <div className="min-w-0 flex-1">
        {/* статус трекинга — наверху и всегда на виду при прокрутке, а не внизу у таб-бара */}
        <div className="sticky top-0 z-40">
          <NetworkBanner />
          <StaleTimerBanner />
          {!onTaskCard && <ActiveTimerBar />}
        </div>
        {onTaskCard && <ActiveTimerBar />}
        <div className="pb-24 lg:pb-0">
          {/* редкие экраны грузятся по первому заходу — шапка и панель при этом на месте */}
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </div>
      </div>

      <BottomTabBar onCreate={() => setSheetOpen(true)} />
      <ReleaseBanner />
      <NewTaskSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  )
}

export function ProtectedLayout() {
  const { session, loading } = useAuth()
  // тема «как в системе» следит за переключением системы, пока открыто приложение
  useTheme()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />
  return <SignedIn />
}
