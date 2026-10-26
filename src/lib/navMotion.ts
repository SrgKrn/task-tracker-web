import { useState } from 'react'
import { useNavigationType } from 'react-router-dom'

/**
 * Направление перехода (0.57) — для анимации экранов: вглубь (карточка, раздел профиля)
 * экран въезжает справа, назад — слева, между вкладками — мягко проявляется.
 */
export type NavDir = 'none' | 'forward' | 'back' | 'tab'

/** вкладки нижней панели — один уровень, переход между ними не «вглубь» */
const TAB_ROOTS = new Set(['tasks', 'dashboard', 'focus'])

export function navDepth(path: string): number {
  const parts = path.split('/').filter(Boolean)
  if (parts.length === 0) return 0
  return TAB_ROOTS.has(parts[0]) ? parts.length - 1 : parts.length
}

export function navDirection(prev: string, next: string, pop = false): NavDir {
  if (prev === next) return 'none'
  const a = navDepth(prev)
  const b = navDepth(next)
  if (b > a) return 'forward'
  if (b < a) return 'back'
  // соседние карточки одного уровня (спринт → подзадача, «назад» системной кнопкой)
  if (pop) return 'back'
  return a === 0 ? 'tab' : 'forward'
}

/** Направление последнего перехода к pathname; считается при смене адреса, без эффектов. */
export function useNavDirection(pathname: string): NavDir {
  const navType = useNavigationType()
  const [state, setState] = useState<{ path: string; dir: NavDir }>({ path: pathname, dir: 'none' })
  if (state.path !== pathname) {
    const dir = navDirection(state.path, pathname, navType === 'POP')
    setState({ path: pathname, dir })
    return dir
  }
  return state.dir
}
