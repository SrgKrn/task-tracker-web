import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation, useMatch, useNavigate } from 'react-router-dom'
import { ArrowRight, Keyboard, Play, Plus, Search } from './Icon'
import { Kbd, MOD_KEY, Sheet } from './ui'
import { isTypingTarget, onOpenCommandPalette, openCommandPalette } from '../lib/commands'
import { useGroupModel } from '../lib/groups'
import { useTasks } from '../lib/queries/tasks'
import { useActiveTimer, useStartTimer, useStopTimer } from '../lib/queries/timer'
import { setTheme, useTheme } from '../lib/theme'
import { describeError, useToast } from '../lib/Toast'

interface Command {
  id: string
  group: 'Действия' | 'Переходы' | 'Задачи'
  title: string
  hint?: string
  icon: ReactNode
  /** по чему ещё искать, кроме названия */
  keywords?: string
  run: () => void
}

const PAGES: { to: string; title: string; keywords?: string }[] = [
  { to: '/', title: 'Сегодня', keywords: 'today день' },
  { to: '/tasks', title: 'Задачи', keywords: 'tasks список' },
  { to: '/dashboard', title: 'Сводка', keywords: 'dashboard отчёт статистика' },
  { to: '/groups', title: 'Группы', keywords: 'проекты разделы клиенты' },
  { to: '/statuses', title: 'Этапы', keywords: 'статусы' },
  { to: '/settings/plan', title: 'План часов', keywords: 'норма' },
  { to: '/settings/tariff', title: 'Тариф', keywords: 'подписка оплата про студия цена' },
  { to: '/settings/export', title: 'Экспорт отчёта', keywords: 'pdf excel' },
  { to: '/settings/appearance', title: 'Оформление', keywords: 'тема' },
  { to: '/focus', title: 'Фокус', keywords: 'помидор pomodoro 90/30 таймер' },
  { to: '/settings/method', title: 'Методика', keywords: 'приоритет эйзенхауэр лягушка abcde 1-3-5' },
  { to: '/settings/profile', title: 'Личные данные', keywords: 'имя фото почта пароль' },
  { to: '/settings', title: 'Профиль', keywords: 'настройки аккаунт ещё' },
]

/** «спр 6» находит «Спринт 6 624»: каждое слово запроса — начало какого-то слова или подстрока */
function matches(text: string, query: string): boolean {
  const hay = text.toLowerCase().replace(/ё/g, 'е')
  return query
    .toLowerCase()
    .replace(/ё/g, 'е')
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w))
}

/**
 * Командная палитра (дизайн-система 9.9): ⌘K / Ctrl+K или «/». Задачи, переходы и действия
 * в одном поиске — до любой задачи две клавиши и пара букв, без мыши.
 */
function CommandPalette({ onClose, onCreate, onHelp }: { onClose: () => void; onCreate: () => void; onHelp: () => void }) {
  const navigate = useNavigate()
  const { data: tasks = [] } = useTasks()
  const model = useGroupModel()
  const { data: activeTimer } = useActiveTimer()
  const stopTimer = useStopTimer()
  const theme = useTheme()
  const { showError } = useToast()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // поле в фокусе сразу — палитру открывают, чтобы печатать
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus())
  }, [])

  const commands = useMemo<Command[]>(() => {
    const onError = (e: unknown) => showError(describeError(e))
    const taskById = new Map(tasks.map((t) => [t.id, t]))
    const actions: Command[] = [
      { id: 'new', group: 'Действия', title: 'Новая задача', hint: 'C', icon: <Plus size={16} />, run: onCreate },
      ...(activeTimer
        ? [
            {
              id: 'stop',
              group: 'Действия' as const,
              title: `Остановить учёт: ${taskById.get(activeTimer.task_id)?.name ?? 'задача'}`,
              keywords: 'таймер стоп',
              icon: <Play size={16} />,
              run: () => stopTimer.mutate(undefined, { onError }),
            },
          ]
        : []),
      {
        id: 'theme',
        group: 'Действия',
        title: theme === 'dark' ? 'Светлая тема' : 'Тёмная тема',
        keywords: 'тема оформление',
        icon: <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-current" />,
        run: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
      { id: 'help', group: 'Действия', title: 'Горячие клавиши', hint: '?', icon: <Keyboard size={16} />, run: onHelp },
    ]
    const pages: Command[] = PAGES.map((p) => ({
      id: `page:${p.to}`,
      group: 'Переходы',
      title: p.title,
      keywords: p.keywords,
      icon: <ArrowRight size={16} />,
      run: () => navigate(p.to),
    }))
    const taskCommands: Command[] = tasks.map((t) => {
      const parent = t.parent_id ? taskById.get(t.parent_id) : undefined
      const label = model.listLabel(parent ?? t)
      return {
        id: `task:${t.id}`,
        group: 'Задачи',
        title: t.name,
        hint: [parent?.name, label].filter(Boolean).join(' · ') || undefined,
        keywords: [parent?.name, label].filter(Boolean).join(' '),
        icon: <Search size={16} />,
        run: () => navigate(`/tasks/${t.id}`),
      }
    })
    return [...actions, ...pages, ...taskCommands]
  }, [tasks, model, activeTimer, theme, navigate, onCreate, onHelp, stopTimer, showError])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return commands.filter((c) => c.group !== 'Задачи').concat(commands.filter((c) => c.group === 'Задачи').slice(0, 6))
    const found = commands.filter((c) => matches(`${c.title} ${c.keywords ?? ''}`, q))
    // задачи — первыми: чаще всего палитру открывают, чтобы найти задачу
    return [...found.filter((c) => c.group === 'Задачи').slice(0, 12), ...found.filter((c) => c.group !== 'Задачи')]
  }, [commands, query])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  function run(cmd: Command | undefined) {
    if (!cmd) return
    onClose()
    cmd.run()
  }

  let lastGroup = ''
  return (
    <div className="overlay-in fixed inset-0 z-[var(--z-modal)] flex justify-center bg-overlay px-4 pt-[15vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Поиск и команды"
        className="sheet-in flex max-h-[60vh] w-full max-w-160 flex-col self-start overflow-hidden rounded-lg border border-border bg-surface shadow-modal"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((i) => Math.min(results.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((i) => Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            run(results[active])
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      >
        <div className="flex h-12 items-center gap-2.5 border-b border-divider px-4">
          <Search size={18} className="text-text-secondary" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Задача, раздел или действие"
            className="h-full min-w-0 flex-1 bg-transparent text-md text-text outline-none placeholder:text-text-tertiary"
            // фокус и так виден по курсору; общая рамка фокуса рисовала коробку внутри палитры
            style={{ outline: 'none' }}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `palette-${results[active].id}` : undefined}
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" className="sc overflow-y-auto p-1.5">
          {results.length === 0 && <p className="px-3 py-6 text-center text-sm text-text-secondary">Ничего не нашлось</p>}
          {results.map((cmd, i) => {
            const header = cmd.group !== lastGroup ? cmd.group : null
            lastGroup = cmd.group
            return (
              <div key={cmd.id}>
                {header && <div className="px-2.5 pt-2 pb-1 text-xs font-medium text-text-tertiary">{header}</div>}
                <button
                  type="button"
                  id={`palette-${cmd.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(cmd)}
                  className={`flex h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm ${
                    i === active ? 'bg-surface-selected text-text' : 'text-text'
                  }`}
                >
                  <span className={i === active ? 'text-accent' : 'text-text-secondary'}>{cmd.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{cmd.title}</span>
                  {cmd.hint &&
                    (cmd.group === 'Задачи' ? (
                      <span className="max-w-[45%] truncate text-xs text-text-secondary">{cmd.hint}</span>
                    ) : (
                      <Kbd>{cmd.hint}</Kbd>
                    ))}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const SHORTCUTS: [string[], string][] = [
  [[MOD_KEY, 'K'], 'Поиск и команды'],
  [['/'], 'Поиск'],
  [['C'], 'Новая задача'],
  [['J', 'K'], 'Следующая и предыдущая задача в списке'],
  [['S'], 'Начать или остановить учёт открытой задачи'],
  [['1', '2', '3', '4'], 'Сегодня, Задачи, Сводка, Фокус'],
  [['Esc'], 'Закрыть окно или карточку'],
  [['?'], 'Эта подсказка'],
]

function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Горячие клавиши">
      <div className="flex flex-col">
        {SHORTCUTS.map(([keys, what]) => (
          <div key={what} className="flex items-center justify-between gap-4 border-b border-divider py-2.5 last:border-0">
            <span className="text-base text-text">{what}</span>
            <span className="flex shrink-0 gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </Sheet>
  )
}

/** соседняя задача в списке слева — по порядку на экране, с учётом фильтров и сортировки */
function neighbourTask(currentId: string | undefined, step: 1 | -1): string | null {
  const ids: string[] = []
  document.querySelectorAll<HTMLAnchorElement>('.task-list-pane a[href^="/tasks/"]').forEach((a) => {
    const id = a.getAttribute('href')!.slice('/tasks/'.length)
    if (id && id !== 'new' && !ids.includes(id)) ids.push(id)
  })
  if (!ids.length) return null
  const i = currentId ? ids.indexOf(currentId) : -1
  if (i === -1) return ids[step === 1 ? 0 : ids.length - 1]
  return ids[Math.min(ids.length - 1, Math.max(0, i + step))]
}

/**
 * Палитра и горячие клавиши (дизайн-система 12). Одиночные клавиши работают, только когда
 * фокус не в поле ввода и не открыто окно: в окне буква — это текст, а не команда.
 */
export function AppCommands({ onCreate }: { onCreate: () => void }) {
  const navigate = useNavigate()
  const location = useLocation()
  const taskId = useMatch('/tasks/:id')?.params.id
  const { data: activeTimer } = useActiveTimer()
  const startTimer = useStartTimer()
  const stopTimer = useStopTimer()
  const { showError } = useToast()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => onOpenCommandPalette(() => setPaletteOpen(true)), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyK') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return
      if (isTypingTarget(e.target) || document.querySelector('[aria-modal="true"]')) return

      // по коду клавиши: на русской раскладке «c» — это «с», но клавиша та же
      const key = e.code.startsWith('Key') ? e.code.slice(3).toLowerCase() : e.key
      const digit = e.code.startsWith('Digit') ? e.code.slice(5) : e.key
      const section = ({ 1: '/', 2: '/tasks', 3: '/dashboard', 4: '/focus' } as Record<string, string>)[digit]

      if (section) {
        e.preventDefault()
        navigate(section)
      } else if ((e.key === '/' || e.code === 'Slash') && !e.shiftKey) {
        e.preventDefault()
        openCommandPalette()
      } else if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) {
        e.preventDefault()
        setHelpOpen(true)
      } else if (key === 'c') {
        e.preventDefault()
        onCreate()
      } else if ((key === 'j' || key === 'k') && location.pathname.startsWith('/tasks')) {
        const next = neighbourTask(taskId, key === 'j' ? 1 : -1)
        if (next) {
          e.preventDefault()
          navigate(`/tasks/${next}`)
          // строка могла уехать за край списка — показываем её
          requestAnimationFrame(() =>
            document.querySelector(`.task-list-pane a[href="/tasks/${next}"]`)?.scrollIntoView({ block: 'nearest' }),
          )
        }
      } else if (key === 's' && taskId) {
        e.preventDefault()
        const onError = (err: unknown) => showError(describeError(err))
        if (activeTimer?.task_id === taskId) stopTimer.mutate(undefined, { onError })
        else startTimer.mutate(taskId, { onError })
      } else if (e.key === 'Escape' && taskId) {
        navigate('/tasks')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navigate, location.pathname, taskId, activeTimer, startTimer, stopTimer, showError, onCreate])

  return (
    <>
      {/* монтируется заново при каждом открытии — поиск начинается с пустого поля */}
      {paletteOpen && (
        <CommandPalette onClose={() => setPaletteOpen(false)} onCreate={onCreate} onHelp={() => setHelpOpen(true)} />
      )}
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  )
}
