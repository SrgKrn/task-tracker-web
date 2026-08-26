import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { ActiveTimerBar } from './ActiveTimerBar'
import { BottomTabBar } from './BottomTabBar'
import { DesktopSidebar } from './DesktopSidebar'
import { StaleTimerBanner } from './StaleTimerBanner'

export function ProtectedLayout() {
  const { session, loading } = useAuth()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="min-h-full lg:flex">
      <DesktopSidebar />
      <div className="min-w-0 flex-1">
        <StaleTimerBanner />
        <ActiveTimerBar />
        <div className="pb-20 lg:pb-0">
          <Outlet />
        </div>
      </div>
      <BottomTabBar />
    </div>
  )
}
