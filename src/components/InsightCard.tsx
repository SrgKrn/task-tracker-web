import { useDayInsight } from '../lib/insight'
import { useUserSettings } from '../lib/queries/userSettings'
import { Overline } from './ui'

/**
 * Блок «Время» на «Сегодня»: факт дня и цитата под него. Тот же блок придёт вечером в
 * «Итогах дня» в Telegram. Нечего сказать, выключен или сервер не ответил — блока нет:
 * остальной экран от него не зависит.
 */
export function InsightCard({ className = '' }: { className?: string }) {
  const { data: settings, isLoading } = useUserSettings()
  const enabled = !isLoading && settings?.show_time_block !== false
  const { data: insight } = useDayInsight(enabled)
  if (!enabled || !insight) return null
  return (
    <figure className={`flex flex-col gap-2 ${className}`}>
      <Overline>Время</Overline>
      <p className="text-base leading-[1.45] text-text">{insight.fact}</p>
      {insight.quote && (
        <blockquote className="flex flex-col gap-1 border-l-2 border-border-strong pl-3">
          <p className="text-sm leading-[1.5] text-text-secondary">«{insight.quote.text.trim()}»</p>
          <figcaption className="text-xs text-text-secondary">
            — {insight.quote.author.trim()}
            {insight.quote.source ? `, ${insight.quote.source.trim()}` : ''}
          </figcaption>
        </blockquote>
      )}
    </figure>
  )
}
