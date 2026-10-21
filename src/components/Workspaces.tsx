import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Plus } from './Icon'
import { ClientDot, ListGroup, Sheet } from './ui'
import { switchWorkspace, useActiveWorkspace, useWorkspaces } from '../lib/workspace'
import { tap } from '../lib/haptics'
import { RoomNote, useRoom } from './Upgrade'

/** Список пространств с отметкой текущего — для шторки и профиля. */
export function WorkspaceList({ onPicked }: { onPicked?: () => void }) {
  const { data: list = [] } = useWorkspaces()
  const activeId = useActiveWorkspace()?.id
  const qc = useQueryClient()
  return (
    <ListGroup>
      {list.map((w) => (
        <button
          key={w.id}
          type="button"
          onClick={() => {
            tap()
            switchWorkspace(w.id, qc)
            onPicked?.()
          }}
          aria-current={w.id === activeId}
          className="flex min-h-12 items-center gap-3 px-3.5 py-2.5 text-left active:bg-surface-sunken lg:hover:bg-surface-hover"
        >
          <ClientDot color={w.color} size={10} />
          <span className="min-w-0 flex-1 truncate text-base text-text">{w.name}</span>
          {w.is_default && <span className="text-xs text-text-tertiary">основное</span>}
          {w.id === activeId && <Check size={16} className="text-accent" />}
        </button>
      ))}
    </ListGroup>
  )
}

/** Шторка выбора пространства — с меток пространства на главных экранах. */
export function WorkspaceSwitcherSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { data: list = [] } = useWorkspaces()
  const room = useRoom('workspaces', list.filter((w) => !w.archived_at).length)
  return (
    <Sheet open={open} onClose={onClose} title="Пространство">
      <WorkspaceList onPicked={onClose} />
      <RoomNote room={room} what="Ещё одно пространство" max="Это максимум пространств." />
      <div className="flex gap-2">
        {room.allowed && (
        <button
          type="button"
          onClick={() => {
            onClose()
            navigate('/workspaces/new')
          }}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm border border-border text-base font-medium text-text"
        >
          <Plus size={15} />
          Новое
        </button>
        )}
        <Link
          to="/settings/workspaces"
          onClick={onClose}
          className="flex min-h-11 flex-1 items-center justify-center rounded-sm border border-border text-base font-medium text-text"
        >
          Настроить
        </Link>
      </div>
    </Sheet>
  )
}

/**
 * Метка пространства в подписи над заголовком главного экрана: цветная точка и название.
 * Пространство одно — метки нет. Нажатие — выбор пространства.
 */
export function WorkspaceTag({ className = '' }: { className?: string }) {
  const { data: list = [] } = useWorkspaces()
  const ws = useActiveWorkspace()
  const [open, setOpen] = useState(false)
  if (list.length < 2 || !ws) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`hit-44 inline-flex h-6 max-w-[60%] items-center gap-1.5 rounded-full bg-surface-sunken pr-2 pl-2 text-xs font-medium text-text-secondary ${className}`}
        aria-label={`Пространство «${ws.name}», сменить`}
      >
        <ClientDot color={ws.color} size={7} />
        <span className="truncate">{ws.name}</span>
        <ChevronRight size={11} className="rotate-90" />
      </button>
      <WorkspaceSwitcherSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Пространство в боковой панели компьютера: текущее и выбор другого. */
export function SidebarWorkspace({ collapsed }: { collapsed: boolean }) {
  const ws = useActiveWorkspace()
  const [open, setOpen] = useState(false)
  if (!ws) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={collapsed ? `Пространство: ${ws.name}` : undefined}
        className={`flex h-9 items-center gap-2.5 rounded-sm border border-border text-sm font-medium text-text hover:bg-surface-sunken ${
          collapsed ? 'justify-center px-0' : 'px-2.5'
        }`}
      >
        <ClientDot color={ws.color} size={9} />
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left">{ws.name}</span>
            <ChevronRight size={13} className="rotate-90 text-text-secondary" />
          </>
        )}
      </button>
      <WorkspaceSwitcherSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}
