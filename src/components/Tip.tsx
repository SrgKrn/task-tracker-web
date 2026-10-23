import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { HELP_BY_ID, type HelpId } from '../lib/help'
import { TIPS, pickTip, stepLabel, useTipCandidates, type TipId } from '../lib/tips'
import { useMarkTipSeen, useUserSettings } from '../lib/queries/userSettings'
import { Button, Chip, Sheet } from './ui'

/** сколько кнопка должна простоять на экране, прежде чем рядом появится подсказка */
const SETTLE_MS = 600
const GAP = 12
const MARGIN = 12

interface Shown {
  id: TipId
  el: Element
  rect: DOMRect
  radius: string
}

/** Первый видимый элемент с этой подсказкой: в списке их может быть десяток (кнопки ▶ в строках). */
function visibleAnchor(id: TipId): Element | null {
  for (const el of document.querySelectorAll(`[data-tip~="${id}"]`)) {
    const r = el.getBoundingClientRect()
    if (r.width < 4 || r.height < 4) continue
    if (r.bottom < 40 || r.top > window.innerHeight - 40 || r.right < 0 || r.left > window.innerWidth) continue
    return el
  }
  return null
}

/**
 * Показывает подсказки рядом с функциями (0.43). Экран не затемняется и не блокируется:
 * подсказку можно не читать. «Понятно», «Подробнее», касание мимо или переход на другой
 * экран закрывают её навсегда. Пока открыто любое окно, подсказка ждёт.
 */
export function TipHost() {
  const candidates = useTipCandidates()
  const { data: settings } = useUserSettings()
  const mark = useMarkTipSeen()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [shown, setShown] = useState<Shown | null>(null)
  const [help, setHelp] = useState<HelpId | null>(null)
  // закрытые в этом запуске — на случай, если отметка в базу не дошла
  const closed = useRef(new Set<string>())
  const pending = useRef<{ id: TipId; since: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const queue = settings
    ? pickTip(candidates, settings.tips ?? {}, settings.tips_enabled !== false).filter((id) => !closed.current.has(id))
    : []
  const queueKey = queue.join(',')

  const close = useCallback(
    (id: TipId) => {
      closed.current.add(id)
      pending.current = null
      setShown(null)
      mark.mutate(id)
    },
    [mark],
  )

  // кто из очереди виден и готов: проверяем 4 раза в секунду — дёшево и без подписок на всё подряд
  useEffect(() => {
    if (!queueKey || help) {
      setShown(null)
      return
    }
    const ids = queueKey.split(',') as TipId[]
    const tick = () => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
        pending.current = null
        setShown(null)
        return
      }
      for (const id of ids) {
        const el = visibleAnchor(id)
        if (!el) continue
        const now = Date.now()
        if (pending.current?.id !== id) pending.current = { id, since: now }
        if (now - pending.current.since < SETTLE_MS) return
        const radius = getComputedStyle(el).borderRadius
        setShown((s) =>
          s?.id === id && s.el === el ? s : { id, el, rect: el.getBoundingClientRect(), radius: radius && radius !== '0px' ? radius : '10px' },
        )
        return
      }
      pending.current = null
      setShown(null)
    }
    tick()
    const t = window.setInterval(tick, 250)
    return () => window.clearInterval(t)
  }, [queueKey, help])

  // кнопка уехала при прокрутке или повороте — подсказка едет за ней
  useEffect(() => {
    if (!shown) return
    let frame = 0
    const follow = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setShown((s) => (s ? { ...s, rect: s.el.getBoundingClientRect() } : s)))
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
    }
  }, [shown?.id, shown?.el]) // eslint-disable-line react-hooks/exhaustive-deps

  // касание мимо подсказки закрывает её, но само касание проходит дальше: нажали «+» — и
  // подсказка закрылась, и окно задачи открылось
  useEffect(() => {
    if (!shown) return
    const onDown = (e: PointerEvent) => {
      if (cardRef.current?.contains(e.target as Node)) return
      close(shown.id)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [shown?.id, close]) // eslint-disable-line react-hooks/exhaustive-deps

  // ушли на другой экран — подсказка про прошлый больше не к месту
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current === pathname) return
    lastPath.current = pathname
    if (shown) close(shown.id)
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  const tip = shown ? TIPS[shown.id] : null

  return (
    <>
      {shown && tip && createPortal(<TipCard shown={shown} cardRef={cardRef} onClose={close} onMore={(id) => {
        close(id)
        setHelp(TIPS[id].help)
      }} onAction={(id, to) => {
        close(id)
        navigate(to)
      }} />, document.body)}
      <HelpSheet id={help} onChange={setHelp} />
    </>
  )
}

function TipCard({
  shown,
  cardRef,
  onClose,
  onMore,
  onAction,
}: {
  shown: Shown
  cardRef: React.RefObject<HTMLDivElement | null>
  onClose: (id: TipId) => void
  onMore: (id: TipId) => void
  onAction: (id: TipId, to: string) => void
}) {
  const tip = TIPS[shown.id]
  const step = stepLabel(shown.id)
  const { rect } = shown
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(320, vw - MARGIN * 2)
  const center = rect.left + rect.width / 2
  const left = Math.min(Math.max(center - width / 2, MARGIN), vw - width - MARGIN)
  const arrow = Math.min(Math.max(center - left, 18), width - 18)
  // кнопка в нижней половине экрана — подсказка над ней, иначе под ней
  const above = rect.top + rect.height / 2 > vh / 2
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => setReady(true), [])

  return (
    <>
      <span
        aria-hidden
        className="tip-ring pointer-events-none fixed z-[var(--z-overlay)] border-2 border-accent"
        style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8, borderRadius: shown.radius }}
      />
      <div
        ref={cardRef}
        role="status"
        aria-live="polite"
        className={`tip-in fixed z-[var(--z-overlay)] flex flex-col gap-1.5 rounded-lg bg-text px-3.5 pt-3 pb-2.5 text-text-inverse shadow-modal ${ready ? '' : 'opacity-0'}`}
        style={{
          left,
          width,
          ...(above ? { bottom: vh - rect.top + GAP } : { top: rect.bottom + GAP }),
        }}
      >
        <span
          aria-hidden
          className="absolute h-3 w-3 rotate-45 rounded-xs bg-text"
          style={{ left: arrow - 6, ...(above ? { bottom: -5 } : { top: -5 }) }}
        />
        {step && <span className="text-xs opacity-60">{step}</span>}
        <span className="text-md font-semibold">{tip.title}</span>
        <span className="text-sm leading-[1.45] opacity-85">{tip.text}</span>
        <span className="mt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onMore(shown.id)}
            className="hit-44 -ml-1 min-h-9 rounded-sm px-1 text-sm font-medium underline decoration-dotted underline-offset-4 opacity-80"
          >
            Подробнее
          </button>
          <button
            type="button"
            onClick={() => (tip.action ? onAction(shown.id, tip.action.to) : onClose(shown.id))}
            className="min-h-9 rounded-sm bg-accent px-3.5 text-sm font-semibold text-on-accent"
          >
            {tip.action?.label ?? 'Понятно'}
          </button>
        </span>
        {tip.action && (
          <button type="button" onClick={() => onClose(shown.id)} className="self-end text-xs opacity-60">
            Не сейчас
          </button>
        )}
      </div>
    </>
  )
}

/** Окно статьи справки: из подсказки («Подробнее») и из списка «Профиль → Справка». */
export function HelpSheet({ id, onChange }: { id: HelpId | null; onChange: (id: HelpId | null) => void }) {
  const article = id ? HELP_BY_ID.get(id) : undefined
  return (
    <Sheet open={!!article} onClose={() => onChange(null)} title={article?.title ?? ''}>
      {article && (
        <div className="flex flex-col gap-3.5">
          <p className="text-base leading-[1.5] text-text">{article.intro}</p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-base leading-[1.5] text-text marker:text-text-secondary">
            {article.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          {article.note && <p className="rounded-md bg-surface-sunken px-3 py-2.5 text-sm leading-[1.5] text-text-secondary">{article.note}</p>}
          {article.related.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-text-secondary">Рядом</span>
              <span className="flex flex-wrap gap-1.5">
                {article.related.map((r) => (
                  <Chip key={r} onClick={() => onChange(r)}>
                    {HELP_BY_ID.get(r)?.title ?? r}
                  </Chip>
                ))}
              </span>
            </div>
          )}
          <div className="mt-1 flex gap-2">
            {article.open && (
              <Link
                to={article.open.to}
                onClick={() => onChange(null)}
                className="inline-flex h-[var(--tap)] flex-1 items-center justify-center rounded-sm border border-border bg-surface px-4 text-base font-medium text-text active:bg-surface-sunken"
              >
                {article.open.label}
              </Link>
            )}
            <Button variant="primary" className="flex-1" onClick={() => onChange(null)}>
              Понятно
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  )
}
