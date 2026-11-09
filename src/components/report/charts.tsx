import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMediaQuery } from '../../lib/device'
import { f1, fh } from '../../lib/report'
import type { Bucket, ChartSeries } from '../../lib/reportViews'

/*
 * Графики «Сводки» (0.66). Свои, на div и токенах: библиотека графиков ради трёх видов
 * тянула бы сотни килобайт в PWA. Правила: цвет клиента — его метка (идёт за клиентом, а не
 * за местом в рейтинге), текст — всегда цветами текста, между сегментами зазор 2 px,
 * у каждого столбика подсказка по наведению и по фокусу, сами цифры есть в таблицах ниже.
 */

/** цвет серии: метка значения группы или нейтральный */
export function seriesColor(color: string | null | undefined): string {
  return color ? `var(--${color})` : 'var(--text-tertiary)'
}

/* ── подсказка у курсора ─────────────────────────────────────────── */

interface TipState {
  x: number
  y: number
  node: ReactNode
}

/** одна подсказка на график: show(e, содержимое) на наведение и фокус, hide — на уход */
export function useChartTip() {
  const [tip, setTip] = useState<TipState | null>(null)
  const show = (e: { currentTarget: Element }, node: ReactNode) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ x: r.left + r.width / 2, y: r.top, node })
  }
  const hide = () => setTip(null)
  const element = tip
    ? createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[var(--z-tooltip)] flex max-w-64 flex-col gap-1 rounded-sm border border-border bg-surface px-2.5 py-2 text-sm text-text shadow-popover"
          style={{
            left: Math.min(Math.max(tip.x, 136), window.innerWidth - 136),
            top: tip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tip.node}
        </div>,
        document.body,
      )
    : null
  return { show, hide, element }
}

/** строка подсказки: штрих цвета серии, название, значение справа */
export function TipRow({ color, label, value }: { color?: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-2">
      {color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden />}
      <span className="min-w-0 flex-1 truncate text-text-secondary">{label}</span>
      <span className="tabular shrink-0 font-mono font-medium text-text">{value}</span>
    </span>
  )
}

/* ── легенда ─────────────────────────────────────────────────────── */

export function Legend({
  series,
  activeKeys,
  onToggle,
}: {
  series: ChartSeries[]
  /** выбранные в фильтре — остальные бледнеют */
  activeKeys?: string[]
  onToggle?: (key: string) => void
}) {
  if (series.length < 2) return null
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {series.map((s) => {
        const dim = !!activeKeys?.length && !activeKeys.includes(s.key)
        const clickable = !!onToggle && s.key !== 'other' && s.key !== 'none'
        const body = (
          <>
            <span className="h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: seriesColor(s.color) }} aria-hidden />
            <span className="truncate">{s.name}</span>
          </>
        )
        const cls = `inline-flex max-w-44 items-center gap-1.5 text-sm text-text-secondary ${dim ? 'opacity-50' : ''}`
        return clickable ? (
          <button key={s.key} type="button" onClick={() => onToggle(s.key)} className={`${cls} hover:text-text`}>
            {body}
          </button>
        ) : (
          <span key={s.key} className={cls}>
            {body}
          </span>
        )
      })}
    </div>
  )
}

/* ── столбики по времени ─────────────────────────────────────────── */

function niceMax(v: number): { max: number; step: number } {
  const raw = Math.max(v, 1)
  const steps = [0.5, 1, 2, 4, 5, 10, 20, 25, 40, 50, 100, 200]
  const step = steps.find((s) => raw / s <= 4) ?? 400
  return { max: Math.ceil(raw / step) * step, step }
}

export function TimeBars({
  buckets,
  series,
  today,
  height = 200,
  onPick,
  titleOf,
}: {
  buckets: Bucket[]
  series: ChartSeries[]
  today: string
  height?: number
  /** нажатие на столбик — провалиться в этот отрезок */
  onPick?: (b: Bucket) => void
  /** полная подпись отрезка для подсказки: «9 ноября, понедельник» */
  titleOf: (b: Bucket) => string
}) {
  const tip = useChartTip()
  const top = Math.max(...buckets.map((b) => Math.max(b.hours, b.norm ?? 0)), 0)
  const { max, step } = niceMax(top * 1.05)
  const ticks: number[] = []
  for (let t = step; t <= max + 0.001; t += step) ticks.push(t)
  // подписи под столбиками: не чаще, чем влезает — на телефоне и у длинных подписей («28–3») реже
  const wide = useMediaQuery('(min-width: 1024px)')
  const long = buckets.some((b) => b.label.length > 2)
  const every = Math.ceil(buckets.length / (long ? (wide ? 14 : 5) : wide ? 31 : 11))
  const hasNorm = buckets.some((b) => (b.norm ?? 0) > 0)

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        {/* ось: подписи слева, не в ширину графика */}
        <div className="relative w-7 shrink-0" style={{ height }} aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="tabular absolute right-0 font-mono text-xs leading-4 text-text-tertiary"
              style={{ bottom: `calc(${(t / max) * 100}% - 8px)` }}
            >
              {fh(t)}
            </span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="pointer-events-none absolute inset-x-0 border-t border-divider"
              style={{ bottom: `${(t / max) * 100}%` }}
              aria-hidden
            />
          ))}
          <div className="absolute inset-0 flex items-end border-b border-border-strong">
            {buckets.map((b) => {
              const future = b.from > today
              const current = b.from <= today && today <= b.to
              const total = Math.max(0, b.hours)
              const node = (
                <>
                  <span className="font-medium">{titleOf(b)}</span>
                  <TipRow label="Всего" value={`${f1(b.hours)} ч`} />
                  {series.length > 1 &&
                    series.map((s, i) =>
                      b.parts[i] > 0.004 ? (
                        <TipRow key={s.key} color={seriesColor(s.color)} label={s.name} value={f1(b.parts[i])} />
                      ) : null,
                    )}
                  {(b.norm ?? 0) > 0 && <TipRow label="Норма" value={`${fh(b.norm!)} ч`} />}
                </>
              )
              return (
                <button
                  key={b.from}
                  type="button"
                  disabled={!onPick}
                  onClick={() => onPick?.(b)}
                  onPointerEnter={(e) => tip.show(e, node)}
                  onPointerLeave={tip.hide}
                  onFocus={(e) => tip.show(e, node)}
                  onBlur={tip.hide}
                  aria-label={`${titleOf(b)}: ${f1(b.hours)} ч`}
                  className={`group relative flex h-full min-w-0 flex-1 flex-col justify-end px-px ${
                    b.weekend ? 'bg-surface-sunken/35' : ''
                  } ${onPick ? 'cursor-pointer hover:bg-surface-sunken' : ''}`}
                >
                  {/* норма отрезка — риска поверх столбика */}
                  {(b.norm ?? 0) > 0 && (
                    <span
                      className="pointer-events-none absolute inset-x-0 z-10 border-t border-dashed border-border-strong"
                      style={{ bottom: `${(b.norm! / max) * 100}%` }}
                      aria-hidden
                    />
                  )}
                  <span
                    className="mx-auto flex w-full flex-col-reverse gap-0.5 overflow-hidden rounded-t-xs group-hover:brightness-110"
                    style={{ height: `${(total / max) * 100}%`, maxWidth: 28, minHeight: total > 0 ? 3 : 0 }}
                  >
                    {series.length > 1 ? (
                      series.map((s, i) =>
                        b.parts[i] > 0.004 ? (
                          <span key={s.key} style={{ flexGrow: b.parts[i], flexBasis: 0, background: seriesColor(s.color) }} />
                        ) : null,
                      )
                    ) : (
                      <span
                        className="flex-1"
                        style={{ background: series[0]?.color ? seriesColor(series[0].color) : 'var(--accent)', opacity: current || future ? 1 : 0.8 }}
                      />
                    )}
                  </span>
                  {total === 0 && (
                    <span
                      className="mx-auto w-full rounded-full"
                      style={{ height: 2, maxWidth: 28, background: future ? 'var(--bar-future)' : 'var(--bar-empty)' }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex gap-2" aria-hidden>
        <span className="w-7 shrink-0" />
        <div className="flex min-w-0 flex-1">
          {buckets.map((b, i) => {
            const current = b.from <= today && today <= b.to
            return (
              <span
                key={b.from}
                className={`tabular min-w-0 flex-1 overflow-visible text-center font-mono text-xs whitespace-nowrap ${
                  current ? 'font-medium text-accent-text' : b.weekend ? 'text-text-tertiary' : 'text-text-secondary'
                }`}
              >
                {i % every === 0 ? b.label : ''}
              </span>
            )
          })}
        </div>
      </div>
      {hasNorm && (
        <span className="flex items-center gap-1.5 pl-9 text-xs text-text-tertiary">
          <span className="w-4 border-t border-dashed border-border-strong" aria-hidden />
          норма
        </span>
      )}
      {tip.element}
    </div>
  )
}

/* ── горизонтальные полосы: «куда ушло время» ────────────────────── */

export interface HBarRow {
  id: string
  name: string
  color?: string | null
  hours: number
  prevHours?: number
  share: number
  note?: string
}

export function HBars({
  rows,
  selected,
  onPick,
  showPrev,
  identity,
}: {
  rows: HBarRow[]
  selected?: string[]
  onPick?: (row: HBarRow) => void
  /** показывать разницу с прошлым периодом */
  showPrev?: boolean
  /** у строк свои цвета (клиенты); иначе все полосы одного цвета — это величина, а не сущность */
  identity?: boolean
}) {
  const max = Math.max(...rows.map((r) => r.hours), 0.001)
  return (
    <div className="flex flex-col">
      {rows.map((r) => {
        const on = !!selected?.includes(r.id)
        const dim = !!selected?.length && !on
        const delta = r.hours - (r.prevHours ?? 0)
        const body = (
          <>
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                {identity && r.color && (
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seriesColor(r.color) }} aria-hidden />
                )}
                <span className={`truncate text-base ${on ? 'font-medium text-accent-text' : 'text-text'}`}>{r.name}</span>
                {r.note && <span className="shrink-0 text-xs text-text-tertiary">{r.note}</span>}
              </span>
              {showPrev && (r.prevHours ?? 0) > 0.004 && Math.abs(delta) >= 0.05 && (
                <span className="tabular shrink-0 font-mono text-xs text-text-tertiary">
                  {delta > 0 ? '+' : '−'}
                  {f1(Math.abs(delta))}
                </span>
              )}
              <span className="tabular w-14 shrink-0 text-right font-mono text-base font-medium text-text">{f1(r.hours)}</span>
              <span className="tabular w-10 shrink-0 text-right font-mono text-xs text-text-secondary">
                {r.share > 0 && r.share < 0.005 ? '<1' : Math.round(r.share * 100)}%
              </span>
            </span>
            <span className="block h-1.5 overflow-hidden rounded-full bg-surface-sunken">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.max(0, (r.hours / max) * 100)}%`,
                  background: identity ? seriesColor(r.color) : 'var(--accent)',
                }}
              />
            </span>
          </>
        )
        const cls = `flex flex-col gap-1 rounded-sm px-2 py-1.5 text-left lg:gap-1.5 lg:py-2 ${dim ? 'opacity-55' : ''}`
        return onPick && r.id ? (
          <button
            key={r.id || 'none'}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(r)}
            className={`${cls} hover:bg-surface-sunken ${on ? 'bg-surface-selected' : ''}`}
          >
            {body}
          </button>
        ) : (
          <div key={r.id || 'none'} className={cls}>
            {body}
          </div>
        )
      })}
    </div>
  )
}

/* ── тепловая карта: день недели × час ───────────────────────────── */

const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

export function Heatmap({ heat }: { heat: number[][] }) {
  const tip = useChartTip()
  const max = Math.max(...heat.flat(), 0.001)
  // показываем только часы, где работа бывает, но не меньше 8–20
  let lo = 8
  let hi = 20
  for (let h = 0; h < 24; h++) {
    if (heat.some((row) => row[h] > 0.05)) {
      lo = Math.min(lo, h)
      hi = Math.max(hi, h)
    }
  }
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  return (
    <div className="flex flex-col gap-1">
      {heat.map((row, d) => (
        <div key={d} className="flex items-center gap-0.5">
          <span className="w-6 shrink-0 text-xs text-text-secondary">{WD[d]}</span>
          {hours.map((h) => {
            const v = row[h]
            const k = v / max
            const node = (
              <>
                <span className="font-medium">
                  {WD[d]}, {String(h).padStart(2, '0')}:00–{String(h + 1).padStart(2, '0')}:00
                </span>
                <TipRow label="За период" value={`${f1(v)} ч`} />
              </>
            )
            return (
              <span
                key={h}
                tabIndex={v > 0.05 ? 0 : -1}
                onPointerEnter={(e) => tip.show(e, node)}
                onPointerLeave={tip.hide}
                onFocus={(e) => tip.show(e, node)}
                onBlur={tip.hide}
                aria-label={`${WD[d]} ${h}:00 — ${f1(v)} ч`}
                className="h-5 min-w-0 flex-1 rounded-xs"
                style={{
                  background:
                    v > 0.05 ? `color-mix(in oklab, var(--accent) ${Math.round(18 + k * 82)}%, var(--surface))` : 'var(--surface-sunken)',
                }}
              />
            )
          })}
        </div>
      ))}
      <div className="flex gap-0.5" aria-hidden>
        <span className="w-6 shrink-0" />
        {hours.map((h) => (
          <span key={h} className="tabular min-w-0 flex-1 text-center font-mono text-xs text-text-tertiary">
            {h % 2 === 0 ? h : ''}
          </span>
        ))}
      </div>
      {tip.element}
    </div>
  )
}

/* ── одна полоса из частей: из чего сложился учёт ────────────────── */

export function SplitBar({ parts }: { parts: { key: string; label: string; hours: number; color: string }[] }) {
  const tip = useChartTip()
  const shown = parts.filter((p) => p.hours > 0.004)
  const total = shown.reduce((s, p) => s + p.hours, 0)
  if (total <= 0) return null
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {shown.map((p) => (
          <span
            key={p.key}
            tabIndex={0}
            onPointerEnter={(e) => tip.show(e, <TipRow color={p.color} label={p.label} value={`${f1(p.hours)} ч`} />)}
            onPointerLeave={tip.hide}
            onFocus={(e) => tip.show(e, <TipRow color={p.color} label={p.label} value={`${f1(p.hours)} ч`} />)}
            onBlur={tip.hide}
            aria-label={`${p.label}: ${f1(p.hours)} ч`}
            style={{ flexGrow: p.hours, flexBasis: 0, background: p.color }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {shown.map((p) => (
          <span key={p.key} className="flex items-center gap-1.5 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-xs" style={{ background: p.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-text-secondary">{p.label}</span>
            <span className="tabular shrink-0 font-mono text-text">{f1(p.hours)}</span>
            <span className="tabular w-9 shrink-0 text-right font-mono text-xs text-text-tertiary">
              {Math.round((p.hours / total) * 100)}%
            </span>
          </span>
        ))}
      </div>
      {tip.element}
    </div>
  )
}

/* ── плитка показателя ───────────────────────────────────────────── */

export function Kpi({
  label,
  value,
  unit,
  sub,
  tone,
  progress,
  compact,
}: {
  label: string
  value: string
  unit?: string
  sub?: ReactNode
  tone?: 'danger'
  /** доля 0…1+ — тонкая полоса под числом */
  progress?: number
  /** длинное значение (суммы в двух валютах) — кеглем меньше, с переносом по частям */
  compact?: boolean
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-surface px-2.5 py-2 lg:gap-1 lg:rounded-md lg:border lg:border-border lg:p-3.5">
      <span className="truncate text-xs font-medium text-text-secondary lg:text-sm">{label}</span>
      <span className="flex items-baseline gap-1">
        <span
          className={`tabular font-mono font-medium ${compact ? 'text-sm leading-6 lg:text-md lg:leading-7' : 'text-md lg:text-xl'} ${tone === 'danger' ? 'text-danger-text' : 'text-text'}`}
        >
          {value}
        </span>
        {unit && <span className="text-xs text-text-secondary lg:text-sm">{unit}</span>}
      </span>
      {progress !== undefined && (
        <span className="block h-1 overflow-hidden rounded-full bg-surface-sunken">
          <span
            className="block h-full rounded-full"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%`, background: progress > 1 ? 'var(--success)' : 'var(--accent)' }}
          />
        </span>
      )}
      {sub && <span className="text-xs leading-4 text-text-secondary max-lg:line-clamp-2 lg:truncate">{sub}</span>}
    </div>
  )
}

/** карточка раздела дашборда: заголовок, справа — управление */
export function Panel({
  title,
  aside,
  children,
  className = '',
}: {
  title: string
  aside?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface p-3 lg:gap-3 lg:p-4 ${className}`}>
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 className="text-md font-semibold text-text">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}
