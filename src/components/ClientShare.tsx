import { useMemo, useState } from 'react'
import { PickerField } from './PickerField'
import { Button, ListGroup, Overline, Tag } from './ui'
import { buildClientSnapshot, newShareToken, shareUrl } from '../lib/clientReport'
import { useGroupModel } from '../lib/groups'
import { useProfile } from '../lib/profile'
import { formatRate, type RateCurrency } from '../lib/rate'
import type { ReportData } from '../lib/report'
import { useCreateShare, useReportShares, useRevokeShare, type ReportShare } from '../lib/queries/shares'
import { describeError, useToast } from '../lib/Toast'
import type { Task } from '../lib/types'

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function dm(iso: string): string {
  const [, m, d] = iso.split('-')
  return `${d}.${m}`
}

/**
 * Ссылка для клиента: снимок отчёта по одному клиенту за выбранный период. Клиент открывает
 * её без входа и видит спринты, часы и сумму, может скачать PDF. Снимок не меняется —
 * новые часы попадут только в новую ссылку.
 */
export function ClientShare({
  from,
  to,
  tasks,
  initialItemId,
  load,
}: {
  from: string
  to: string
  tasks: Task[]
  initialItemId?: string | null
  /** собрать отчёт за период с текущими галочками */
  load: () => Promise<ReportData>
}) {
  const model = useGroupModel()
  const profile = useProfile()
  const { data: shares = [] } = useReportShares()
  const create = useCreateShare()
  const revoke = useRevokeShare()
  const { showError, showSuccess } = useToast()
  const [itemId, setItemId] = useState<string | null>(initialItemId ?? null)
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<string | null>(null)

  // клиенты со ставкой — первыми: отчёт по ссылке почти всегда про них
  const options = useMemo(() => {
    const all = model.groups.flatMap((g) =>
      model.itemsOf(g.id).filter((i) => !i.archived).map((i) => ({ item: i, group: g })),
    )
    const rated = (x: (typeof all)[number]) => (x.item.hourly_rate != null && Number(x.item.hourly_rate) > 0 ? 0 : 1)
    return [...all]
      .sort((a, b) => rated(a) - rated(b))
      .map(({ item, group }) => ({
        id: item.id,
        name:
          item.hourly_rate != null && Number(item.hourly_rate) > 0
            ? `${item.name} · ${formatRate(Number(item.hourly_rate), (item.rate_currency ?? 'BYN') as RateCurrency)}`
            : `${item.name} · ${group.name.toLowerCase()}`,
      }))
  }, [model])

  async function makeLink() {
    if (!itemId) return
    if (from > to) {
      showError('Начало периода позже конца — поменяйте даты местами')
      return
    }
    const item = model.itemById.get(itemId)
    if (!item) return
    setBusy(true)
    try {
      const report = await load()
      const snapshot = buildClientSnapshot({ report, tasks, itemId, client: item.name, owner: profile.name })
      if (!snapshot.sprints.length) {
        showError(`У «${item.name}» нет спринтов с часами или сроком в этом периоде`)
        return
      }
      const token = newShareToken()
      await create.mutateAsync({ token, itemId, title: `${item.name} · ${snapshot.label}`, snapshot })
      const url = shareUrl(token)
      setFresh(url)
      showSuccess((await copy(url)) ? 'Ссылка скопирована' : 'Ссылка готова')
    } catch (e) {
      showError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6 flex flex-col gap-3">
      <Overline className="px-0.5">Ссылка для клиента</Overline>
      <p className="px-0.5 text-sm text-text-secondary">
        Клиент откроет отчёт без входа: спринты, часы и сумма к оплате за период выше, можно скачать PDF. Это снимок —
        новые часы попадут только в новую ссылку.
      </p>
      <PickerField
        label="Клиент"
        items={options}
        value={itemId}
        onChange={(id) => {
          setItemId(id)
          setFresh(null)
        }}
        placeholder="Клиент"
        emptyLabel="Выберите клиента"
      />
      <Button variant="primary" size="lg" disabled={!itemId || busy} loading={busy} onClick={makeLink}>
        Создать ссылку
      </Button>

      {fresh && (
        <div className="flex items-center gap-2 rounded-sm border border-border bg-surface px-3 py-2">
          <input
            id="share-fresh-url"
            readOnly
            value={fresh}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-text outline-none"
            aria-label="Ссылка на отчёт"
          />
          <Button
            variant="ghost"
            onClick={async () => showSuccess((await copy(fresh)) ? 'Скопировано' : 'Выделите ссылку и скопируйте')}
          >
            Копировать
          </Button>
        </div>
      )}

      {shares.length > 0 && (
        <ListGroup>
          {shares.map((s) => (
            <ShareRow key={s.id} share={s} onRevoke={() => revoke.mutate(s.id, { onError: (e) => showError(describeError(e)), onSuccess: () => showSuccess('Ссылка отозвана') })} />
          ))}
        </ListGroup>
      )}
    </section>
  )
}

function ShareRow({ share, onRevoke }: { share: ReportShare; onRevoke: () => void }) {
  const { showSuccess } = useToast()
  const revoked = !!share.revoked_at
  const seen = share.views > 0 ? `открыт ${share.views} раз` : 'ещё не открывали'
  return (
    <div className="flex min-h-14 items-center gap-3 px-3.5 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-base ${revoked ? 'text-text-tertiary line-through' : 'text-text'}`}>{share.title}</span>
        <span className="text-sm text-text-secondary">
          {dm(share.period_from)}–{dm(share.period_to)} · {revoked ? 'отозвана' : seen}
        </span>
      </span>
      {revoked ? (
        <Tag>отозвана</Tag>
      ) : (
        <span className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            onClick={async () => showSuccess((await copy(shareUrl(share.token))) ? 'Скопировано' : 'Не получилось скопировать')}
          >
            Копировать
          </Button>
          <Button variant="ghost" className="text-danger-text" onClick={onRevoke}>
            Отозвать
          </Button>
        </span>
      )}
    </div>
  )
}
