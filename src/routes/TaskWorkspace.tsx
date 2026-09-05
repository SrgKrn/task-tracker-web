import { Outlet, useLocation } from 'react-router-dom'
import { TaskList } from './TaskList'

function TaskWorkspaceEmpty() {
  return (
    <div className="hidden text-center text-sm text-slate-600 lg:block">
      <p>Выберите задачу слева</p>
    </div>
  )
}

export function TaskWorkspace() {
  const location = useLocation()
  const hasDetail = location.pathname !== '/tasks'

  return (
    <div className="lg:flex lg:items-start">
      <div
        className={`${hasDetail ? 'hidden lg:block' : 'block'} sc lg:sc-fade lg:sticky lg:top-0 lg:max-h-screen lg:w-[380px] lg:shrink-0 lg:overflow-y-auto`}
      >
        <TaskList />
      </div>
      <div
        className={`${hasDetail ? 'block' : 'hidden lg:flex'} min-w-0 flex-1 lg:min-h-screen lg:items-center lg:justify-center`}
        style={{ borderLeft: '1px solid var(--s-hairline)' }}
      >
        {hasDetail ? <Outlet /> : <TaskWorkspaceEmpty />}
      </div>
    </div>
  )
}
