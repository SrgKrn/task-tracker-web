import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { ActiveTimerBar } from './ActiveTimerBar'
import { AppHeader } from './AppHeader'
import { StaleTimerBanner } from './StaleTimerBanner'

export function ProtectedLayout() {
  const { session, loading } = useAuth()

  if (loading) return null
  if (!session) return <Navigate to="/login" replace />

  return (
    <div className="min-h-full">
      <AppHeader />
      <StaleTimerBanner />
      <ActiveTimerBar />
      <Outlet />
    </div>
  )
}
