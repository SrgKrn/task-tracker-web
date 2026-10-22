import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Card, Logo, Overline, Skeleton, Tag } from '../components/ui'
import { snapshotAsReport, type ClientSnapshot } from '../lib/clientReport'
import { fetchSharedReport } from '../lib/queries/shares'
import { formatMoney, formatRate } from '../lib/rate'
import { f1 } from '../lib/report'

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
      renderClientPdf(snapshotAsReport(snap)).save(`Отчёт_${snap.client}_${snap.from}_${snap.to}.pdf`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh bg-bg">
      <div className="safe-top-page mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-6 pb-12">
        <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
          <Logo size={20} />
          Semternity · отчёт
        </div>

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
        <Card className="flex min-w-0 flex-col gap-1 p-4">
          <Overline>Часы за период</Overline>
          <span className="tabular font-mono text-2xl font-medium text-text">{f1(snap.hours)}</span>
        </Card>
        {snap.billing.map((b) => (
          <Card key={b.currency} className="flex min-w-0 flex-col gap-1 p-4">
            <Overline>К оплате</Overline>
            <span className="tabular font-mono text-2xl font-medium text-text">{formatMoney(b.due, b.currency)}</span>
            {b.overAmount > 0 && !snap.includeOvertime && (
              <span className="text-sm text-text-tertiary">
                без переработки {f1(b.overHours)} ч
              </span>
            )}
          </Card>
        ))}
      </div>

      <section className="flex flex-col gap-2">
        <Overline className="px-0.5">Спринты</Overline>
        <div className="flex flex-col divide-y divide-divider rounded-md border border-border bg-surface">
          {snap.sprints.map((s) => {
            const share = s.plan > 0 ? Math.min(1, s.factTotal / s.plan) : 0
            return (
              <div key={s.id} className="flex flex-col gap-2 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="text-base font-medium text-text">{s.name}</span>
                    {(s.inner || s.outer) && <span className="text-sm text-text-secondary">{s.inner || s.outer}</span>}
                  </span>
                  <Tag tone={s.isFinal ? 'success' : 'neutral'}>{s.status}</Tag>
                </div>
                {s.plan > 0 && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                    <div
                      className={`h-full rounded-full ${s.group === 'over' ? 'bg-danger' : 'bg-accent'}`}
                      style={{ width: `${share * 100}%` }}
                    />
                  </div>
                )}
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                  <span className="tabular font-mono text-text-secondary">
                    {s.plan > 0 ? `${f1(s.factTotal)} из ${f1(s.plan)} ч` : `${f1(s.factPeriod)} ч`}
                    {s.pct !== null ? ` · ${s.pct}%` : ''}
                  </span>
                  {s.bill && (
                    <span className="tabular font-mono text-text">
                      {f2(s.bill.hours)} ч × {formatRate(s.bill.rate, s.bill.currency)} ={' '}
                      <b className="font-semibold">{formatMoney(s.bill.amount, s.bill.currency)}</b>
                    </span>
                  )}
                </div>
                {s.bill && s.bill.overHours > 0.004 && (
                  <span className="text-sm text-danger-text">
                    Сверх плана {f1(s.bill.overHours)} ч · {formatMoney(s.bill.overAmount, s.bill.currency)}
                    {snap.includeOvertime ? ' — в итоге' : ' — не в итоге'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <Button variant="primary" size="lg" loading={saving} onClick={onPdf} className="self-start">
        Скачать PDF
      </Button>
      <p className="text-sm text-text-tertiary">
        С планом к оплате — часы в пределах плана × ставка, без плана — часы за период.
      </p>
    </>
  )
}
