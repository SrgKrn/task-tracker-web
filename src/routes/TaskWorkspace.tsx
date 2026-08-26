import { Outlet, useLocation } from 'react-router-dom'
import { TaskList } from './TaskList'

function TaskWorkspaceEmpty() {
  return (
    <div className="hidden text-center text-slate-500 lg:block">
      <p>Выберите задачу слева</p>
    </div>
  )
}

export function TaskWorkspace() {
  const location = useLocation()
  const hasDetail = location.pathname !== '/'

  return (
    <div className="lg:flex lg:items-start">
      <div
        className={`${hasDetail ? 'hidden lg:block' : 'block'} lg:sticky lg:top-0 lg:max-h-screen lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-slate-800`}
      >
        <TaskList />
      </div>
      <div
        className={`${hasDetail ? 'block' : 'hidden lg:flex'} min-w-0 flex-1 lg:min-h-screen lg:items-center lg:justify-center`}
      >
        {hasDetail ? <Outlet /> : <TaskWorkspaceEmpty />}
      </div>
    </div>
  )
}
