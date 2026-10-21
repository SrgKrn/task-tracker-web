import { useMemo, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { Button, EmptyState, FieldLabel, Overline, Segmented, Sheet, SheetActions, Tag, fieldClass } from '../components/ui'
import { Search } from '../components/Icon'
import { describeError, useToast } from '../lib/Toast'
import { PLAN_NAME, PLAN_RANK, type PaidPlan } from '../lib/plans'
import {
  KIND_LABEL,
  STATUS_LABEL,
  useAdminResetTrial,
  useAdminSetPlan,
  useAdminStats,
  useAdminSystem,
  useAdminUsers,
  useAllFeedback,
  useIsAdmin,
  useScreenshotUrls,
  useUpdateFeedback,
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
        {tab === 'users' && <UsersTab />}
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
  const [filter, setFilter] = useState<FeedbackFilter>('open')
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

  const setStatus = (status: FeedbackStatus) => update.mutate({ id: f.id, status }, { onError: (e) => showError(describeError(e)) })

  return (
    <article
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

function UsersTab() {
  const { data = [], isLoading, isError, error } = useAdminUsers(true)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const q = query.trim().toLowerCase()
  const list = q ? data.filter((u) => u.email.toLowerCase().includes(q) || (u.name ?? '').toLowerCase().includes(q)) : data

  if (isLoading) return null
  if (isError) return <EmptyState title="Не загрузилось">{describeError(error)}</EmptyState>
  return (
    <>
      <label className="flex h-[var(--tap)] items-center gap-2 rounded-sm bg-surface-sunken px-2.5 text-text-secondary">
        <Search size={16} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Почта или имя · всего ${data.length}`}
          aria-label="Поиск пользователей"
          className="min-w-0 flex-1 bg-transparent text-[length:var(--input-size)] text-text placeholder:text-text-tertiary"
          style={{ outline: 'none', boxShadow: 'none' }}
        />
      </label>
      {list.map((u) => (
        <article key={u.id} className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3.5">
          <div className="flex items-start gap-2">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-base font-medium text-text">{u.name || u.email}</span>
              {u.name && <span className="truncate text-sm text-text-secondary">{u.email}</span>}
            </div>
            <Tag tone={u.effective === 'free' ? 'neutral' : 'accent'}>{planLabel(u)}</Tag>
          </div>
          <span className="text-sm text-text-secondary">
            Был {ago(u.last_active)} · с {new Date(u.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: '2-digit' })}
            {u.last_seen_version ? ` · v${u.last_seen_version}` : ''}
            {u.last_seen_device ? ` · ${u.last_seen_device}` : ''}
          </span>
          <span className="tabular font-mono text-xs text-text-secondary">
            {u.workspaces} простр · {u.tasks} задач · {String(u.hours).replace('.', ',')} ч (30 дн: {String(u.hours_30d).replace('.', ',')}) · обращений {u.feedback}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {u.telegram && <Tag>Telegram</Tag>}
            {u.google && <Tag>Google</Tag>}
            {u.push && <Tag>Пуши</Tag>}
            {u.paid_until && u.plan !== 'lifetime' && <Tag>до {new Date(u.paid_until).toLocaleDateString('ru-RU')}</Tag>}
            <Button variant="ghost" className="ml-auto -mr-2" onClick={() => setEditing(u)}>
              Тариф
            </Button>
          </div>
        </article>
      ))}
      <PlanSheet user={editing} onClose={() => setEditing(null)} />
    </>
  )
}

type GivePlan = 'free' | 'plus' | 'pro' | 'lifetime'

function PlanSheet({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const setPlan = useAdminSetPlan()
  const resetTrial = useAdminResetTrial()
  const { showError, showSuccess } = useToast()
  const [plan, setPlanValue] = useState<GivePlan>('plus')
  const [days, setDays] = useState('30')
  const [forUser, setForUser] = useState<string | null>(null)
  // открыли для другого человека — начинаем с его текущего тарифа
  if (user && forUser !== user.id) {
    setForUser(user.id)
    setPlanValue((user.plan === 'studio' ? 'pro' : user.plan) as GivePlan)
    setDays('30')
  }
  const timed = plan === 'plus' || plan === 'pro'
  const daysNum = days.trim() === '' ? null : Math.max(1, Math.min(3650, Number(days) || 0))

  return (
    <Sheet open={!!user} onClose={onClose} title={user ? `Тариф: ${user.name || user.email}` : 'Тариф'}>
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
        <label className="flex flex-col gap-1.5">
          <FieldLabel>На сколько дней · пусто — бессрочно</FieldLabel>
          <input
            inputMode="numeric"
            value={days}
            onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))}
            className={fieldClass}
          />
        </label>
      )}
      {user?.trial_used && (
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
        onCancel={onClose}
        confirmLabel="Выдать"
        confirmDisabled={setPlan.isPending}
        onConfirm={() =>
          user &&
          setPlan.mutate(
            { user: user.id, plan, days: timed ? daysNum : null },
            {
              onError: (e) => showError(describeError(e)),
              onSuccess: () => {
                showSuccess('Тариф выдан')
                onClose()
              },
            },
          )
        }
      />
    </Sheet>
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
    </>
  )
}
