import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedLayout } from './components/ProtectedLayout'
import { useAuth } from './lib/AuthContext'
import { Login } from './routes/Login'
import { NewTask } from './routes/NewTask'
import { ProjectsAdmin } from './routes/ProjectsAdmin'
import { SectionsAdmin } from './routes/SectionsAdmin'
import { StatusesAdmin } from './routes/StatusesAdmin'
import { TaskDetail } from './routes/TaskDetail'
import { TaskList } from './routes/TaskList'

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
        <Route path="/" element={<TaskList />} />
        <Route path="/tasks/new" element={<NewTask />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/sections" element={<SectionsAdmin />} />
        <Route path="/projects" element={<ProjectsAdmin />} />
        <Route path="/statuses" element={<StatusesAdmin />} />
      </Route>
    </Routes>
  )
}
