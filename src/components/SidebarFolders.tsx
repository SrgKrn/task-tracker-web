import { useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Settings2 } from './Icon'
import { ClientDot, MOD_KEY } from './ui'
import { useDragSort } from './useDragSort'
import { useTaskFolders } from './useTaskFolders'
import { FoldersSheet } from './FoldersSheet'
import { useActiveFolder } from '../lib/taskView'
import { foldersEnabled } from '../lib/taskFolders'

/**
 * Папки «Задач» разделом боковой панели (0.64), как папки чатов в Telegram Desktop:
 * счётчик открытых задач, выбранная подсвечена, порядок тянется (удержать и вести).
 * Выбор папки открывает «Задачи», если были на другом экране; открытая карточка остаётся.
 */
export function SidebarFolders() {
  const { settings, folders, heads, isDone, ready, setOrder } = useTaskFolders()
  const [active, setActive] = useActiveFolder()
  const location = useLocation()
  const navigate = useNavigate()
  const onTasks = location.pathname.startsWith('/tasks')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  useDragSort(listRef, {
    enabled: folders.length > 1,
    onDrop: (from, to) => {
      const keys = folders.map((f) => f.key)
      const [moved] = keys.splice(from, 1)
      keys.splice(to, 0, moved)
      setOrder(keys)
    },
  })

  const open = heads.filter((t) => !isDone(t))
  const current = onTasks && (active === 'all' || folders.some((f) => f.key === active)) ? active : null
  const choose = (key: string) => {
    setActive(key)
    if (!onTasks) navigate('/tasks')
  }
  const row = (selected: boolean) =>
    `flex h-8 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm transition-colors ${
      selected ? 'bg-surface-selected font-medium text-accent-text' : 'text-text-secondary hover:bg-surface-sunken hover:text-text'
    }`
  const count = (n: number) =>
    ready && <span className="tabular ml-auto shrink-0 font-mono text-xs opacity-70">{n}</span>

  return (
    <div className="flex flex-col gap-0.5 pt-4" aria-label="Папки задач" role="group">
      <div className="flex h-7 items-center pr-1 pl-2.5">
        <span className="flex-1 text-xs font-medium text-text-tertiary">Папки</span>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настроить папки"
          title="Настроить папки"
          className="flex h-6 w-6 items-center justify-center rounded-sm text-text-tertiary hover:bg-surface-sunken hover:text-text"
        >
          <Settings2 size={14} />
        </button>
      </div>

      {!foldersEnabled(settings) ? (
        <p className="px-2.5 text-xs text-text-tertiary">Папки выключены</p>
      ) : (
        <>
          <button type="button" onClick={() => choose('all')} className={row(current === 'all')} title={`Все задачи · ${MOD_KEY}+1`}>
            <span className="h-2 w-2 shrink-0 rounded-full border border-current opacity-60" aria-hidden />
            <span className="min-w-0 truncate">Все</span>
            {count(open.length)}
          </button>
          <div ref={listRef} className="flex flex-col gap-0.5">
            {folders.map((f, i) => (
              <div key={f.key} data-sort-row className="rounded-sm">
                <button
                  type="button"
                  onClick={() => choose(f.key)}
                  className={row(current === f.key)}
                  title={i < 8 ? `${f.name} · ${MOD_KEY}+${i + 2}` : f.name}
                >
                  {f.color ? (
                    <ClientDot color={f.color} size={8} />
                  ) : (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-border-strong" aria-hidden />
                  )}
                  <span className="min-w-0 truncate">{f.name}</span>
                  {count(open.filter(f.match).length)}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <FoldersSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onPick={(key) => choose(key)}
      />
    </div>
  )
}
