import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedLayout } from './components/ProtectedLayout'
import { useAuth } from './lib/AuthContext'
import { Dashboard } from './routes/Dashboard'
import { Login } from './routes/Login'
import { NewTask } from './routes/NewTask'
import { ProjectDetail } from './routes/ProjectDetail'
import { ProjectsAdmin } from './routes/ProjectsAdmin'
import { SectionDetail } from './routes/SectionDetail'
import { SectionsAdmin } from './routes/SectionsAdmin'
import { Settings } from './routes/Settings'
import { StatusesAdmin } from './routes/StatusesAdmin'
import { TaskDetail } from './routes/TaskDetail'
import { TaskWorkspace } from './routes/TaskWorkspace'

function LoginRoute() {
  const { session } = useAuth()
  if (session) return <Navigate to="/" replace />
  return <Login />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<TaskWorkspace />}>
          <Route path="tasks/new" element={<NewTask />} />
          <Route path="tasks/:id" element={<TaskDetail />} />
        </Route>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/sections" element={<SectionsAdmin />} />
        <Route path="/sections/:id" element={<SectionDetail />} />
        <Route path="/projects" element={<ProjectsAdmin />} />
        <Route path="/projects/:id" element={<ProjectDetail />} />
        <Route path="/statuses" element={<StatusesAdmin />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
