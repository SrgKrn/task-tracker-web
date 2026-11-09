import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Download, Pencil } from '../Icon'
import { PickerField } from '../PickerField'
import { Button, EmptyState, Sheet, SheetActions, StageChip, fieldClass } from '../ui'
import { UpgradeNote } from '../Upgrade'
import { seriesColor } from './charts'
import { buildClientSnapshot, newShareToken, shareUrl, type ClientSnapshot } from '../../lib/clientReport'
import type { GroupModel } from '../../lib/groups'
import type { Limits } from '../../lib/limits'
import { useProfile } from '../../lib/profile'
import { useUpdateGroupItem } from '../../lib/queries/groups'
import { reportFromRaw, type ReportRaw } from '../../lib/queries/report'
import { useCreateShare } from '../../lib/queries/shares'
import { useSaveSettingsPatch, useUserSettings } from '../../lib/queries/userSettings'
import { formatMoney, formatRate, type RateCurrency } from '../../lib/rate'
import { dayMonth, f1, fh, formatStamp, hm, periodLabel } from '../../lib/report'
import { taskHours } from '../../lib/reportViews'
import { describeError, useToast } from '../../lib/Toast'
import type { Group, GroupItem, Status, Task } from '../../lib/types'
import { activeWorkspaceId } from '../../lib/workspace'

/*
 * Отчёт для клиента (0.66): задачи — часы — ставка — сумма по одному клиенту за период.
 * На экране — тот же документ, что уйдёт в PDF, Excel и по ссылке: один снимок на все три.
 * Реквизиты сторон и логотип — тариф «Про» (ключ лимита logo).
 */

interface Options {
  overtime: boolean
  notes: boolean
  journal: boolean
  subs: boolean
}
const OPTIONS_KEY = 'semternity.clientReportOptions'
const DEFAULTS: Options = { overtime: false, notes: false, journal: true, subs: false }

function loadOptions(): Options {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}') as Partial<Options>) }
  } catch {
    return DEFAULTS
  }
}
function remember(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // не запомнили — выбор сбросится при следующем открытии
  }
}
function recall(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

const h2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',')

export function ClientReport({
  raw,
  tasks,
  groups,
  items,
  statuses,
  model,
  limits,
  initialClient,
}: {
  raw: ReportRaw
  tasks: Task[]
  groups: Group[]
  items: GroupItem[]
  statuses: Status[]
  model: GroupModel
  /** лимиты тарифа; undefined — ещё грузятся (тогда ничего не прячем, обойти не даст база) */
  limits: Limits | undefined
  /** ?client=<id> из карточки клиента */
  initialClient?: string | null
}) {
  const clientKey = `semternity.reportClient.${activeWorkspaceId()}`
  const [itemId, setItemId] = useState<string | null>(() => initialClient ?? recall(clientKey))
  const [options, setOptions] = useState(loadOptions)
  const [number, setNumber] = useState(() => recall('semternity.reportNumber') ?? '')
  const [editing, setEditing] = useState<'owner' | 'client' | null>(null)
  const [busy, setBusy] = useState<'pdf' | 'excel' | 'link' | null>(null)
  const [fresh, setFresh] = useState<string | null>(null)
  const profile = useProfile()
  const { data: settings } = useUserSettings()
  const saveSettings = useSaveSettingsPatch()
  const updateItem = useUpdateGroupItem()
  const createShare = useCreateShare()
  const { showError, showSuccess } = useToast()

  const canReq = !limits || limits.logo
  const canExport = !limits || limits.export
  const canShare = !limits || limits.billing
  const item = itemId ? model.itemById.get(itemId) : undefined

  function setOption(key: keyof Options, value: boolean) {
    const next = { ...options, [key]: value }
    setOptions(next)
    remember(OPTIONS_KEY, JSON.stringify(next))
  }

  // клиенты со ставкой — первыми: отчёт почти всегда про них
  const clients = useMemo(() => {
    const all = model.groups.flatMap((g) => model.itemsOf(g.id).filter((i) => !i.archived).map((i) => ({ item: i, group: g })))
    const rated = (i: GroupItem) => (i.hourly_rate != null && Number(i.hourly_rate) > 0 ? 0 : 1)
    return [...all]
      .sort((a, b) => rated(a.item) - rated(b.item))
      .map(({ item: i, group }) => ({
        id: i.id,
        name: rated(i) === 0 ? `${i.name} · ${formatRate(Number(i.hourly_rate), (i.rate_currency ?? 'BYN') as RateCurrency)}` : `${i.name} · ${group.name.toLowerCase()}`,
      }))
  }, [model])

  const snap: ClientSnapshot | null = useMemo(() => {
    if (!item) return null
    const report = reportFromRaw(raw, {
      tasks,
      groups,
      items,
      statuses,
      options: { includeChecks: false, includeComments: options.notes, includeOvertime: options.overtime },
    })
    const logo = canReq ? (settings?.report_logo ?? null) : null
    const cur = raw.entries.filter((e) => e.effective_date >= raw.from && e.effective_date <= raw.to)
    const hours = options.subs ? new Map(taskHours(cur, tasks, statuses).map((x) => [x.id, x.children])) : null
    return buildClientSnapshot({
      report: { ...report, logo },
      tasks,
      itemId: item.id,
      client: item.name,
      owner: profile.name,
      color: item.color ?? null,
      withNotes: options.notes,
      withJournal: options.journal,
      number,
      requisites: canReq ? { owner: settings?.report_requisites, client: item.requisites } : undefined,
      subsOf: hours ? (id) => (hours.get(id) ?? []).map((c) => ({ name: c.name, hours: c.hours })) : undefined,
    })
  }, [item, raw, tasks, groups, items, statuses, options, settings, profile.name, number, canReq])

  async function run(kind: 'pdf' | 'excel' | 'link') {
    if (!snap || !item) return
    setBusy(kind)
    try {
      const file = `Отчёт_${snap.client}_${snap.from}_${snap.to}`.replace(/[\\/:*?"<>|]+/g, '_')
      if (kind === 'pdf') {
        const { renderClientPdf } = await import('../../lib/exportPdf')
        renderClientPdf(snap).save(`${file}.pdf`)
      } else if (kind === 'excel') {
        const { exportClientExcel } = await import('../../lib/exportExcel')
        await exportClientExcel(snap, `${file}.xlsx`)
      } else {
        const token = newShareToken()
        await createShare.mutateAsync({ token, itemId: item.id, title: `${item.name} · ${snap.label}`, snapshot: snap })
        const url = shareUrl(token)
        setFresh(url)
        let copied = false
        try {
          await navigator.clipboard.writeText(url)
          copied = true
        } catch {
          // буфер недоступен — ссылка останется в поле ниже
        }
        showSuccess(copied ? 'Ссылка скопирована' : 'Ссылка готова')
      }
    } catch (e) {
      showError(describeError(e))
    } finally {
      setBusy(null)
    }
  }

  const toggles: { key: keyof Options; title: string; hint: string }[] = [
    { key: 'subs', title: 'Подзадачи', hint: 'часы по подзадачам под каждой задачей' },
    { key: 'journal', title: 'Что сделано', hint: 'работа по дням после таблицы' },
    { key: 'notes', title: 'Комментарии к учёту', hint: 'пишутся для себя — включайте осознанно' },
    { key: 'overtime', title: 'Переработку — в сумму', hint: 'часы сверх плана тоже к оплате' },
  ]

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-6">
      {/* настройки документа */}
      <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
        <PickerField
          label="Клиент"
          items={clients}
          value={itemId}
          onChange={(id) => {
            setItemId(id)
            setFresh(null)
            remember(clientKey, id)
          }}
          placeholder="Клиент"
          emptyLabel="Выберите клиента"
        />
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-secondary">Номер отчёта</span>
          <input
            className={fieldClass}
            value={number}
            maxLength={40}
            placeholder="например 11/2026"
            onChange={(e) => {
              setNumber(e.target.value)
              remember('semternity.reportNumber', e.target.value || null)
            }}
          />
        </label>
        <div className="flex flex-col">
          <span className="pb-1 text-sm font-medium text-text-secondary">Что показать</span>
          {toggles.map((t) => (
            <label key={t.key} className="flex min-h-11 cursor-pointer items-center gap-2.5 py-1">
              <input
                type="checkbox"
                checked={options[t.key]}
                onChange={(e) => setOption(t.key, e.target.checked)}
                className="h-4.5 w-4.5 shrink-0 accent-accent"
              />
              <span className="flex min-w-0 flex-col">
                <span className="text-base text-text">{t.title}</span>
                <span className="text-xs leading-[1.4] text-text-secondary">{t.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {!canReq && <UpgradeNote need="pro" what="Реквизиты и свой логотип в отчёте" />}
        {snap && snap.sprints.length > 0 && (
          <div className="flex flex-col gap-2">
            {canExport ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" loading={busy === 'pdf'} disabled={!!busy} onClick={() => run('pdf')}>
                  <Download size={15} />
                  PDF
                </Button>
                <Button loading={busy === 'excel'} disabled={!!busy} onClick={() => run('excel')}>
                  <Download size={15} />
                  Excel
                </Button>
              </div>
            ) : (
              <UpgradeNote need="plus" what="Выгрузка в PDF и Excel" />
            )}
            {canShare && (
              <Button loading={busy === 'link'} disabled={!!busy} onClick={() => run('link')}>
                Ссылка для клиента
              </Button>
            )}
            {fresh && (
              <input
                readOnly
                value={fresh}
                onFocus={(e) => e.currentTarget.select()}
                className={`${fieldClass} font-mono`}
                aria-label="Ссылка на отчёт"
              />
            )}
            {canShare && (
              <p className="text-xs leading-[1.45] text-text-secondary">
                По ссылке клиент откроет этот же отчёт без входа. Это снимок: новые часы попадут только в новую ссылку.{' '}
                <Link to="/settings/export" className="font-medium text-accent-text">
                  Все ссылки
                </Link>
              </p>
            )}
          </div>
        )}
      </aside>

      {/* сам документ */}
      {!item ? (
        <EmptyState title="Выберите клиента">
          Отчёт соберётся по его задачам за выбранный период: часы, ставка и сумма к оплате.
        </EmptyState>
      ) : !snap || snap.sprints.length === 0 ? (
        <EmptyState title="Нечего показать">
          У «{item.name}» нет задач с часами или сроком в этом периоде. Выберите другой период.
        </EmptyState>
      ) : (
        <ClientDocument
          snap={snap}
          itemId={item.id}
          canReq={canReq}
          onEdit={setEditing}
          statuses={statuses}
        />
      )}

      <RequisitesSheet
        key={`${editing}${itemId}`}
        open={editing !== null}
        title={editing === 'owner' ? 'Мои реквизиты' : `Реквизиты: ${item?.name ?? ''}`}
        hint={
          editing === 'owner'
            ? 'Одни на все отчёты: название или ФИО, УНП/ИНН, расчётный счёт, банк, адрес, контакты.'
            : 'Попадут в отчёты этому клиенту: название, УНП/ИНН, адрес, договор.'
        }
        initial={(editing === 'owner' ? settings?.report_requisites : item?.requisites) ?? ''}
        onClose={() => setEditing(null)}
        onSave={(text) => {
          const value = text.trim() || null
          const done = { onError: (e: unknown) => showError(describeError(e)), onSuccess: () => showSuccess('Реквизиты сохранены') }
          if (editing === 'owner') saveSettings.mutate({ report_requisites: value }, done)
          else if (item) updateItem.mutate({ id: item.id, fields: { requisites: value } }, done)
          setEditing(null)
        }}
      />
    </div>
  )
}

function RequisitesSheet({
  open,
  title,
  hint,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  hint: string
  initial: string
  onClose: () => void
  onSave: (text: string) => void
}) {
  const [text, setText] = useState(initial)
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p className="text-sm leading-[1.5] text-text-secondary">{hint}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={2000}
        rows={8}
        placeholder={'ООО «Ромашка»\nУНП 190000000\nр/с BY00 XXXX 0000 0000 0000 0000 0000\nг. Минск, ул. …'}
        className="min-h-40 w-full rounded-sm border border-border bg-surface px-2.5 py-2 text-[length:var(--input-size)] leading-[1.5] text-text placeholder:text-text-tertiary focus:border-accent focus:outline-none"
      />
      <SheetActions onCancel={onClose} onConfirm={() => onSave(text)} confirmLabel="Сохранить" />
    </Sheet>
  )
}

/** Документ на экране — как лист: шапка, стороны, таблица, итог, «что сделано». */
function ClientDocument({
  snap: s,
  itemId,
  canReq,
  onEdit,
  statuses,
}: {
  snap: ClientSnapshot
  itemId: string
  canReq: boolean
  onEdit: (who: 'owner' | 'client') => void
  statuses: Status[]
}) {
  const color = seriesColor(s.color)
  const noRate = s.sprints.some((x) => !x.bill)
  const party = (who: 'owner' | 'client', role: string, name: string, text: string | null | undefined) => (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-text-tertiary">{role}</span>
        {canReq && (
          <button
            type="button"
            onClick={() => onEdit(who)}
            className="inline-flex items-center gap-1 rounded-xs text-xs font-medium text-accent-text hover:underline"
          >
            <Pencil size={12} />
            {text ? 'Изменить' : 'Добавить реквизиты'}
          </button>
        )}
      </span>
      <span className="text-base font-semibold text-text">{name}</span>
      {text && <span className="text-sm leading-[1.5] whitespace-pre-line text-text-secondary">{text}</span>}
    </div>
  )
  const stageOf = (label: string) => statuses.find((x) => x.label === label)

  return (
    <article className="flex min-w-0 flex-col gap-6 rounded-md border border-border bg-surface p-4 shadow-sm lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-[-0.01em] text-text">
            Отчёт о работе{s.number ? ` № ${s.number}` : ''}
          </h2>
          <span className="text-base text-text-secondary">{periodLabel(s.from, s.to)}</span>
          <span className="text-xs text-text-tertiary">сформирован {formatStamp(new Date(s.generatedAt))}</span>
        </div>
        {s.logo && (
          <span className="logo-plate rounded-sm p-1.5">
            <img src={s.logo} alt="" style={{ maxHeight: 48, maxWidth: 180 }} />
          </span>
        )}
      </header>

      <div className="grid gap-5 border-y border-divider py-4 sm:grid-cols-2">
        {party('owner', 'Исполнитель', s.owner || 'Исполнитель', s.requisites?.owner)}
        {party('client', 'Заказчик', s.client, s.requisites?.client)}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col">
          <span className="text-sm text-text-secondary">Часы за период</span>
          <span className="tabular font-mono text-xl font-medium text-text">{f1(s.hours)} ч</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm text-text-secondary">Задач</span>
          <span className="tabular font-mono text-xl font-medium text-text">
            {s.inWorkCount}
            {s.closedCount > 0 && <span className="text-sm text-text-secondary"> · закрыто {s.closedCount}</span>}
          </span>
        </div>
        {s.billing.length > 0 && (
          <div className="col-span-2 flex flex-col rounded-sm bg-accent-soft px-3 py-2 sm:col-span-1">
            <span className="text-sm text-accent-text">К оплате</span>
            <span className="tabular font-mono text-xl font-semibold text-text">
              {s.billing.map((b) => formatMoney(b.due, b.currency)).join(' · ')}
            </span>
          </div>
        )}
      </div>

      {/* задачи — часы — ставка — сумма */}
      <div className="flex flex-col">
        <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_6rem] gap-x-3 border-b border-border-strong pb-2 text-sm font-medium text-text-secondary sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_7.5rem]">
          <span>Задача</span>
          <span className="text-right">Часы</span>
          <span className="hidden text-right sm:block">Ставка</span>
          <span className="text-right">Сумма</span>
        </div>
        {s.sprints.map((sp) => {
          const b = sp.bill
          const amount = b ? b.amount + (s.includeOvertime ? b.overAmount : 0) : null
          const hours = b ? b.hours + (s.includeOvertime ? b.overHours : 0) : sp.factPeriod
          const st = stageOf(sp.status)
          return (
            <div key={sp.id} className="flex flex-col gap-1 border-b border-divider py-2.5">
              <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_6rem] items-baseline gap-x-3 sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_7.5rem]">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                  <span className="truncate text-base text-text">{sp.name}</span>
                  <span className="hidden md:inline-flex">
                    <StageChip tone={sp.isFinal ? 'done' : (sp.stageTone ?? null)} label={sp.isFinal ? 'Готово' : (st?.label ?? sp.status)} />
                  </span>
                </span>
                <span className="tabular text-right font-mono text-base text-text">{h2(hours)}</span>
                <span className="tabular hidden text-right font-mono text-sm text-text-secondary sm:block">
                  {b ? formatMoney(b.rate, b.currency) : '—'}
                </span>
                <span className="tabular text-right font-mono text-base font-medium text-text">
                  {amount !== null && b ? formatMoney(amount, b.currency) : '—'}
                </span>
              </div>
              {sp.plan > 0 && (
                <span className="pl-4 text-xs text-text-secondary">
                  план {fh(sp.plan)} ч · факт {f1(sp.factTotal)} ч
                  {sp.endDate ? ` · ${sp.overdue ? 'срок был' : 'до'} ${dayMonth(sp.endDate)}` : ''}
                  {b && b.overHours > 0.004 && (
                    <span className="text-danger-text">
                      {' '}
                      · сверх плана {h2(b.overHours)} ч{s.includeOvertime ? ' — в сумме' : ' — не в сумме'}
                    </span>
                  )}
                </span>
              )}
              {(s.subs?.[sp.id] ?? []).map((sub) => (
                <div key={sub.name} className="grid grid-cols-[minmax(0,1fr)_4.5rem_6rem] gap-x-3 pl-4 text-sm text-text-secondary sm:grid-cols-[minmax(0,1fr)_5rem_6.5rem_7.5rem]">
                  <span className="truncate">{sub.name}</span>
                  <span className="tabular text-right font-mono">{h2(sub.hours)}</span>
                </div>
              ))}
            </div>
          )
        })}
        {s.billing.map((b) => (
          <div key={b.currency} className="flex items-baseline justify-between gap-3 pt-3">
            <span className="text-base font-semibold text-text">
              Итого к оплате{s.billing.length > 1 ? `, ${b.currency}` : ''}
              <span className="font-normal text-text-secondary"> · {h2(b.hours + (s.includeOvertime ? b.overHours : 0))} ч</span>
            </span>
            <span className="tabular font-mono text-lg font-semibold text-text">{formatMoney(b.due, b.currency)}</span>
          </div>
        ))}
        {noRate && (
          <p className="pt-3 text-sm text-text-secondary">
            У части задач нет ставки — суммы для них нет.{' '}
            <Link to={`/items/${itemId}`} className="font-medium text-accent-text">
              Задать ставку клиенту
            </Link>
          </p>
        )}
        {s.billing.length > 0 && (
          <p className="pt-2 text-xs text-text-tertiary">
            С планом к оплате — часы задачи в пределах плана × ставка, без плана — часы за период.
          </p>
        )}
      </div>

      {(s.journal ?? []).length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-md font-semibold text-text">Что сделано</h3>
          {(s.journal ?? []).map((day) => (
            <div key={day.date} className="flex flex-col">
              <div className="flex items-baseline justify-between gap-3 border-b border-divider pb-1">
                <span className="text-sm font-semibold text-text first-letter:uppercase">{day.label}</span>
                <span className="tabular font-mono text-sm text-text">{hm(day.total)}</span>
              </div>
              {day.rows.map((row) => (
                <div key={row.title} className="flex flex-col py-1.5 pl-3">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm text-text">{row.title}</span>
                    <span className="tabular shrink-0 font-mono text-sm text-text-secondary">{hm(row.hours)}</span>
                  </span>
                  {row.notes.length > 0 && <span className="text-sm leading-[1.45] text-text-secondary">{row.notes.join(' · ')}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}
