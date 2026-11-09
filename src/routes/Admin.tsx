import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Button, Chip, EmptyState, FieldLabel, Overline, Segmented, Sheet, SheetActions, Switch, Tag, fieldClass } from '../components/ui'
import { DatePicker } from '../components/DatePicker'
import { Download, Search } from '../components/Icon'
import { describeError, useToast } from '../lib/Toast'
import { PLAN_NAME, PLAN_RANK, type PaidPlan } from '../lib/plans'
import { toDateString, todayStr } from '../lib/period'
import {
  ACTIVITY_LABEL,
  NO_FILTERS,
  PLAN_FILTER_LABEL,
  SORT_LABEL,
  activeFilterCount,
  filterUsers,
  sortUsers,
  usersCsv,
  type ActivityFilter,
  type PlanFilter,
  type UserFilters,
  type UserSort,
} from '../lib/adminUsers'
import {
  KIND_LABEL,
  STATUS_LABEL,
  useAdminAccount,
  useAdminLog,
  useAdminResetTrial,
  useAdminSetPlan,
  useAdminStats,
  useAdminSystem,
  useAdminUsers,
  useAllFeedback,
  useIsAdmin,
  useScreenshotUrls,
  useUpdateFeedback,
  type AdminLogAction,
  type AdminLogEntry,
  type AdminUser,
  type Feedback,
  type FeedbackStatus,
} from '../lib/queries/feedback'
import { STATUS_TONE, Stars } from './Feedback'
import { SettingsPage } from './Settings'

/*
 * Админка (0.41): обращения, пользователи, статистика, состояние системы. Видна только
 * админу; данные всех пользователей приходят из функций admin_*, которые проверяют роль
 * в базе, — эта страница сама по себе ничего не открывает.
 *
 * 0.66: карточка человека, фильтры и CSV на вкладке «Люди»; удаление, блокировка и сброс
 * пароля — серверная функция account (право проверяет admin_target в базе); журнал
 * действий — в карточке и на вкладке «Система».
 */

type Tab = 'feedback' | 'users' | 'stats' | 'system'

const TABS: { value: Tab; label: string }[] = [
  { value: 'feedback', label: 'Обращения' },
  { value: 'users', label: 'Люди' },
  { value: 'stats', label: 'Цифры' },
  { value: 'system', label: 'Система' },
]

function ago(iso: string | null): string {
  if (!iso) return 'никогда'
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 2) return 'только что'
  if (min < 60) return `${min} мин назад`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.round(h / 24)
  if (d < 45) return `${d} дн назад`
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function dateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).replace('.', '')
}

function planLabel(u: Pick<AdminUser, 'plan' | 'effective' | 'trial'>): string {
  if (u.plan === 'lifetime') return 'Пожизненный'
  const name = PLAN_NAME[u.effective as PaidPlan] ?? u.effective
  return u.trial ? `${name}, пробный` : name
}

export function AdminPage() {
  const { data: isAdmin, isLoading } = useIsAdmin()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'feedback') as Tab

  if (isLoading) return null
  if (!isAdmin) return <Navigate to="/settings" replace />
  return (
    <SettingsPage title="Админка">
      <Segmented<Tab> stretch value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} options={TABS} />
      <div className="mt-3 flex flex-col gap-3">
        {tab === 'feedback' && <FeedbackTab focusId={params.get('f')} />}
        {tab === 'users' && <UsersTab onOpenFeedback={(id) => setParams({ tab: 'feedback', f: id }, { replace: true })} />}
        {tab === 'stats' && <StatsTab />}
        {tab === 'system' && <SystemTab />}
      </div>
    </SettingsPage>
  )
}

/* ── обращения ───────────────────────────────────────────────────────── */

type FeedbackFilter = 'open' | 'done' | 'all'

/** короткие подписи статусов для переключателя: длинные переносились на три строки */
const ADMIN_STATUS: Record<FeedbackStatus, string> = {
  new: 'Новое',
  in_progress: 'В работе',
  done: 'Сделано',
  declined: 'Отклонено',
}

function FeedbackTab({ focusId }: { focusId: string | null }) {
  const { data = [], isLoading } = useAllFeedback(true)
  const { data: users = [] } = useAdminUsers(true)
  // пришли из карточки человека — обращение может быть закрытым, показываем все
  const [filter, setFilter] = useState<FeedbackFilter>(focusId ? 'all' : 'open')
  const byId = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])

  // сначала новые, внутри — по тарифу (Про первыми: поддержка по тарифу), затем свежие
  const list = useMemo(() => {
    const statusRank: Record<FeedbackStatus, number> = { new: 0, in_progress: 1, done: 2, declined: 3 }
    const rank = (f: Feedback) => PLAN_RANK[(f.plan ?? 'free') as PaidPlan] ?? 0
    return data
      .filter((f) => (filter === 'all' ? true : filter === 'open' ? f.status === 'new' || f.status === 'in_progress' : f.status === 'done' || f.status === 'declined'))
      .sort((a, b) => statusRank[a.status] - statusRank[b.status] || rank(b) - rank(a) || b.created_at.localeCompare(a.created_at))
  }, [data, filter])

  const open = data.filter((f) => f.status === 'new' || f.status === 'in_progress').length
  if (isLoading) return null
  return (
    <>
      <Segmented<FeedbackFilter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: `Открытые · ${open}` },
          { value: 'done', label: 'Закрытые' },
          { value: 'all', label: 'Все' },
        ]}
      />
      {list.length === 0 ? (
        <EmptyState title="Пусто">{filter === 'open' ? 'Новых обращений нет.' : 'Здесь ничего нет.'}</EmptyState>
      ) : (
        list.map((f) => <AdminFeedbackCard key={f.id} f={f} user={byId.get(f.user_id)} highlight={f.id === focusId} />)
      )}
    </>
  )
}

function AdminFeedbackCard({ f, user, highlight }: { f: Feedback; user: AdminUser | undefined; highlight: boolean }) {
  const { data: shots = [] } = useScreenshotUrls(f.screenshots)
  const update = useUpdateFeedback()
  const { showError, showSuccess } = useToast()
  const [reply, setReply] = useState(f.reply ?? '')
  const changed = reply.trim() !== (f.reply ?? '')
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    if (highlight) ref.current?.scrollIntoView({ block: 'center' })
  }, [highlight])

  const setStatus = (status: FeedbackStatus) => update.mutate({ id: f.id, status }, { onError: (e) => showError(describeError(e)) })

  return (
    <article
      ref={ref}
      className="flex flex-col gap-2 rounded-md border bg-surface p-3.5"
      style={{ borderColor: highlight ? 'var(--accent)' : 'var(--border)' }}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-text">{KIND_LABEL[f.kind]}</span>
        <span className="text-xs text-text-tertiary">{dateTime(f.created_at)}</span>
        <span className="ml-auto">
          <Tag tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Tag>
        </span>
      </div>
      <span className="text-xs text-text-secondary">
        {[user?.name, user?.email ?? 'пользователь удалён', f.plan ? PLAN_NAME[f.plan as PaidPlan] ?? f.plan : null, f.app_version && `v${f.app_version}`, f.device]
          .filter(Boolean)
          .join(' · ')}
      </span>
      {f.rating && <Stars value={f.rating} size={16} />}
      <p className="text-base leading-[1.5] whitespace-pre-wrap text-text" style={{ overflowWrap: 'anywhere' }}>
        {f.body}
      </p>
      {shots.length > 0 && (
        <div className="flex gap-2">
          {shots.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="h-16 w-16 overflow-hidden rounded-sm border border-border">
              <img src={url} alt={`Скриншот ${i + 1}`} className="h-full w-full object-cover" />
            </a>
          ))}
        </div>
      )}

      <div className="sc -mx-0.5 overflow-x-auto px-0.5 py-0.5">
        <Segmented<FeedbackStatus>
          className="w-max whitespace-nowrap"
          value={f.status}
          onChange={setStatus}
          options={(Object.keys(ADMIN_STATUS) as FeedbackStatus[]).map((s) => ({ value: s, label: ADMIN_STATUS[s] }))}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <FieldLabel>Ответ — придёт пушем и в Telegram</FieldLabel>
        <textarea
          rows={3}
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Спасибо! …"
          className={`${fieldClass} h-auto resize-none py-2.5 leading-[1.5]`}
        />
      </label>
      {f.replied_at && !changed && (
        <span className="text-xs text-text-tertiary">
          Отвечено {dateTime(f.replied_at)} · {f.reply_seen_at ? `прочитано ${dateTime(f.reply_seen_at)}` : 'ещё не прочитано'}
        </span>
      )}
      {changed && (
        <Button
          variant="primary"
          className="self-start"
          disabled={!reply.trim()}
          loading={update.isPending}
          onClick={() =>
            update.mutate(
              { id: f.id, reply: reply.trim(), status: f.status === 'new' ? 'in_progress' : undefined },
              {
                onError: (e) => showError(describeError(e)),
                onSuccess: (r) =>
                  showSuccess(
                    r && (r.push || r.telegram)
                      ? `Ответ отправлен${r.push ? ' · пуш' : ''}${r.telegram ? ' · Telegram' : ''}`
                      : 'Ответ сохранён — увидит в приложении',
                  ),
              },
            )
          }
        >
          {f.reply ? 'Изменить ответ' : 'Ответить'}
        </Button>
      )}
    </article>
  )
}

/* ── люди ────────────────────────────────────────────────────────────── */

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }).replace(' г.', '')
}

function hoursText(n: number): string {
  return String(n).replace('.', ',')
}

function downloadCsv(list: AdminUser[]) {
  const blob = new Blob([usersCsv(list)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `semternity-users-${todayStr()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function UsersTab({ onOpenFeedback }: { onOpenFeedback: (id: string) => void }) {
  const { data = [], isLoading, isError, error } = useAdminUsers(true)
  const [filters, setFilters] = useState<UserFilters>(NO_FILTERS)
  const [sort, setSort] = useState<UserSort>('active')
  const [filterOpen, setFilterOpen] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const list = useMemo(() => sortUsers(filterUsers(data, filters), sort), [data, filters, sort])
  const counts = useMemo(
    () => ({
      newWeek: filterUsers(data, { ...NO_FILTERS, newWeek: true }).length,
      banned: data.filter((u) => u.banned_until).length,
    }),
    [data],
  )
  // карточка берёт свежую строку после каждого обновления списка
  const open = data.find((u) => u.id === openId) ?? null
  const count = activeFilterCount(filters)
  const set = (patch: Partial<UserFilters>) => setFilters((f) => ({ ...f, ...patch }))

  if (isLoading) return null
  if (isError) return <EmptyState title="Не загрузилось">{describeError(error)}</EmptyState>
  return (
    <>
      <label className="flex h-[var(--tap)] items-center gap-2 rounded-sm bg-surface-sunken px-2.5 text-text-secondary">
        <Search size={16} />
        <input
          value={filters.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Почта или имя"
          aria-label="Поиск пользователей"
          className="min-w-0 flex-1 bg-transparent text-[length:var(--input-size)] text-text placeholder:text-text-tertiary"
          style={{ outline: 'none', boxShadow: 'none' }}
        />
      </label>
      <div className="sc -mx-0.5 flex items-center gap-1.5 overflow-x-auto px-0.5 py-0.5">
        <Chip active={count > 0 || sort !== 'active'} onClick={() => setFilterOpen(true)}>
          {count ? `Фильтр · ${count}` : 'Фильтр'}
        </Chip>
        <Chip active={filters.newWeek} onClick={() => set({ newWeek: !filters.newWeek })}>
          Новые за неделю · {counts.newWeek}
        </Chip>
        {counts.banned > 0 && (
          <Chip active={filters.banned} onClick={() => set({ banned: !filters.banned })}>
            Заблокированы · {counts.banned}
          </Chip>
        )}
        <Button variant="ghost" className="ml-auto shrink-0" disabled={list.length === 0} onClick={() => downloadCsv(list)}>
          <Download size={16} /> CSV
        </Button>
      </div>
      <div className="flex min-h-6 items-center gap-2 text-xs text-text-secondary">
        <span>
          {list.length === data.length ? `Всего ${data.length}` : `Показано ${list.length} из ${data.length}`} · {SORT_LABEL[sort].toLowerCase()}
        </span>
        {(count > 0 || filters.query) && (
          <button type="button" className="text-accent-text" onClick={() => setFilters(NO_FILTERS)}>
            Сбросить
          </button>
        )}
      </div>
      {list.length === 0 ? (
        <EmptyState title="Никого">Под эти условия никто не подходит.</EmptyState>
      ) : (
        list.map((u) => <UserRow key={u.id} u={u} onOpen={() => setOpenId(u.id)} />)
      )}
      <UserFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filters={filters}
        onChange={set}
        sort={sort}
        onSort={setSort}
        onReset={() => {
          setFilters((f) => ({ ...NO_FILTERS, query: f.query }))
          setSort('active')
        }}
      />
      <UserSheet user={open} onClose={() => setOpenId(null)} onOpenFeedback={onOpenFeedback} />
    </>
  )
}

function UserRow({ u, onOpen }: { u: AdminUser; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full flex-col gap-1.5 rounded-md border border-border bg-surface p-3.5 text-left hover:border-border-strong active:bg-surface-sunken"
    >
      <div className="flex w-full items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-base font-medium text-text">{u.name || u.email}</span>
          {u.name && <span className="truncate text-sm text-text-secondary">{u.email}</span>}
        </div>
        {u.banned_until && <Tag tone="danger">Заблокирован</Tag>}
        {u.is_admin && <Tag>Админ</Tag>}
        <Tag tone={u.effective === 'free' ? 'neutral' : 'accent'}>{planLabel(u)}</Tag>
      </div>
      <span className="text-sm text-text-secondary">
        Был {ago(u.last_active)} · с {new Date(u.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' })}
        {u.last_seen_version ? ` · v${u.last_seen_version}` : ''}
      </span>
      <span className="tabular font-mono text-xs text-text-secondary">
        {u.workspaces} простр · {u.tasks} задач · {hoursText(u.hours)} ч · обращений {u.feedback}
      </span>
    </button>
  )
}

function ChoiceChips<T extends string>({ value, labels, onChange }: { value: T; labels: Record<T, string>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(labels) as T[]).map((k) => (
        <Chip key={k} active={value === k} onClick={() => onChange(k)}>
          {labels[k]}
        </Chip>
      ))}
    </div>
  )
}

function UserFilterSheet({
  open,
  onClose,
  filters,
  onChange,
  sort,
  onSort,
  onReset,
}: {
  open: boolean
  onClose: () => void
  filters: UserFilters
  onChange: (patch: Partial<UserFilters>) => void
  sort: UserSort
  onSort: (s: UserSort) => void
  onReset: () => void
}) {
  return (
    <Sheet anchored open={open} onClose={onClose} title="Фильтр и порядок">
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Тариф</FieldLabel>
        <ChoiceChips<PlanFilter> value={filters.plan} labels={PLAN_FILTER_LABEL} onChange={(plan) => onChange({ plan })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Последняя активность · «Пропали» — больше месяца назад</FieldLabel>
        <ChoiceChips<ActivityFilter> value={filters.activity} labels={ACTIVITY_LABEL} onChange={(activity) => onChange({ activity })} />
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel>Порядок</FieldLabel>
        <ChoiceChips<UserSort> value={sort} labels={SORT_LABEL} onChange={onSort} />
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" onClick={onReset}>
          Сбросить
        </Button>
        <Button variant="primary" className="flex-1" onClick={onClose}>
          Готово
        </Button>
      </div>
    </Sheet>
  )
}

type UserMode = 'card' | 'plan' | 'ban' | 'delete'

function UserSheet({
  user,
  onClose,
  onOpenFeedback,
}: {
  user: AdminUser | null
  onClose: () => void
  onOpenFeedback: (id: string) => void
}) {
  const [mode, setMode] = useState<UserMode>('card')
  const [forUser, setForUser] = useState<string | null>(null)
  // другой человек — снова с карточки
  if ((user?.id ?? null) !== forUser) {
    setForUser(user?.id ?? null)
    setMode('card')
  }
  const who = user ? user.name || user.email : ''
  const title =
    mode === 'plan'
      ? `Тариф: ${who}`
      : mode === 'delete'
        ? 'Удалить аккаунт'
        : mode === 'ban'
          ? user?.banned_until
            ? 'Разблокировать вход'
            : 'Заблокировать вход'
          : who || 'Пользователь'

  return (
    <Sheet open={!!user} onClose={onClose} title={title}>
      {user && mode === 'card' && <UserCard user={user} onMode={setMode} onOpenFeedback={onOpenFeedback} />}
      {user && mode === 'plan' && <PlanForm user={user} onDone={() => setMode('card')} />}
      {user && mode === 'ban' && <BanForm user={user} onDone={() => setMode('card')} />}
      {user && mode === 'delete' && <DeleteUserForm user={user} onCancel={() => setMode('card')} onDeleted={onClose} />}
    </Sheet>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <span className="shrink-0 text-sm text-text-secondary">{label}</span>
      <span className="min-w-0 text-right text-sm text-text" style={{ overflowWrap: 'anywhere' }}>
        {children}
      </span>
    </div>
  )
}

function UserCard({
  user,
  onMode,
  onOpenFeedback,
}: {
  user: AdminUser
  onMode: (m: UserMode) => void
  onOpenFeedback: (id: string) => void
}) {
  const account = useAdminAccount()
  const { showError, showSuccess } = useToast()
  const timed = user.paid_until && user.plan !== 'lifetime' && user.plan !== 'free'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col divide-y divide-divider">
        <InfoRow label="Почта">{user.email}</InfoRow>
        {user.name && <InfoRow label="Имя">{user.name}</InfoRow>}
        <InfoRow label="Регистрация">{longDate(user.created_at)}</InfoRow>
        <InfoRow label="Последний вход">{user.last_sign_in ? `${ago(user.last_sign_in)} · ${dateTime(user.last_sign_in)}` : 'не входил'}</InfoRow>
        <InfoRow label="Активность">{user.last_active ? `${ago(user.last_active)} · ${dateTime(user.last_active)}` : 'никогда'}</InfoRow>
        {(user.last_seen_version || user.last_seen_device) && (
          <InfoRow label="Приложение">{[user.last_seen_version && `v${user.last_seen_version}`, user.last_seen_device].filter(Boolean).join(' · ')}</InfoRow>
        )}
        <div className="flex items-center justify-between gap-3 py-1">
          <span className="text-sm text-text-secondary">Тариф</span>
          <span className="ml-auto text-sm text-text">
            {planLabel(user)}
            {timed && ` · до ${longDate(user.paid_until!)}`}
          </span>
          <Button variant="ghost" className="-mr-3" onClick={() => onMode('plan')}>
            Изменить
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Пространств" value={user.workspaces} />
        <Tile label="Задач" value={user.tasks} />
        <Tile label="Часов учёта" value={hoursText(user.hours)} hint={`за 30 дней ${hoursText(user.hours_30d)}`} />
        <Tile label="Обращений" value={user.feedback} />
      </div>
      {(user.telegram || user.google || user.push || user.banned_until) && (
        <div className="flex flex-wrap gap-1.5">
          {user.banned_until && <Tag tone="danger">Вход заблокирован</Tag>}
          {user.telegram && <Tag>Telegram</Tag>}
          {user.google && <Tag>Google</Tag>}
          {user.push && <Tag>Пуши</Tag>}
        </div>
      )}

      {user.feedback > 0 && <UserFeedback userId={user.id} onOpen={onOpenFeedback} />}
      <UserLog userId={user.id} />

      <section className="flex flex-col gap-2">
        <Overline>Действия</Overline>
        {user.is_admin ? (
          <span className="text-sm text-text-secondary">Это админ — удалять, блокировать и сбрасывать пароль нельзя.</span>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                loading={account.isPending && account.variables?.action === 'admin_reset_password'}
                onClick={() =>
                  account.mutate(
                    { action: 'admin_reset_password', user: user.id },
                    {
                      onError: (e) => showError(describeError(e)),
                      onSuccess: () => showSuccess(`Письмо для смены пароля ушло на ${user.email}`),
                    },
                  )
                }
              >
                Сбросить пароль
              </Button>
              <Button onClick={() => onMode('ban')}>{user.banned_until ? 'Разблокировать вход' : 'Заблокировать вход'}</Button>
            </div>
            <Button variant="danger" className="self-start" onClick={() => onMode('delete')}>
              Удалить аккаунт
            </Button>
          </>
        )}
      </section>
    </div>
  )
}

function UserFeedback({ userId, onOpen }: { userId: string; onOpen: (id: string) => void }) {
  const { data = [] } = useAllFeedback(true)
  const list = data.filter((f) => f.user_id === userId)
  if (list.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5">
      <Overline>Обращения · {list.length}</Overline>
      <div className="flex flex-col divide-y divide-divider rounded-md border border-border bg-surface">
        {list.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onOpen(f.id)}
            className="flex flex-col gap-0.5 px-3.5 py-2.5 text-left hover:bg-surface-hover"
          >
            <span className="flex items-center gap-2">
              <span className="text-sm font-medium text-text">{KIND_LABEL[f.kind]}</span>
              <span className="text-xs text-text-tertiary">{dateTime(f.created_at)}</span>
              <span className="ml-auto">
                <Tag tone={STATUS_TONE[f.status]}>{ADMIN_STATUS[f.status]}</Tag>
              </span>
            </span>
            <span className="line-clamp-2 text-sm text-text-secondary">{f.body}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

const LOG_LABEL: Record<AdminLogAction, string> = {
  delete: 'Аккаунт удалён',
  ban: 'Вход заблокирован',
  unban: 'Вход разблокирован',
  reset_password: 'Письмо для смены пароля',
  set_plan: 'Тариф',
  reset_trial: 'Пробный период снова доступен',
}

function logText(e: AdminLogEntry): string {
  if (e.action === 'set_plan') {
    const name = PLAN_NAME[e.details.plan as PaidPlan] ?? e.details.plan
    return `Тариф: ${name}${e.details.trial ? ', пробный' : ''}${e.details.until ? ` до ${longDate(e.details.until)}` : e.details.plan === 'free' ? '' : ', бессрочно'}`
  }
  if (e.action === 'delete' && e.details.files) return `${LOG_LABEL.delete} · файлов ${e.details.files}`
  return LOG_LABEL[e.action] ?? e.action
}

function LogList({ entries, withTarget }: { entries: AdminLogEntry[]; withTarget: boolean }) {
  return (
    <div className="flex flex-col divide-y divide-divider rounded-md border border-border bg-surface px-3.5">
      {entries.map((e) => (
        <div key={e.id} className="flex flex-col gap-0.5 py-2.5">
          <span className="text-sm text-text">{logText(e)}</span>
          <span className="text-xs text-text-secondary" style={{ overflowWrap: 'anywhere' }}>
            {[dateTime(e.created_at), withTarget && (e.target_email ?? 'удалён'), e.admin_email && `кто: ${e.admin_email}`].filter(Boolean).join(' · ')}
          </span>
        </div>
      ))}
    </div>
  )
}

function UserLog({ userId }: { userId: string }) {
  const { data = [] } = useAdminLog(userId)
  if (data.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5">
      <Overline>Журнал</Overline>
      <LogList entries={data} withTarget={false} />
    </section>
  )
}

type GivePlan = 'free' | 'plus' | 'pro' | 'lifetime'

function addDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return toDateString(d)
}

function PlanForm({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const setPlan = useAdminSetPlan()
  const resetTrial = useAdminResetTrial()
  const { showError, showSuccess } = useToast()
  // считаем один раз при открытии: «сейчас» во время отрисовки не берём
  const [paidActive] = useState(() => !!user.paid_until && new Date(user.paid_until).getTime() > Date.now())
  const [plan, setPlanValue] = useState<GivePlan>((user.plan === 'studio' ? 'pro' : user.plan) as GivePlan)
  const [forever, setForever] = useState(user.effective !== 'free' && user.plan !== 'lifetime' && !user.paid_until)
  const [until, setUntil] = useState<string | null>(paidActive ? toDateString(new Date(user.paid_until!)) : addDays(30))
  const [trial, setTrial] = useState(false)
  const timed = plan === 'plus' || plan === 'pro'
  const dated = timed && (!forever || trial)
  const badDate = dated && (!until || until <= todayStr())

  return (
    <>
      <Segmented<GivePlan>
        stretch
        value={plan}
        onChange={setPlanValue}
        options={[
          { value: 'free', label: 'Старт' },
          { value: 'plus', label: 'Плюс' },
          { value: 'pro', label: 'Про' },
          { value: 'lifetime', label: 'Навсегда' },
        ]}
      />
      {timed && (
        <>
          <Switch on={trial} onChange={setTrial} label="Пробный период — до даты" />
          {!trial && (
            <Segmented<'until' | 'forever'>
              stretch
              value={forever ? 'forever' : 'until'}
              onChange={(v) => setForever(v === 'forever')}
              options={[
                { value: 'until', label: 'До даты' },
                { value: 'forever', label: 'Бессрочно' },
              ]}
            />
          )}
          {dated && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Действует по</FieldLabel>
              <DatePicker value={until} onChange={setUntil} ariaLabel="Дата окончания тарифа" />
              <div className="flex flex-wrap gap-1.5">
                {[7, 30, 90, 365].map((d) => (
                  <Chip key={d} active={until === addDays(d)} onClick={() => setUntil(addDays(d))}>
                    {d === 365 ? 'Год' : `${d} дней`}
                  </Chip>
                ))}
              </div>
              {badDate && <span className="text-xs text-danger-text">Дата окончания должна быть позже сегодняшней.</span>}
            </div>
          )}
        </>
      )}
      <span className="text-xs text-text-tertiary">
        Сейчас: {planLabel(user)}
        {paidActive && user.plan !== 'lifetime' ? ` до ${longDate(user.paid_until!)}` : ''}
      </span>
      {user.trial_used && (
        <Button
          variant="ghost"
          className="-ml-3 self-start"
          loading={resetTrial.isPending}
          onClick={() =>
            resetTrial.mutate(user.id, {
              onError: (e) => showError(describeError(e)),
              onSuccess: () => showSuccess('Пробный период можно взять снова'),
            })
          }
        >
          Разрешить пробный снова
        </Button>
      )}
      <SheetActions
        onCancel={onDone}
        cancelLabel="Назад"
        confirmLabel={plan === 'free' ? (user.effective === 'free' ? 'Сохранить' : 'Снять тариф') : 'Выдать'}
        confirmDisabled={setPlan.isPending || badDate}
        onConfirm={() =>
          setPlan.mutate(
            {
              user: user.id,
              plan,
              until: dated && until ? new Date(`${until}T23:59:59`).toISOString() : null,
              trial: timed && trial,
            },
            {
              onError: (e) => showError(describeError(e)),
              onSuccess: () => {
                showSuccess(plan === 'free' ? 'Тариф снят' : 'Тариф выдан')
                onDone()
              },
            },
          )
        }
      />
    </>
  )
}

function BanForm({ user, onDone }: { user: AdminUser; onDone: () => void }) {
  const account = useAdminAccount()
  const { showError, showSuccess } = useToast()
  const banned = !!user.banned_until
  return (
    <>
      <p className="text-base leading-[1.5] text-text">
        {banned
          ? `${user.email} снова сможет входить в приложение.`
          : `${user.email} не сможет войти. Уже открытое приложение отключится в течение часа. Данные останутся — блокировку можно снять.`}
      </p>
      <SheetActions
        onCancel={onDone}
        cancelLabel="Назад"
        danger={!banned}
        confirmLabel={banned ? 'Разблокировать' : 'Заблокировать'}
        confirmDisabled={account.isPending}
        onConfirm={() =>
          account.mutate(
            { action: banned ? 'admin_unban' : 'admin_ban', user: user.id },
            {
              onError: (e) => showError(describeError(e)),
              onSuccess: () => {
                showSuccess(banned ? 'Вход разблокирован' : 'Вход заблокирован')
                onDone()
              },
            },
          )
        }
      />
    </>
  )
}

function DeleteUserForm({ user, onCancel, onDeleted }: { user: AdminUser; onCancel: () => void; onDeleted: () => void }) {
  const account = useAdminAccount()
  const { showError, showSuccess } = useToast()
  const [typed, setTyped] = useState('')
  const ready = typed.trim().toLowerCase() === user.email.toLowerCase()
  return (
    <>
      <p className="text-base leading-[1.5] text-text">
        Удалятся все пространства, задачи, учёт времени, файлы и обращения <b className="font-semibold">{user.email}</b>. Вернуть их будет
        нельзя.
      </p>
      <label className="flex flex-col gap-1.5">
        <FieldLabel>Чтобы подтвердить, введите почту</FieldLabel>
        <input
          className={fieldClass}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={user.email}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          inputMode="email"
        />
      </label>
      <SheetActions
        onCancel={onCancel}
        cancelLabel="Назад"
        danger
        confirmLabel={account.isPending ? 'Удаляем…' : 'Удалить навсегда'}
        confirmDisabled={!ready || account.isPending}
        onConfirm={() =>
          account.mutate(
            { action: 'admin_delete', user: user.id, confirm: typed.trim() },
            {
              onError: (e) => showError(describeError(e)),
              onSuccess: () => {
                showSuccess(`Аккаунт ${user.email} удалён`)
                onDeleted()
              },
            },
          )
        }
      />
    </>
  )
}

/* ── цифры ───────────────────────────────────────────────────────────── */

const PLAN_KEY_LABEL: Record<string, string> = {
  free: 'Старт',
  plus: 'Плюс',
  pro: 'Про',
  pro_lifetime: 'Пожизненный',
}

const FEATURE_LABEL: Record<string, string> = {
  push: 'Пуш-уведомления',
  telegram: 'Telegram-бот',
  google: 'Вход в Google',
  calendar: 'Календарь',
  focus: 'Фокус',
  client_work: 'Работа с клиентами',
  shares: 'Отчёт по ссылке',
  methods: 'Методика приоритетов',
  several_workspaces: 'Больше одного пространства',
}

const PRESET_LABEL: Record<string, string> = {
  clients: 'Работа на клиентов',
  team: 'Работа в команде',
  study: 'Учёба',
  personal: 'Личные дела',
  project: 'Свой проект',
  sport: 'Спорт',
  blank: 'С чистого листа',
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border bg-surface p-3">
      <span className="text-xs text-text-secondary">{label}</span>
      <span className="tabular font-mono text-xl font-semibold text-text">{value}</span>
      {hint && <span className="text-xs text-text-tertiary">{hint}</span>}
    </div>
  )
}

function Rows({ title, rows, total }: { title: string; rows: [string, number][]; total?: number }) {
  return (
    <section className="flex flex-col gap-1.5">
      <Overline>{title}</Overline>
      <div className="flex flex-col divide-y divide-divider rounded-md border border-border bg-surface px-3.5">
        {rows.length === 0 && <span className="py-2.5 text-sm text-text-tertiary">Нет данных</span>}
        {rows.map(([label, n]) => (
          <div key={label} className="flex items-center justify-between gap-3 py-2.5">
            <span className="text-sm text-text">{label}</span>
            <span className="tabular font-mono text-sm text-text-secondary">
              {n}
              {total ? ` · ${Math.round((n / total) * 100)} %` : ''}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function StatsTab() {
  const { data: s, isLoading, isError, error } = useAdminStats(true)
  if (isLoading) return null
  if (isError || !s) return <EmptyState title="Не загрузилось">{describeError(error)}</EmptyState>
  const sorted = (o: Record<string, number>, labels: Record<string, string>) =>
    Object.entries(o)
      .map(([k, n]) => [labels[k] ?? k, n] as [string, number])
      .sort((a, b) => b[1] - a[1])
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Пользователей" value={s.users} hint={`+${s.new_7d} за неделю · +${s.new_30d} за месяц`} />
        <Tile label="Активны сегодня" value={s.active_1d} hint={`неделя ${s.active_7d} · месяц ${s.active_30d}`} />
        <Tile label="Часов учёта за 7 дней" value={String(s.hours_7d).replace('.', ',')} hint={`записей ${s.entries_7d}`} />
        <Tile label="Задач за 7 дней" value={s.tasks_7d} />
        <Tile label="Новых обращений" value={s.feedback_new} />
        <Tile label="Средняя оценка" value={s.rating_avg ? String(s.rating_avg).replace('.', ',') : '—'} hint="по отзывам" />
      </div>
      <Rows title="Тарифы" rows={sorted(s.plans, PLAN_KEY_LABEL)} total={s.users} />
      <Rows title="Чем пользуются" rows={sorted(s.features, FEATURE_LABEL)} total={s.users} />
      <Rows title="Пресеты пространств" rows={sorted(s.presets, PRESET_LABEL)} />
      <Rows
        title="Регистрации по неделям"
        rows={[...s.signups_by_week]
          .reverse()
          .map((w) => [`с ${new Date(w.week).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}`, w.n] as [string, number])}
      />
    </>
  )
}

/* ── система ─────────────────────────────────────────────────────────── */

const JOB_LABEL: Record<string, string> = {
  'timer-reminders': 'Напоминания и фокус · каждую минуту',
  'calendar-sync': 'Синхронизация календарей · 15 мин',
  'telegram-digest': 'Итоги дня в Telegram · 15 мин',
}

function SystemTab() {
  const { data: s, isLoading, isError, error } = useAdminSystem(true)
  if (isLoading) return null
  if (isError || !s) return <EmptyState title="Не загрузилось">{describeError(error)}</EmptyState>
  return (
    <>
      <section className="flex flex-col gap-1.5">
        <Overline>Расписания</Overline>
        {s.cron.map((j) => {
          const ok = j.last_status === 'succeeded' && j.failed_24h === 0
          return (
            <div key={j.job} className="flex flex-col gap-1 rounded-md border border-border bg-surface p-3.5">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{JOB_LABEL[j.job] ?? j.job}</span>
                <Tag tone={ok ? 'success' : 'danger'}>{ok ? 'в порядке' : 'есть сбои'}</Tag>
              </div>
              <span className="text-xs text-text-secondary">
                Последний запуск {ago(j.last_run)} · за сутки {j.runs_24h}
                {j.failed_24h ? `, сбоев ${j.failed_24h}` : ''}
              </span>
            </div>
          )
        })}
      </section>
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Вызовов функций за сутки" value={s.http_24h.total} hint={s.http_24h.failed ? `с ошибкой ${s.http_24h.failed}` : 'без ошибок'} />
        <Tile
          label="Файлы"
          value={`${String(Object.values(s.storage_mb ?? {}).reduce((a, b) => a + b, 0).toFixed(1)).replace('.', ',')} МБ`}
          hint={Object.entries(s.storage_mb ?? {})
            .map(([b, mb]) => `${b} ${String(mb).replace('.', ',')}`)
            .join(' · ')}
        />
      </div>
      <Rows title="Версии у пользователей" rows={s.versions.map((v) => [v.version, v.users] as [string, number])} />
      <AdminLogSection />
    </>
  )
}

function AdminLogSection() {
  const { data = [], isLoading } = useAdminLog(null)
  if (isLoading) return null
  return (
    <section className="flex flex-col gap-1.5">
      <Overline>Журнал действий</Overline>
      {data.length === 0 ? (
        <span className="text-sm text-text-tertiary">Пока пусто: здесь появятся удаления, блокировки, сбросы пароля и выдача тарифов.</span>
      ) : (
        <LogList entries={data} withTarget />
      )}
    </section>
  )
}
