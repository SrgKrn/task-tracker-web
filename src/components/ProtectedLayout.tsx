import { useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { ActiveTimerBar } from './ActiveTimerBar'
import { BottomTabBar } from './BottomTabBar'
import { DesktopSidebar } from './DesktopSidebar'
import { NewTaskSheet } from './NewTaskSheet'
import { StaleTimerBanner } from './StaleTimerBanner'

export function ProtectedLayout() {
  const { session, loading } = useAuth()
  const [sheetOpen, setSheetOpen] = useState(false)

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="min-h-full lg:flex">
      <DesktopSidebar onCreate={() => setSheetOpen(true)} />

      <div className="min-w-0 flex-1">
        {/* статус трекинга — наверху и всегда на виду при прокрутке, а не внизу у таб-бара */}
        <div className="sticky top-0 z-40">
          <StaleTimerBanner />
          <ActiveTimerBar />
        </div>
        <div className="pb-24 lg:pb-0">
          <Outlet />
        </div>
      </div>

      <BottomTabBar onCreate={() => setSheetOpen(true)} />
      <NewTaskSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  )
}
