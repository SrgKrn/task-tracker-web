import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { ActiveTimerBar } from './ActiveTimerBar'
import { BottomTabBar } from './BottomTabBar'
import { StaleTimerBanner } from './StaleTimerBanner'

export function ProtectedLayout() {
  const { session, loading } = useAuth()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="min-h-full">
      <StaleTimerBanner />
      <ActiveTimerBar />
      <div className="pb-20">
        <Outlet />
      </div>
      <BottomTabBar />
    </div>
  )
}
