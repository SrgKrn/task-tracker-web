import { LATEST_RELEASE } from './changelog'
import { useUnreadReplies } from './queries/feedback'
import { useUserSettings } from './queries/userSettings'

/**
 * Точка на аватаре (0.65.2): в профиле есть новое — ответ на обращение или новая версия,
 * которую ещё не открывали. Гаснет, когда новое посмотрели.
 */
export function useProfileAttention(): string | null {
  const replies = useUnreadReplies()
  const { data: settings, isFetched } = useUserSettings()
  if (replies > 0) return replies === 1 ? 'Новый ответ на обращение' : 'Новые ответы на обращения'
  if (isFetched && settings && settings.seen_release !== LATEST_RELEASE.version) return `Вышла версия ${LATEST_RELEASE.version}`
  return null
}
