import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { ProtectedLayout } from './components/ProtectedLayout'
import { useAuth } from './lib/AuthContext'
import { Dashboard } from './routes/Dashboard'
import { Login } from './routes/Login'
import { Changelog } from './routes/Changelog'
import { GroupPage, GroupsAdmin } from './routes/GroupsAdmin'
import { ItemDetail } from './routes/ItemDetail'
import { NewTask } from './routes/NewTask'
import { OAuthGoogle } from './routes/OAuthGoogle'
import {
  AppearanceSettings,
  CalendarSettings,
  DriveSettings,
  ExportSettings,
  NotificationSettings,
  PlanSettings,
  Settings,
  TelegramSettings,
} from './routes/Settings'
import { StatusesAdmin } from './routes/StatusesAdmin'
import { TaskDetail } from './routes/TaskDetail'
import { TaskWorkspace } from './routes/TaskWorkspace'
import { Today } from './routes/Today'

/** старые ссылки на проект и раздел: значения переехали в группы с теми же id */
function LegacyItemRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/items/${id}`} replace />
}

function LoginRoute() {
  const { session } = useAuth()
  if (session) return <Navigate to="/" replace />
  return <Login />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      {/* возврат из Google: может открыться вне приложения, без входа — свой маршрут */}
      <Route path="/oauth/google" element={<OAuthGoogle />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Today />} />
        <Route path="/tasks" element={<TaskWorkspace />}>
          <Route path="new" element={<NewTask />} />
          <Route path=":id" element={<TaskDetail />} />
        </Route>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/groups" element={<GroupsAdmin />} />
        <Route path="/groups/:id" element={<GroupPage />} />
        <Route path="/items/:id" element={<ItemDetail />} />
        <Route path="/sections" element={<Navigate to="/groups" replace />} />
        <Route path="/projects" element={<Navigate to="/groups" replace />} />
        <Route path="/sections/:id" element={<LegacyItemRedirect />} />
        <Route path="/projects/:id" element={<LegacyItemRedirect />} />
        <Route path="/statuses" element={<StatusesAdmin />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/settings/appearance" element={<AppearanceSettings />} />
        <Route path="/settings/notifications" element={<NotificationSettings />} />
        <Route path="/settings/telegram" element={<TelegramSettings />} />
        <Route path="/settings/calendar" element={<CalendarSettings />} />
        <Route path="/settings/drive" element={<DriveSettings />} />
        <Route path="/settings/plan" element={<PlanSettings />} />
        <Route path="/settings/export" element={<ExportSettings />} />
        <Route path="/changelog" element={<Changelog />} />
      </Route>
    </Routes>
  )
}
