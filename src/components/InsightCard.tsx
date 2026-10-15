import { useState } from 'react'
import { useDayInsight } from '../lib/insight'
import { useUserSettings } from '../lib/queries/userSettings'
import { ChevronRight } from './Icon'
import { Overline, Sheet } from './ui'

/**
 * Блок «Время» на «Сегодня»: в шапке — только цитата, на две строки, со стрелкой (её можно
 * открыть); по нажатию — лист с фактом дня и цитатой крупно. Тот же блок придёт вечером в
 * «Итогах дня» в Telegram. Нечего сказать, выключен или сервер не ответил — блока нет.
 */
export function InsightQuote({ className = '' }: { className?: string }) {
  const { data: settings, isLoading } = useUserSettings()
  const enabled = !isLoading && settings?.show_time_block !== false
  const { data: insight } = useDayInsight(enabled)
  const [open, setOpen] = useState(false)
  if (!enabled || !insight?.quote) return null
  const { quote } = insight
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Цитата дня: ${quote.text.trim()} — ${quote.author.trim()}. Открыть факт дня`}
        className={`flex w-full items-center gap-2 rounded-md border border-border bg-surface py-2 pr-2 pl-3 text-left hover:border-border-strong ${className}`}
      >
        <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-[1.4] text-text-secondary">
          «{quote.text.trim()}»
        </span>
        <ChevronRight size={16} className="shrink-0 text-text-tertiary" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Время">
        <div className="flex flex-col gap-1.5">
          <Overline>Факт дня</Overline>
          <p className="text-base leading-[1.45] text-text">{insight.fact}</p>
        </div>
        <figure className="flex flex-col gap-3 border-t border-border pt-4 pb-2">
          <blockquote className="text-xl leading-[1.4] font-medium tracking-[-0.01em] text-text">
            «{quote.text.trim()}»
          </blockquote>
          <figcaption className="text-sm text-text-secondary">
            — {quote.author.trim()}
            {quote.source ? `, ${quote.source.trim()}` : ''}
          </figcaption>
        </figure>
      </Sheet>
    </>
  )
}
