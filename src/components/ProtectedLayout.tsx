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
        <StaleTimerBanner />
        <div className="pb-[104px] lg:pb-0">
          <Outlet />
        </div>
      </div>

      {/* док таймера прижат ко дну над таб-баром — на десктопе таб-бара нет, поэтому просто внизу */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[92px] z-30 flex justify-center lg:bottom-4 lg:left-60">
        <div className="pointer-events-auto w-full max-w-lg">
          <ActiveTimerBar />
        </div>
      </div>

      <BottomTabBar onCreate={() => setSheetOpen(true)} />
      <NewTaskSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  )
}
