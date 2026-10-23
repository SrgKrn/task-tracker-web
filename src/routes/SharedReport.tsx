import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, Overline, Skeleton, StageChip } from '../components/ui'
import type { ClientSnapshot } from '../lib/clientReport'
import { fetchSharedReport } from '../lib/queries/shares'
import { formatMoney, formatRate } from '../lib/rate'
import { f1, hm } from '../lib/report'

/** часы в расчёте суммы — с сотыми: иначе «22,5 ч × 45» не сходится с суммой от 22,52 ч */
const f2 = (h: number) => h.toFixed(2).replace('.', ',')

type State =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; snap: ClientSnapshot; createdAt: string }

/**
 * Отчёт клиенту по ссылке — открывается без входа. Это снимок: цифры на момент отправки,
 * отозванная ссылка показывает понятный текст вместо пустой страницы.
 */
export function SharedReport() {
  const { token = '' } = useParams<{ token: string }>()
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let alive = true
    fetchSharedReport(token)
      .then((r) => {
        if (!alive) return
        setState(r ? { kind: 'ready', snap: r.data, createdAt: r.created_at } : { kind: 'missing' })
      })
      .catch(() => alive && setState({ kind: 'error', message: 'Не получилось загрузить отчёт. Проверьте интернет и обновите страницу.' }))
    return () => {
      alive = false
    }
  }, [token])

  useEffect(() => {
    if (state.kind === 'ready') document.title = `${state.snap.client} · ${state.snap.label}`
  }, [state])

  async function downloadPdf(snap: ClientSnapshot) {
    setSaving(true)
    try {
      const { renderClientPdf } = await import('../lib/exportPdf')
      renderClientPdf(snap).save(`Отчёт_${snap.client}_${snap.from}_${snap.to}.pdf`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh bg-bg">
      <div className="safe-top-page mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-6 pb-12">
        {state.kind === 'loading' && (
          <>
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-24" />
            <Skeleton className="h-40" />
          </>
        )}

        {state.kind === 'missing' && (
          <Card className="flex flex-col gap-2 p-5">
            <h1 className="text-xl font-semibold text-text">Отчёт недоступен</h1>
            <p className="text-base text-text-secondary">
              Ссылку отозвали или в ней ошибка. Попросите отправителя прислать новую.
            </p>
          </Card>
        )}

        {state.kind === 'error' && (
          <Card className="p-5">
            <p className="text-base text-text">{state.message}</p>
          </Card>
        )}

        {state.kind === 'ready' && <Ready snap={state.snap} saving={saving} onPdf={() => downloadPdf(state.snap)} />}
      </div>
    </div>
  )
}

function Ready({ snap, saving, onPdf }: { snap: ClientSnapshot; saving: boolean; onPdf: () => void }) {
  const stamp = new Date(snap.generatedAt).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
  // цвет клиента — как точка в его задачах; у старых ссылок цвета нет — акцент
  const color = snap.color ? `var(--${snap.color})` : 'var(--accent)'
  const fact = snap.sprints.reduce((a, s) => a + s.factTotal, 0)
  const days = snap.days ?? []
  const maxDay = Math.max(...days.map((d) => d.hours), 0.001)
  return (
    <>
      <header className="flex flex-col gap-1.5">
        {snap.logo && (
          <span className="logo-plate mb-2 self-start">
            <img src={snap.logo} alt="" />
          </span>
        )}
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-balance text-text">{snap.client}</h1>
        <p className="text-base text-text-secondary">
          Отчёт за {snap.label}
          {snap.owner ? ` · от ${snap.owner}` : ''}
        </p>
        <p className="text-sm text-text-tertiary">Сформирован {stamp}. Цифры на этот момент.</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="flex min-w-0 flex-col gap-2 p-4">
          <Overline>Часы за период</Overline>
          <span className="flex items-baseline gap-1.5">
            <span className="tabular font-mono text-3xl font-medium text-text">{f1(snap.hours)}</span>
            <span className="text-base text-text-secondary">{snap.plan ? `из ${f1(snap.plan)} ч по плану` : 'ч'}</span>
          </span>
          {!!snap.plan && (
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, (fact / snap.plan) * 100)}%`, background: color }} />
            </div>
          )}
        </Card>
        {snap.billing.map((b) => (
          <div key={b.currency} className="flex min-w-0 flex-col gap-1 rounded-md bg-accent-soft p-4">
            <span className="text-sm text-accent-text">К оплате</span>
            <span className="tabular font-mono text-2xl font-semibold text-text">{formatMoney(b.due, b.currency)}</span>
            {b.overAmount > 0 && !snap.includeOvertime && (
              <span className="text-sm text-accent-text">без переработки {f1(b.overHours)} ч</span>
            )}
          </div>
        ))}
      </div>

      {days.some((d) => d.hours > 0) && (
        <section className="flex flex-col gap-2">
          <Overline className="px-0.5">По дням</Overline>
          <Card className="p-3">
            <svg
              viewBox={`0 0 ${days.length * 10} 60`}
              className="block h-24 w-full"
              preserveAspectRatio="none"
              role="img"
              aria-label="Часы по дням"
            >
              {days.map((d, i) => {
                const h = (d.hours / maxDay) * 56
                return (
                  <g key={d.date}>
                    {d.weekend && <rect x={i * 10} y={0} width={10} height={60} fill="var(--surface-sunken)" />}
                    {h > 0 && <rect x={i * 10 + 2} y={60 - h} width={6} height={h} rx={1.2} fill={color} />}
                  </g>
                )
              })}
            </svg>
            <div className="mt-1 flex justify-between font-mono text-xs text-text-tertiary">
              <span>{days[0]?.day}</span>
              <span>{days[days.length - 1]?.day}</span>
            </div>
          </Card>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <Overline className="px-0.5">Спринты</Overline>
        <div className="flex flex-col divide-y divide-divider rounded-md border border-border bg-surface">
          {snap.sprints.map((s) => {
            const inPlan = s.plan > 0 ? Math.min(s.factTotal, s.plan) : 0
            const tone = s.isFinal ? 'done' : (s.stageTone ?? 'progress')
            const label = s.isFinal ? 'Готово' : s.status === 'без статуса' ? undefined : s.status
            const meta = [
              s.endDate ? `${s.overdue ? 'срок был' : 'до'} ${s.endDate.slice(8, 10)}.${s.endDate.slice(5, 7)}` : '',
              s.subTotal ? `подзадачи ${s.subDone}/${s.subTotal}` : '',
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <div key={s.id} className="flex flex-col gap-2 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0 text-base font-medium text-text">{s.name}</span>
                  <StageChip tone={label ? tone : null} label={label} />
                </div>
                {s.plan > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${(inPlan / s.plan) * 100}%`, background: color }} />
                  </div>
                )}
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="tabular font-mono text-text-secondary">
                    {s.plan > 0 ? `${f1(inPlan)} из ${f1(s.plan)} ч` : `${f1(s.factPeriod)} ч`}
                    {meta ? <span className="font-sans"> · {meta}</span> : null}
                  </span>
                  {s.bill && (
                    <span className="tabular font-mono text-text">
                      {f2(s.bill.hours)} ч × {formatRate(s.bill.rate, s.bill.currency)} ={' '}
                      <b className="font-semibold">
                        {formatMoney(s.bill.amount + (snap.includeOvertime ? s.bill.overAmount : 0), s.bill.currency)}
                      </b>
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {!!snap.journal?.length && (
        <section className="flex flex-col gap-2">
          <Overline className="px-0.5">Что сделано</Overline>
          <div className="flex flex-col gap-3">
            {snap.journal.map((day) => (
              <Card key={day.date} className="flex flex-col gap-2 p-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-base font-medium text-text first-letter:uppercase">{day.label}</span>
                  <span className="tabular shrink-0 font-mono text-sm text-text-secondary">{hm(day.total)}</span>
                </div>
                {day.rows.map((row) => (
                  <div key={row.title} className="flex flex-col gap-0.5 border-t border-divider pt-2">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 text-text">{row.title}</span>
                      <span className="tabular shrink-0 font-mono text-text-secondary">{hm(row.hours)}</span>
                    </div>
                    {row.notes.map((n, i) => (
                      <span key={i} className="text-sm text-text-secondary">
                        {n}
                      </span>
                    ))}
                  </div>
                ))}
              </Card>
            ))}
          </div>
        </section>
      )}

      <Button variant="primary" size="lg" loading={saving} onClick={onPdf} className="self-start">
        Скачать PDF
      </Button>
      <p className="text-sm text-text-tertiary">С планом к оплате — часы в пределах плана × ставка, без плана — часы за период.</p>
    </>
  )
}
