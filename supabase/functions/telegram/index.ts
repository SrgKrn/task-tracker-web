// Telegram-бот Semternity. Одна функция на три входа:
//   • вебхук Telegram — заголовок X-Telegram-Bot-Api-Secret-Token: /start с кодом привязки,
//     команды (/today, /week, /timer), текст — комментарий к задаче, кнопки под сообщениями
//     (остановить и начать учёт, засчитать встречу);
//   • расписание — заголовок x-cron-secret: action 'setup' (имя бота, вебхук, команды)
//     и 'digest' (вечерняя сводка и итоги недели — каждые 15 минут проверяется, кому пора);
//   • приложение — токен вошедшего пользователя: status, link, test, unlink, insight (блок «Время»).
//
// Токен бота, имя бота и пароль вебхука лежат в app_secrets (RLS без политик),
// в репозиторий не попадают.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import { chooseQuote, collectFacts, pickClientGroup, pickFact, renderBlock, type EntryRow, type TaskInfo } from './insight.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
/** код привязки живёт полчаса */
const CODE_TTL_MS = 30 * 60 * 1000
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

type Keyboard = { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] }

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function randomCode(bytes = 18): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** «1 ч 12 мин», «45 мин» */
function hm(minutes: number): string {
  const m = Math.round(minutes)
  const h = Math.floor(Math.abs(m) / 60)
  const r = Math.abs(m) % 60
  const sign = m < 0 ? '−' : ''
  if (h === 0) return `${sign}${r} мин`
  return r ? `${sign}${h} ч ${r} мин` : `${sign}${h} ч`
}

function hours1(minutes: number): string {
  return (minutes / 60).toFixed(1).replace('.', ',').replace(',0', '')
}

/** YYYY-MM-DD в часовом поясе пользователя — день, к которому относится запись */
function localDate(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

function localParts(d: Date, timeZone: string): { hour: number; weekday: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(d)
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
    const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun'
    return { hour, weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd) }
  } catch {
    return { hour: d.getUTCHours(), weekday: d.getUTCDay() }
  }
}

function clock(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return iso.slice(11, 16)
  }
}

/** границы местного дня в UTC — чтобы выбрать встречи дня */
function dayBounds(date: string, timeZone: string): { from: Date; to: Date } {
  // полдень UTC этой даты почти всегда внутри местного дня — от него ищем смещение
  const noon = new Date(`${date}T12:00:00Z`)
  const local = new Date(noon.toLocaleString('en-US', { timeZone }))
  const offset = local.getTime() - noon.getTime()
  const from = new Date(new Date(`${date}T00:00:00Z`).getTime() - offset)
  return { from, to: new Date(from.getTime() + 86_400_000) }
}

function dayTitle(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** «Планёрка 12.10 — Ромашка!» → «планерка ромашка» — так же, как в функции календаря */
function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

interface TaskRow {
  id: string
  name: string
  workspace_id: string
  item_ids: string[]
  status_id: string | null
  parent_id: string | null
  planned_hours: number
  fact_hours: number
  end_date: string | null
}

/**
 * Всё, что нужно сводкам и кнопкам: задачи, статусы, подписи групп. С wsId — только одно
 * пространство: у него свои группы (главная группа «Работы» — клиенты, у «Спорта» — цели).
 */
async function loadWorld(db: SupabaseClient, userId: string, wsId?: string) {
  let tasksQ = db
    .from('tasks')
    .select('id, name, workspace_id, item_ids, status_id, parent_id, planned_hours, fact_hours, end_date')
    .eq('user_id', userId)
  let statusesQ = db.from('statuses').select('id, is_final').eq('user_id', userId)
  let groupsQ = db.from('groups').select('id, name, sort_order, show_in_list').eq('user_id', userId)
  let itemsQ = db.from('group_items').select('id, name, group_id').eq('user_id', userId)
  if (wsId) {
    tasksQ = tasksQ.eq('workspace_id', wsId)
    statusesQ = statusesQ.eq('workspace_id', wsId)
    groupsQ = groupsQ.eq('workspace_id', wsId)
    itemsQ = itemsQ.eq('workspace_id', wsId)
  }
  const [{ data: tasks }, { data: statuses }, { data: groups }, { data: items }] = await Promise.all([
    tasksQ,
    statusesQ,
    groupsQ.order('sort_order'),
    itemsQ,
  ])
  const all = ((tasks ?? []) as TaskRow[]).map((t) => ({ ...t, planned_hours: Number(t.planned_hours), fact_hours: Number(t.fact_hours) }))
  const byId = new Map(all.map((t) => [t.id, t]))
  const final = new Set((statuses ?? []).filter((s) => s.is_final).map((s) => s.id))
  const itemById = new Map((items ?? []).map((i) => [i.id, i]))
  const listGroups = (groups ?? []).filter((g) => g.show_in_list)
  const mainGroup = listGroups[0] ?? (groups ?? [])[0]
  const isOpen = (t: TaskRow) => !t.status_id || !final.has(t.status_id)
  const title = (taskId: string) => {
    const t = byId.get(taskId)
    if (!t) return 'Задача'
    const parent = t.parent_id ? byId.get(t.parent_id) : undefined
    return parent ? `${parent.name.trim()} / ${t.name.trim()}` : t.name.trim()
  }
  /** «Ромашка» — значение группы, видной в строке задачи */
  const label = (taskId: string) => {
    const t = byId.get(taskId)
    if (!t) return ''
    return t.item_ids
      .map((id) => itemById.get(id))
      .filter((i) => i && listGroups.some((g) => g.id === i.group_id))
      .map((i) => i!.name)
      .join(' · ')
  }
  const mainValue = (taskId: string) => {
    const t = byId.get(taskId)
    if (!t || !mainGroup) return 'Без группы'
    const item = t.item_ids.map((id) => itemById.get(id)).find((i) => i?.group_id === mainGroup.id)
    return item?.name ?? 'Не указано'
  }
  const headOf = (taskId: string) => {
    const t = byId.get(taskId)
    return t?.parent_id ?? taskId
  }
  /** факт спринта вместе с подзадачами */
  const rollup = (taskId: string) =>
    all.filter((x) => x.id === taskId || x.parent_id === taskId).reduce((s, x) => s + x.fact_hours, 0)
  return { all, byId, isOpen, title, label, mainValue, mainGroup, headOf, rollup }
}

interface WsRow {
  id: string
  name: string
  is_default: boolean
  planned_hours_per_day: number | null
}

/** пространства пользователя: основное первым, дальше — как в приложении */
async function workspacesOf(db: SupabaseClient, userId: string): Promise<WsRow[]> {
  const { data } = await db
    .from('workspaces')
    .select('id, name, is_default, planned_hours_per_day, sort_order')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('sort_order')
  return (data ?? []) as WsRow[]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: rows } = await db.from('app_secrets').select('name, value')
  const secret: Record<string, string> = Object.fromEntries(
    (rows ?? []).map((r: { name: string; value: string }) => [r.name, r.value]),
  )
  const token = secret.telegram_bot_token ?? ''
  const botUsername = secret.telegram_bot_username ?? ''
  const appUrl = secret.app_url ?? secret.vapid_subject ?? ''

  async function tg(method: string, payload: Record<string, unknown>) {
    if (!token) throw new Error('Бот не настроен')
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await r.json()
    if (!j.ok) throw new Error(`${method}: ${j.description}`)
    return j.result
  }

  /** ответ в чат; ошибки Telegram не должны ломать остальную логику */
  async function say(chatId: number, text: string, extra: Record<string, unknown> = {}) {
    try {
      await tg('sendMessage', { chat_id: chatId, text, disable_web_page_preview: true, ...extra })
    } catch (e) {
      console.error('sendMessage', String(e))
    }
  }

  const openApp = (path = ''): Keyboard['inline_keyboard'][number] =>
    appUrl ? [{ text: 'Открыть Semternity', url: `${appUrl}${path}` }] : []

  /* ── учёт ──────────────────────────────────────────────────────── */

  /** остановить идущий учёт: запись в историю, таймер — прочь */
  async function stopTimer(userId: string, timer: { task_id: string; started_at: string }, timezone: string) {
    // сначала забираем таймер — если его уже остановили в приложении, второй записи не будет
    const { data: taken } = await db
      .from('active_timers')
      .delete()
      .eq('user_id', userId)
      .eq('started_at', timer.started_at)
      .select('user_id')
    if (!taken?.length) return null
    const started = new Date(timer.started_at)
    const ended = new Date()
    // секунды: короткая сессия не пропадает в «0 мин»; минуты база посчитает сама
    const seconds = Math.max(0, Math.floor((ended.getTime() - started.getTime()) / 1000))
    await db.from('time_entries').insert({
      user_id: userId,
      task_id: timer.task_id,
      entry_type: 'timer',
      started_at: timer.started_at,
      ended_at: ended.toISOString(),
      duration_seconds: seconds,
      effective_date: localDate(started, timezone),
    })
    return seconds / 60
  }

  /** начать учёт; идущий по другой задаче — сначала остановить */
  async function startTimer(userId: string, taskId: string, timezone: string) {
    const { data: running } = await db.from('active_timers').select('task_id, started_at').eq('user_id', userId).maybeSingle()
    if (running?.task_id === taskId) return { started_at: running.started_at as string, stopped: null }
    let stopped: { taskId: string; minutes: number } | null = null
    if (running) {
      const minutes = await stopTimer(userId, running, timezone)
      if (minutes !== null) stopped = { taskId: running.task_id, minutes }
    }
    const startedAt = new Date().toISOString()
    await db.from('active_timers').upsert({ user_id: userId, task_id: taskId, started_at: startedAt, reminded_hours: 0 })
    return { started_at: startedAt, stopped }
  }

  /** последние задачи, по которым шёл учёт, — для кнопок «начать» и «к какой задаче» */
  async function recentTasks(userId: string, world: Awaited<ReturnType<typeof loadWorld>>, limit = 5): Promise<string[]> {
    const { data: recent } = await db
      .from('time_entries')
      .select('task_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(200)
    const ids: string[] = []
    for (const r of recent ?? []) {
      const t = world.byId.get(r.task_id)
      if (!t || !world.isOpen(t) || ids.includes(t.id)) continue
      if (t.parent_id) {
        const head = world.byId.get(t.parent_id)
        if (head && !world.isOpen(head)) continue
      }
      ids.push(t.id)
      if (ids.length >= limit) break
    }
    // учёта ещё не было — свежие открытые задачи
    if (ids.length < limit) {
      for (const t of world.all) {
        if (!t.parent_id && world.isOpen(t) && !ids.includes(t.id)) ids.push(t.id)
        if (ids.length >= limit) break
      }
    }
    return ids
  }

  /* ── встречи ───────────────────────────────────────────────────── */

  /** встреча уже покрыта учётом, если таймер шёл хотя бы половину её времени */
  function covered(ev: { starts_at: string; ends_at: string }, sessions: { s: number; e: number }[]): boolean {
    const s = new Date(ev.starts_at).getTime()
    const e = new Date(ev.ends_at).getTime()
    let overlap = 0
    for (const x of sessions) overlap += Math.max(0, Math.min(e, x.e) - Math.max(s, x.s))
    return overlap >= (e - s) / 2
  }

  async function sessionsBetween(userId: string, from: Date, to: Date) {
    const [{ data: entries }, { data: running }] = await Promise.all([
      db
        .from('time_entries')
        .select('started_at, ended_at')
        .eq('user_id', userId)
        .eq('entry_type', 'timer')
        .lt('started_at', to.toISOString())
        .gt('ended_at', from.toISOString()),
      db.from('active_timers').select('started_at').eq('user_id', userId).maybeSingle(),
    ])
    const list = (entries ?? []).map((x) => ({ s: new Date(x.started_at).getTime(), e: new Date(x.ended_at).getTime() }))
    if (running) list.push({ s: new Date(running.started_at).getTime(), e: Date.now() })
    return list
  }

  /** засчитать встречу в задачу: запись с её временем, встреча — «учтена», выбор запоминается */
  async function logMeeting(userId: string, eventId: number, taskId: string, timezone: string) {
    const { data: ev } = await db
      .from('calendar_events')
      .select('id, title, starts_at, ends_at, status')
      .eq('id', eventId)
      .eq('user_id', userId)
      .maybeSingle()
    if (!ev) return { error: 'Встреча не найдена' }
    if (ev.status !== 'new') return { error: 'Эта встреча уже разобрана' }
    const { data: task } = await db.from('tasks').select('id').eq('id', taskId).eq('user_id', userId).maybeSingle()
    if (!task) return { error: 'Задача не найдена' }
    // помечаем первой: два быстрых нажатия не запишут встречу дважды
    const { data: claimed } = await db
      .from('calendar_events')
      .update({ status: 'logged', task_id: taskId })
      .eq('id', eventId)
      .eq('status', 'new')
      .select('id')
    if (!claimed?.length) return { error: 'Эта встреча уже разобрана' }
    const seconds = Math.round((new Date(ev.ends_at).getTime() - new Date(ev.starts_at).getTime()) / 1000)
    const minutes = seconds / 60
    const { data: entry } = await db
      .from('time_entries')
      .insert({
        user_id: userId,
        task_id: taskId,
        entry_type: 'timer',
        started_at: ev.starts_at,
        ended_at: ev.ends_at,
        duration_seconds: seconds,
        note: ev.title,
        effective_date: localDate(new Date(ev.starts_at), timezone),
      })
      .select('id')
      .single()
    if (entry) await db.from('calendar_events').update({ entry_id: entry.id }).eq('id', eventId)
    const key = titleKey(ev.title)
    if (key) {
      await db.from('calendar_rules').upsert({ user_id: userId, title_key: key, task_id: taskId, updated_at: new Date().toISOString() })
    }
    return { minutes, title: ev.title }
  }

  /** убрать из клавиатуры сообщения кнопки разобранной встречи */
  async function dropEventButtons(chatId: number, messageId: number, markup: Keyboard | undefined, eventId: number) {
    if (!markup) return
    const tail = `:${eventId}`
    const rows = markup.inline_keyboard.filter(
      (row) => !row.some((b) => b.callback_data && (b.callback_data.endsWith(tail) || b.callback_data.includes(`${tail}:`))),
    )
    await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: rows } }).catch(() => {})
  }

  /* ── блок «Время»: факт дня и цитата ──────────────────────────── */

  interface DayInsight {
    fact: string
    kind: string
    quote: { text: string; author: string; source: string | null } | null
  }

  /** все записи пользователя до дня включительно — постранично: больше 1000 строк база не отдаёт */
  async function entriesUpTo(userId: string, date: string): Promise<EntryRow[]> {
    const out: EntryRow[] = []
    for (let from = 0; ; from += 1000) {
      const { data } = await db
        .from('time_entries')
        .select('task_id, duration_seconds, effective_date, entry_type, started_at')
        .eq('user_id', userId)
        .lte('effective_date', date)
        .order('id')
        .range(from, from + 999)
      out.push(...((data ?? []) as EntryRow[]))
      if (!data || data.length < 1000) return out
    }
  }

  /**
   * Блок дня. Фиксируется при первом показе: утром в приложении (source 'app') факт — о вчерашнем
   * дне, в вечерних «Итогах» ('digest') — о сегодняшнем; второе место показывает то же самое.
   * store: false — посчитать, ничего не записывая (проверка dry_run).
   */
  async function dayInsight(userId: string, source: 'app' | 'digest', store = true): Promise<DayInsight | null> {
    const { data: settings } = await db
      .from('user_settings')
      .select('timezone, show_time_block, work_days_per_week')
      .eq('user_id', userId)
      .maybeSingle()
    if (settings && settings.show_time_block === false) return null
    const timeZone = settings?.timezone ?? 'Europe/Minsk'
    const today = localDate(new Date(), timeZone)

    const quoteOf = async (id: number | null) => {
      if (id === null) return null
      const { data } = await db.from('quotes').select('text, author, source').eq('id', id).maybeSingle()
      return data ?? null
    }
    const stored = async (): Promise<DayInsight | null> => {
      const { data } = await db
        .from('quote_impressions')
        .select('quote_id, fact_kind, fact_text')
        .eq('user_id', userId)
        .eq('shown_on', today)
        .maybeSingle()
      return data ? { fact: data.fact_text, kind: data.fact_kind, quote: await quoteOf(data.quote_id) } : null
    }
    if (store) {
      const existing = await stored()
      if (existing) return existing
    }

    const date = source === 'digest' ? today : shift(today, -1)
    const [entries, { data: tasks }, { data: groups }, { data: items }, { data: statuses }, { data: yesterday }] = await Promise.all([
      entriesUpTo(userId, date),
      db
        .from('tasks')
        .select('id, name, parent_id, planned_hours, start_date, end_date, completed_at, item_ids, status_id')
        .eq('user_id', userId),
      db.from('groups').select('id, name, sort_order, show_in_list').eq('user_id', userId).order('sort_order'),
      db.from('group_items').select('id, name, group_id, color').eq('user_id', userId),
      db.from('statuses').select('id, is_final').eq('user_id', userId),
      db.from('quote_impressions').select('fact_kind').eq('user_id', userId).eq('shown_on', shift(today, -1)).maybeSingle(),
    ])
    // клиент — значение группы «Проекты» (или той, чьи значения окрашены), а не просто первой
    const main = pickClientGroup(groups ?? [], (gid) => (items ?? []).filter((i) => i.group_id === gid && i.color).length)
    const itemById = new Map((items ?? []).map((i) => [i.id, i]))
    const final = new Set((statuses ?? []).filter((s) => s.is_final).map((s) => s.id))
    const infos: TaskInfo[] = (tasks ?? []).map((t) => {
      const item = main ? (t.item_ids as string[]).map((id) => itemById.get(id)).find((i) => i?.group_id === main.id) : undefined
      return {
        id: t.id,
        name: t.name,
        parent_id: t.parent_id,
        planned_hours: Number(t.planned_hours),
        start_date: t.start_date,
        end_date: t.end_date,
        // закрытые до журнала статусов (без даты) — тоже не «идущие» спринты
        completed_at: t.completed_at ?? (t.status_id && final.has(t.status_id) ? '1970-01-01T00:00:00Z' : null),
        client: item ? { id: item.id, name: item.name } : null,
      }
    })
    const fact = pickFact(
      collectFacts({
        date,
        dayWord: source === 'digest' ? 'Сегодня' : 'Вчера',
        timeZone,
        workDaysPerWeek: settings?.work_days_per_week ?? 5,
        entries,
        tasks: infos,
      }),
      yesterday?.fact_kind ?? null,
    )
    if (!fact) return null

    const [{ data: quotes }, { data: seenRows }] = await Promise.all([
      db.from('quotes').select('id, tags, text, author, source').eq('is_active', true),
      db.from('quote_impressions').select('quote_id').eq('user_id', userId).not('quote_id', 'is', null),
    ])
    const seen = new Set((seenRows ?? []).map((r) => Number(r.quote_id)))
    const choice = chooseQuote((quotes ?? []).map((x) => ({ id: Number(x.id), tags: x.tags })), seen, fact.kind)
    const quote = choice ? (quotes ?? []).find((x) => Number(x.id) === choice.id) ?? null : null
    const result: DayInsight = {
      fact: fact.text,
      kind: fact.kind,
      quote: quote ? { text: quote.text, author: quote.author, source: quote.source } : null,
    }
    if (!store) return result

    // увидел все цитаты — новый цикл: прошлые показы забывают цитату, но помнят факт
    if (choice?.reset) {
      await db.from('quote_impressions').update({ quote_id: null }).eq('user_id', userId).lt('shown_on', today)
    }
    await db.from('quote_impressions').upsert(
      { user_id: userId, shown_on: today, quote_id: choice?.id ?? null, fact_kind: fact.kind, fact_text: fact.text },
      { onConflict: 'user_id,shown_on', ignoreDuplicates: true },
    )
    // два одновременных открытия: остаётся записанный первым
    return (await stored()) ?? result
  }

  /* ── сводки ────────────────────────────────────────────────────── */

  type EntryWs = { task_id: string; duration_seconds: number; workspace_id: string }

  /**
   * Блок пространства в итогах дня: сколько записано, главные задачи, близко к плану и
   * просрочено. withTitle — заголовок пространства (когда их в сводке несколько).
   */
  async function daySection(userId: string, ws: WsRow, date: string, entries: EntryWs[], withTitle: boolean, fallbackPlan: number) {
    const world = await loadWorld(db, userId, ws.id)
    const mine = entries.filter((e) => e.workspace_id === ws.id)
    const total = mine.reduce((s, e) => s + e.duration_seconds / 60, 0)
    const byHead = new Map<string, number>()
    for (const e of mine) {
      const head = world.headOf(e.task_id)
      byHead.set(head, (byHead.get(head) ?? 0) + e.duration_seconds / 60)
    }
    const lines: string[] = []
    if (withTitle) lines.push('', `▍${ws.name}`)
    // норма — пространства; у основного без своей — из профиля (старые настройки)
    const plan = ws.planned_hours_per_day != null ? Number(ws.planned_hours_per_day) * 60 : ws.is_default ? fallbackPlan : 0
    lines.push(
      total > 0
        ? `Записано ${hm(total)}${plan ? ` · план ${hm(plan)} (${Math.round((total / plan) * 100)}%)` : ''}`
        : 'Учёта за день нет',
    )
    const top = [...byHead.entries()].filter(([, m]) => m !== 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
    if (top.length) {
      lines.push('')
      for (const [taskId, m] of top) {
        const label = world.label(taskId)
        lines.push(`• ${cut(world.title(taskId), 40)}${label ? ` · ${cut(label, 24)}` : ''} — ${hm(m)}`)
      }
    }
    // близко к плану и просрочено — по открытым спринтам этого пространства
    const heads = world.all.filter((t) => !t.parent_id && world.isOpen(t))
    const near = heads
      .filter((t) => t.planned_hours > 0)
      .map((t) => ({ t, pct: Math.round((world.rollup(t.id) / t.planned_hours) * 100) }))
      .filter((x) => x.pct >= 90)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 3)
    const overdue = heads.filter((t) => t.end_date && t.end_date < date)
    if (near.length || overdue.length) lines.push('')
    if (near.length) {
      lines.push(`⚠️ Близко к плану: ${near.map((x) => `«${cut(x.t.name.trim(), 28)}» — ${x.pct}%`).join(', ')}`)
    }
    if (overdue.length) {
      lines.push(
        `⚑ Срок прошёл: ${overdue.slice(0, 3).map((t) => `«${cut(t.name.trim(), 28)}»`).join(', ')}${overdue.length > 3 ? ` и ещё ${overdue.length - 3}` : ''}`,
      )
    }
    return { lines, total }
  }

  /**
   * Итоги дня. Пространств несколько — блоком по каждому; only — одно пространство
   * (кнопка после /today). Учёт, встречи и блок «Время» — общие, один раз.
   */
  async function dailyDigest(userId: string, timezone: string, date: string, store = true, only?: string) {
    const world = await loadWorld(db, userId)
    const spaces = await workspacesOf(db, userId)
    const targets = only ? spaces.filter((w) => w.id === only) : spaces
    const multi = targets.length > 1
    const [{ data: entries }, { data: running }, { data: settings }] = await Promise.all([
      db.from('time_entries').select('task_id, duration_seconds, workspace_id').eq('user_id', userId).eq('effective_date', date),
      db.from('active_timers').select('task_id, started_at').eq('user_id', userId).maybeSingle(),
      db.from('user_settings').select('planned_hours_per_day').eq('user_id', userId).maybeSingle(),
    ])
    const fallbackPlan = settings?.planned_hours_per_day ? Number(settings.planned_hours_per_day) * 60 : 0
    const { from, to } = dayBounds(date, timezone)
    let eventsQuery = db
      .from('calendar_events')
      .select('id, title, starts_at, ends_at, suggested_task_id')
      .eq('user_id', userId)
      .eq('status', 'new')
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .lte('ends_at', new Date().toISOString())
      .order('starts_at')
    if (only) eventsQuery = eventsQuery.eq('workspace_id', only)
    const { data: events } = await eventsQuery
    const sessions = await sessionsBetween(userId, from, to)
    const meetings = (events ?? []).filter((ev) => !covered(ev, sessions)).slice(0, 6)

    const lines: string[] = [`📊 Итоги дня · ${dayTitle(date)}${only && spaces.length > 1 && targets[0] ? ` · ${targets[0].name}` : ''}`]
    let total = 0
    for (const ws of targets) {
      const section = await daySection(userId, ws, date, (entries ?? []) as EntryWs[], multi, fallbackPlan)
      lines.push(...section.lines)
      total += section.total
    }
    if (multi) {
      lines.push('', `Всего за день — ${hm(total)}`)
    }
    const keyboard: Keyboard = { inline_keyboard: [] }
    if (running) {
      const mins = Math.round((Date.now() - new Date(running.started_at).getTime()) / 60_000)
      lines.push('', `⏱ Учёт ещё идёт: «${cut(world.title(running.task_id), 40)}» — ${hm(mins)}`)
      const epoch = Math.floor(new Date(running.started_at).getTime() / 1000)
      keyboard.inline_keyboard.push([{ text: '⏹ Остановить учёт', callback_data: `stop:${epoch}` }])
    }
    if (meetings.length) {
      lines.push('', '📅 Встречи без учёта:')
      meetings.forEach((ev, i) => {
        const n = i + 1
        const sug = ev.suggested_task_id && world.byId.has(ev.suggested_task_id) ? ev.suggested_task_id : null
        lines.push(
          `${n}. ${clock(ev.starts_at, timezone)}–${clock(ev.ends_at, timezone)} · ${cut(ev.title, 48)}${sug ? ` → «${cut(world.title(sug), 32)}»` : ''}`,
        )
        keyboard.inline_keyboard.push([
          sug
            ? { text: `✓ ${n} в «${cut(world.title(sug), 22)}»`, callback_data: `lg:${ev.id}` }
            : { text: `${n}: выбрать задачу`, callback_data: `pk:${ev.id}` },
          ...(sug ? [{ text: 'Другая', callback_data: `pk:${ev.id}` }] : []),
          { text: '✕', callback_data: `sk:${ev.id}` },
        ])
      })
    }
    // блок «Время» — только о сегодняшнем дне: сводка за прошлую дату (dry_run) его не получает
    const insight = date === localDate(new Date(), timezone) ? await dayInsight(userId, 'digest', store) : null
    if (insight) lines.push('', renderBlock(insight.fact, insight.quote))
    keyboard.inline_keyboard.push(openApp('/'))
    const worthSending = total !== 0 || meetings.length > 0 || !!running
    return { text: lines.join('\n'), keyboard, worthSending }
  }

  /** Итоги недели: блоком по каждому пространству (или одно — only). */
  async function weeklyDigest(userId: string, date: string, only?: string) {
    const spaces = await workspacesOf(db, userId)
    const targets = only ? spaces.filter((w) => w.id === only) : spaces
    const multi = targets.length > 1
    // неделя с понедельника по сегодняшний день
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay() || 7
    const monday = shift(date, 1 - weekday)
    const prevMonday = shift(monday, -7)
    const prevSame = shift(date, -7)
    const [{ data: cur }, { data: prev }] = await Promise.all([
      db
        .from('time_entries')
        .select('task_id, duration_seconds, workspace_id')
        .eq('user_id', userId)
        .gte('effective_date', monday)
        .lte('effective_date', date),
      db
        .from('time_entries')
        .select('duration_seconds, workspace_id')
        .eq('user_id', userId)
        .gte('effective_date', prevMonday)
        .lte('effective_date', prevSame),
    ])
    const m = new Date(`${monday}T12:00:00Z`)
    const d = new Date(`${date}T12:00:00Z`)
    const range =
      monday === date
        ? `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`
        : m.getUTCMonth() === d.getUTCMonth()
        ? `${m.getUTCDate()}–${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`
        : `${m.getUTCDate()} ${MONTHS_GEN[m.getUTCMonth()]} – ${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`
    const lines = [`🗓 Итоги недели · ${range}${only && spaces.length > 1 && targets[0] ? ` · ${targets[0].name}` : ''}`]
    let all = 0
    for (const ws of targets) {
      const world = await loadWorld(db, userId, ws.id)
      const mine = (cur ?? []).filter((e) => e.workspace_id === ws.id)
      const total = mine.reduce((s, e) => s + e.duration_seconds / 60, 0)
      const prevTotal = (prev ?? []).filter((e) => e.workspace_id === ws.id).reduce((s, e) => s + e.duration_seconds / 60, 0)
      all += total
      const byGroup = new Map<string, number>()
      for (const e of mine) {
        // групп в пространстве нет (бывает у «Спорта») — раскладываем по задачам, а не в «Без группы»
        const key = world.mainGroup ? world.mainValue(e.task_id) : world.title(world.headOf(e.task_id))
        byGroup.set(key, (byGroup.get(key) ?? 0) + e.duration_seconds / 60)
      }
      if (multi) lines.push('', `▍${ws.name}`)
      const delta = total - prevTotal
      lines.push(
        total > 0 || prevTotal > 0
          ? `Записано ${hm(total)}${prevTotal > 0 ? ` · прошлая неделя ${hm(prevTotal)} (${delta >= 0 ? '+' : '−'}${hours1(Math.abs(delta))} ч)` : ''}`
          : 'Учёта за неделю нет',
      )
      const top = [...byGroup.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 7)
      if (top.length) {
        lines.push('', world.mainGroup ? `${world.mainGroup.name}:` : 'По задачам:')
        for (const [name, v] of top) lines.push(`• ${cut(name, 36)} — ${hm(v)} (${Math.round((v / total) * 100)}%)`)
      }
      const overs = world.all
        .filter((t) => !t.parent_id && world.isOpen(t) && t.planned_hours > 0)
        .map((t) => ({ t, pct: Math.round((world.rollup(t.id) / t.planned_hours) * 100) }))
        .filter((x) => x.pct > 100)
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 3)
      if (overs.length) {
        lines.push('', `За план вышли: ${overs.map((x) => `«${cut(x.t.name.trim(), 28)}» (${x.pct}%)`).join(', ')}`)
      }
    }
    if (multi) lines.push('', `Всего за неделю — ${hm(all)}`)
    return { text: lines.join('\n'), keyboard: { inline_keyboard: [openApp('/dashboard')].filter((r) => r.length) } as Keyboard }
  }

  /** «За какое пространство?» — кнопки после /today и /week, если пространств несколько */
  function spaceChooser(kind: 'dd' | 'dw', spaces: WsRow[]): Keyboard {
    return {
      inline_keyboard: [
        [{ text: 'Все пространства', callback_data: `${kind}:all` }],
        ...spaces.map((w) => [{ text: w.name.slice(0, 40), callback_data: `${kind}:${w.id}` }]),
      ],
    }
  }

  /** панель учёта: что идёт сейчас и кнопки «начать» по последним задачам */
  async function timerPanel(userId: string) {
    const world = await loadWorld(db, userId)
    const spaces = await workspacesOf(db, userId)
    const spaceName = new Map(spaces.map((w) => [w.id, w.name]))
    const { data: running } = await db.from('active_timers').select('task_id, started_at').eq('user_id', userId).maybeSingle()
    const keyboard: Keyboard = { inline_keyboard: [] }
    const lines: string[] = []
    if (running) {
      const mins = Math.round((Date.now() - new Date(running.started_at).getTime()) / 60_000)
      lines.push(`⏱ Идёт учёт: «${world.title(running.task_id)}» — ${hm(mins)}`)
      const epoch = Math.floor(new Date(running.started_at).getTime() / 1000)
      keyboard.inline_keyboard.push([{ text: '⏹ Остановить', callback_data: `stop:${epoch}` }])
    } else {
      lines.push('Учёт сейчас не идёт.')
    }
    const ids = (await recentTasks(userId, world, 6)).filter((id) => id !== running?.task_id).slice(0, 5)
    if (ids.length) {
      lines.push('', 'Начать учёт:')
      for (const id of ids) {
        // пространств несколько — подписываем пространство, а не группу: задачи из разных мест
        const label = spaces.length > 1 ? (spaceName.get(world.byId.get(id)?.workspace_id ?? '') ?? '') : world.label(id)
        keyboard.inline_keyboard.push([{ text: `▶ ${cut(world.title(id), 34)}${label ? ` · ${cut(label, 16)}` : ''}`, callback_data: `go:${id}` }])
      }
    }
    return { text: lines.join('\n'), keyboard }
  }

  const HELP =
    'Что я умею:\n' +
    '/timer — что идёт сейчас, начать или остановить учёт\n' +
    '/today — итоги дня\n' +
    '/week — итоги недели\n\n' +
    'Напишите любой текст — он станет комментарием к задаче, по которой идёт учёт.'

  // ── 1. вебхук Telegram ────────────────────────────────────────────
  const hookHeader = req.headers.get('x-telegram-bot-api-secret-token')
  if (hookHeader !== null) {
    if (!secret.telegram_webhook_secret || hookHeader !== secret.telegram_webhook_secret) {
      return json({ error: 'forbidden' }, 403)
    }
    const update = await req.json().catch(() => ({}))
    try {
      await handleUpdate(update)
    } catch (e) {
      console.error('update', String(e))
    }
    // Telegram повторяет доставку, пока не получит 200, — отвечаем 200 всегда
    return json({ ok: true })
  }

  async function accountOf(chatId: number) {
    const { data } = await db
      .from('telegram_accounts')
      .select('user_id, timezone, pending_comment')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data as { user_id: string; timezone: string; pending_comment: string | null } | null
  }

  async function handleUpdate(update: Record<string, any>) {
    const msg = update.message
    if (msg?.chat?.id) {
      const chatId = msg.chat.id as number
      const text = String(msg.text ?? '').trim()
      if (text.startsWith('/start')) {
        const code = text.split(/\s+/)[1]
        const { data: link } = code
          ? await db.from('telegram_link_codes').select('*').eq('code', code).maybeSingle()
          : { data: null }
        if (!link || Date.now() - new Date(link.created_at).getTime() > CODE_TTL_MS) {
          const acc = await accountOf(chatId)
          await say(
            chatId,
            acc
              ? HELP
              : 'Ссылка устарела или неверная. Откройте Semternity → Профиль → Telegram и нажмите «Подключить» ещё раз.',
          )
          return
        }
        await db.from('telegram_accounts').upsert({
          user_id: link.user_id,
          chat_id: chatId,
          username: msg.from?.username ?? '',
          first_name: msg.from?.first_name ?? '',
          timezone: link.timezone,
        })
        await db.from('telegram_link_codes').delete().eq('user_id', link.user_id)
        await say(
          chatId,
          '✅ Semternity подключён.\n\nНапишу, если учёт идёт дольше часа, пришлю итоги дня вечером и итоги недели в пятницу.\n\n' +
            HELP,
        )
        return
      }

      const acc = await accountOf(chatId)
      if (!acc) {
        await say(chatId, 'Я присылаю уведомления Semternity. Подключение — в приложении: Профиль → Telegram.')
        return
      }
      if (!text) return
      const command = text.split(/[\s@]/)[0].toLowerCase()
      if (command === '/today' || command === '/week') {
        const spaces = await workspacesOf(db, acc.user_id)
        if (spaces.length > 1) {
          await say(chatId, command === '/today' ? 'Итоги дня — за какое пространство?' : 'Итоги недели — за какое пространство?', {
            reply_markup: spaceChooser(command === '/today' ? 'dd' : 'dw', spaces),
          })
          return
        }
        const date = localDate(new Date(), acc.timezone)
        const r = command === '/today' ? await dailyDigest(acc.user_id, acc.timezone, date) : await weeklyDigest(acc.user_id, date)
        await say(chatId, r.text, { reply_markup: r.keyboard })
        return
      }
      if (command === '/timer') {
        const p = await timerPanel(acc.user_id)
        await say(chatId, p.text, { reply_markup: p.keyboard })
        return
      }
      if (text.startsWith('/')) {
        await say(chatId, HELP)
        return
      }

      // текст — комментарий: к задаче идущего учёта или к выбранной
      const body = text.slice(0, 4000)
      const { data: running } = await db.from('active_timers').select('task_id').eq('user_id', acc.user_id).maybeSingle()
      const world = await loadWorld(db, acc.user_id)
      if (running) {
        await db.from('comments').insert({ user_id: acc.user_id, task_id: running.task_id, body })
        await say(chatId, `💬 Добавил комментарий к «${world.title(running.task_id)}»`)
        return
      }
      await db.from('telegram_accounts').update({ pending_comment: body }).eq('user_id', acc.user_id)
      const ids = await recentTasks(acc.user_id, world, 5)
      await say(chatId, 'Учёт сейчас не идёт. К какой задаче добавить комментарий?', {
        reply_markup: {
          inline_keyboard: [
            ...ids.map((id) => [{ text: cut(world.title(id), 48), callback_data: `cm:${id}` }]),
            [{ text: 'Не добавлять', callback_data: 'cm:none' }],
          ],
        },
      })
      return
    }

    const cq = update.callback_query
    if (!cq?.id) return
    const chatId = cq.message?.chat?.id as number
    const messageId = cq.message?.message_id as number
    const markup = cq.message?.reply_markup as Keyboard | undefined
    const original = String(cq.message?.text ?? '')
    const data = String(cq.data ?? '')
    const [action, a1, a2] = data.split(':')
    const answer = (text: string) => tg('answerCallbackQuery', { callback_query_id: cq.id, text }).catch(() => {})
    const acc = await accountOf(chatId)
    if (!acc) {
      await answer('Этот чат не подключён к Semternity')
      return
    }
    const userId = acc.user_id
    const timezone = acc.timezone

    // выбор пространства для /today и /week
    if (action === 'dd' || action === 'dw') {
      const only = a1 === 'all' ? undefined : a1
      const date = localDate(new Date(), timezone)
      const r = action === 'dd' ? await dailyDigest(userId, timezone, date, true, only) : await weeklyDigest(userId, date, only)
      await answer('')
      await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => {})
      await say(chatId, r.text, { reply_markup: r.keyboard })
      return
    }

    if (action === 'stop' || action === 'keep') {
      const epoch = Number(a1)
      const { data: t } = await db.from('active_timers').select('task_id, started_at').eq('user_id', userId).maybeSingle()
      const timer = t && Math.floor(new Date(t.started_at).getTime() / 1000) === epoch ? t : null
      const openButton = (taskId?: string) =>
        taskId && appUrl ? { inline_keyboard: [[{ text: 'Открыть в Semternity', url: `${appUrl}/tasks/${taskId}` }]] } : undefined
      if (!timer) {
        await answer('Этот учёт уже остановлен')
        await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => {})
        return
      }
      if (action === 'keep') {
        await answer('Хорошо, напомню через час')
        await tg('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `${original}\n\n▶︎ Продолжаю — напомню через час`,
          reply_markup: openButton(timer.task_id),
        }).catch(() => {})
        return
      }
      const minutes = await stopTimer(userId, timer, timezone)
      if (minutes === null) {
        await answer('Этот учёт уже остановлен')
        return
      }
      const world = await loadWorld(db, userId)
      await answer(`Остановлено: ${hm(minutes)}`)
      // в сводке под кнопкой есть и другие — меняем не текст, а только эту кнопку
      if (markup && markup.inline_keyboard.length > 2) {
        const rows = markup.inline_keyboard.filter((row) => !row.some((b) => b.callback_data === data))
        await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: rows } }).catch(() => {})
        await say(chatId, `⏹ Учёт остановлен: «${world.title(timer.task_id)}» — ${hm(minutes)}`)
      } else {
        await tg('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `⏹ Учёт остановлен\n«${world.title(timer.task_id)}» — записано ${hm(minutes)}`,
          reply_markup: openButton(timer.task_id),
        }).catch(() => {})
      }
      return
    }

    if (action === 'go') {
      const { data: task } = await db.from('tasks').select('id').eq('id', a1).eq('user_id', userId).maybeSingle()
      if (!task) {
        await answer('Задача не найдена')
        return
      }
      const r = await startTimer(userId, a1, timezone)
      const world = await loadWorld(db, userId)
      const epoch = Math.floor(new Date(r.started_at).getTime() / 1000)
      await answer('Учёт начат')
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text:
          (r.stopped ? `⏹ «${world.title(r.stopped.taskId)}» — записано ${hm(r.stopped.minutes)}\n` : '') +
          `▶ Идёт учёт: «${world.title(a1)}»`,
        reply_markup: {
          inline_keyboard: [[{ text: '⏹ Остановить', callback_data: `stop:${epoch}` }], openApp(`/tasks/${a1}`)].filter((x) => x.length),
        },
      }).catch(() => {})
      return
    }

    if (action === 'cm') {
      const { data: me } = await db.from('telegram_accounts').select('pending_comment').eq('user_id', userId).maybeSingle()
      const body = me?.pending_comment
      await db.from('telegram_accounts').update({ pending_comment: null }).eq('user_id', userId)
      if (a1 === 'none' || !body) {
        await answer(body ? 'Не добавляю' : 'Комментарий уже не ждёт')
        await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => {})
        return
      }
      const { data: task } = await db.from('tasks').select('id, name').eq('id', a1).eq('user_id', userId).maybeSingle()
      if (!task) {
        await answer('Задача не найдена')
        return
      }
      await db.from('comments').insert({ user_id: userId, task_id: a1, body })
      await answer('Комментарий добавлен')
      await tg('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: `💬 Добавил комментарий к «${task.name.trim()}»`,
      }).catch(() => {})
      return
    }

    // ── встречи: засчитать в предложенную или выбранную задачу, пропустить, начать учёт
    const eventId = Number(a1)
    if (['lg', 'lt', 'pk', 'sk', 'mt'].includes(action) && Number.isFinite(eventId)) {
      const { data: ev } = await db
        .from('calendar_events')
        .select('id, title, status, suggested_task_id, starts_at')
        .eq('id', eventId)
        .eq('user_id', userId)
        .maybeSingle()
      if (!ev) {
        await answer('Встреча не найдена')
        return
      }
      if (action === 'sk') {
        await db.from('calendar_events').update({ status: 'dismissed' }).eq('id', eventId).eq('status', 'new')
        await answer('Не учитываю')
        await dropEventButtons(chatId, messageId, markup, eventId)
        return
      }
      if (action === 'lg' || action === 'lt') {
        const taskId = action === 'lt' ? a2 : ev.suggested_task_id
        if (!taskId) {
          await answer('Выберите задачу')
          return
        }
        const r = await logMeeting(userId, eventId, taskId, timezone)
        if ('error' in r) {
          await answer(r.error!)
          await dropEventButtons(chatId, messageId, markup, eventId)
          return
        }
        const world = await loadWorld(db, userId)
        await answer(`Записано ${hm(r.minutes!)} в «${cut(world.title(taskId), 30)}»`)
        if (action === 'lt') {
          // выбор задачи открывался отдельным сообщением — заменяем его итогом
          await tg('editMessageText', {
            chat_id: chatId,
            message_id: messageId,
            text: `✓ «${cut(ev.title, 60)}» — ${hm(r.minutes!)} в «${world.title(taskId)}»`,
          }).catch(() => {})
        } else {
          await dropEventButtons(chatId, messageId, markup, eventId)
        }
        return
      }
      if (action === 'pk') {
        const world = await loadWorld(db, userId)
        const ids = await recentTasks(userId, world, 6)
        if (ev.suggested_task_id && !ids.includes(ev.suggested_task_id) && world.byId.has(ev.suggested_task_id)) {
          ids.unshift(ev.suggested_task_id)
        }
        await answer('Выберите задачу')
        await say(chatId, `Куда засчитать «${cut(ev.title, 60)}» (${clock(ev.starts_at, timezone)})?`, {
          reply_markup: {
            inline_keyboard: [
              ...ids.slice(0, 6).map((id) => [{ text: cut(world.title(id), 48), callback_data: `lt:${eventId}:${id}` }]),
              [{ text: 'Не учитывать', callback_data: `sk:${eventId}` }],
            ],
          },
        })
        return
      }
      if (action === 'mt') {
        // встреча началась — учёт по задаче встречи прямо сейчас
        const taskId = ev.suggested_task_id
        if (!taskId) {
          await answer('Выберите задачу')
          return
        }
        const r = await startTimer(userId, taskId, timezone)
        const world = await loadWorld(db, userId)
        const epoch = Math.floor(new Date(r.started_at).getTime() / 1000)
        await answer('Учёт начат')
        await tg('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `${original}\n\n▶ Идёт учёт: «${world.title(taskId)}»`,
          reply_markup: { inline_keyboard: [[{ text: '⏹ Остановить', callback_data: `stop:${epoch}` }]] },
        }).catch(() => {})
        return
      }
    }
    await answer('Эта кнопка устарела')
  }

  // ── 2. расписание: настройка бота и сводки ────────────────────────
  if (secret.cron_secret && req.headers.get('x-cron-secret') === secret.cron_secret) {
    const body = await req.json().catch(() => ({}))
    if (body?.action === 'setup') {
      const me = await tg('getMe', {})
      const hook = secret.telegram_webhook_secret || randomCode(24)
      await db.from('app_secrets').upsert([
        { name: 'telegram_bot_username', value: me.username },
        { name: 'telegram_webhook_secret', value: hook },
      ])
      await tg('setWebhook', {
        url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/telegram`,
        secret_token: hook,
        allowed_updates: ['message', 'callback_query'],
        drop_pending_updates: true,
      })
      await tg('setMyDescription', {
        description:
          'Уведомления Semternity: итоги дня и недели, напоминание о долгом учёте и о встречах, учёт и комментарии прямо из чата. Подключение — в приложении: Профиль → Telegram.',
      }).catch(() => {})
      await tg('setMyCommands', {
        commands: [
          { command: 'timer', description: 'Начать или остановить учёт' },
          { command: 'today', description: 'Итоги дня' },
          { command: 'week', description: 'Итоги недели' },
        ],
      }).catch(() => {})
      return json({ ok: true, username: me.username })
    }

    if (body?.action === 'digest') {
      // проверка без отправки: собрать сводку конкретному пользователю и вернуть текст
      if (body.dry_run && body.user_id) {
        const { data: acc } = await db.from('telegram_accounts').select('timezone').eq('user_id', body.user_id).maybeSingle()
        const tz = acc?.timezone ?? 'Europe/Moscow'
        const date = String(body.date ?? localDate(new Date(), tz))
        const daily = await dailyDigest(String(body.user_id), tz, date, false)
        const weekly = await weeklyDigest(String(body.user_id), date)
        const panel = await timerPanel(String(body.user_id))
        return json({ daily, weekly, panel })
      }
      if (!token) return json({ ok: true, sent: 0 })
      const { data: accounts } = await db
        .from('telegram_accounts')
        .select('user_id, chat_id, timezone, daily_summary, weekly_summary, summary_hour, last_daily_on, last_weekly_on')
      let sent = 0
      const now = new Date()
      for (const acc of accounts ?? []) {
        const { hour, weekday } = localParts(now, acc.timezone)
        if (hour !== acc.summary_hour) continue
        const today = localDate(now, acc.timezone)
        if (acc.daily_summary && acc.last_daily_on !== today) {
          // отметка до отправки: два наложившихся запуска не пришлют сводку дважды
          const { data: claimed } = await db
            .from('telegram_accounts')
            .update({ last_daily_on: today })
            .eq('user_id', acc.user_id)
            .or(`last_daily_on.is.null,last_daily_on.neq.${today}`)
            .select('user_id')
          if (claimed?.length) {
            const d = await dailyDigest(acc.user_id, acc.timezone, today)
            if (d.worthSending) {
              await say(acc.chat_id, d.text, { reply_markup: d.keyboard })
              sent++
            }
          }
        }
        if (acc.weekly_summary && weekday === 5 && acc.last_weekly_on !== today) {
          const { data: claimed } = await db
            .from('telegram_accounts')
            .update({ last_weekly_on: today })
            .eq('user_id', acc.user_id)
            .or(`last_weekly_on.is.null,last_weekly_on.neq.${today}`)
            .select('user_id')
          if (claimed?.length) {
            const w = await weeklyDigest(acc.user_id, today)
            await say(acc.chat_id, w.text, { reply_markup: w.keyboard })
            sent++
          }
        }
      }
      return json({ ok: true, sent })
    }
    return json({ error: 'unknown action' }, 400)
  }

  // ── 3. действия из приложения ─────────────────────────────────────
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await db.auth.getUser(jwt)
  const user = auth?.user
  if (!user) return json({ error: 'forbidden' }, 403)
  const body = await req.json().catch(() => ({}))
  const configured = !!token && !!botUsername

  const { data: account } = await db
    .from('telegram_accounts')
    .select('chat_id, username, first_name, notify_long_timer, daily_summary, weekly_summary, summary_hour, notify_meetings')
    .eq('user_id', user.id)
    .maybeSingle()

  switch (body?.action) {
    case 'status':
      return json({
        configured,
        bot: botUsername,
        linked: account
          ? {
              username: account.username,
              firstName: account.first_name,
              notifyLongTimer: account.notify_long_timer,
              dailySummary: account.daily_summary,
              weeklySummary: account.weekly_summary,
              summaryHour: account.summary_hour,
              notifyMeetings: account.notify_meetings,
            }
          : null,
      })

    case 'link': {
      if (!configured) return json({ error: 'Бот ещё не настроен' }, 409)
      await db.from('telegram_link_codes').delete().eq('user_id', user.id)
      const code = randomCode()
      const timezone = typeof body.timezone === 'string' && body.timezone.length < 64 ? body.timezone : 'Europe/Moscow'
      const { error } = await db.from('telegram_link_codes').insert({ code, user_id: user.id, timezone })
      if (error) return json({ error: error.message }, 500)
      return json({ url: `https://t.me/${botUsername}?start=${code}` })
    }

    case 'test': {
      if (!account) return json({ error: 'Telegram не подключён' }, 409)
      try {
        await tg('sendMessage', {
          chat_id: account.chat_id,
          text: '👋 Это пробное сообщение Semternity. Если учёт пойдёт дольше часа — напишу сюда.\n\n' + HELP,
        })
      } catch (e) {
        const reason = String(e)
        console.error('test', reason)
        const message = /blocked/i.test(reason)
          ? 'Бот заблокирован в Telegram — разблокируйте его и попробуйте снова'
          : /chat not found|deactivated/i.test(reason)
            ? 'Чат с ботом не найден — подключите Telegram заново'
            : 'Telegram не принял сообщение — попробуйте ещё раз чуть позже'
        return json({ error: message }, 502)
      }
      return json({ ok: true })
    }

    case 'digest_now': {
      if (!account) return json({ error: 'Telegram не подключён' }, 409)
      const { data: acc } = await db.from('telegram_accounts').select('timezone').eq('user_id', user.id).maybeSingle()
      const tz = acc?.timezone ?? 'Europe/Moscow'
      const d = await dailyDigest(user.id, tz, localDate(new Date(), tz))
      try {
        await tg('sendMessage', { chat_id: account.chat_id, text: d.text, reply_markup: d.keyboard, disable_web_page_preview: true })
      } catch {
        return json({ error: 'Telegram не принял сообщение — попробуйте ещё раз чуть позже' }, 502)
      }
      return json({ ok: true })
    }

    case 'insight':
      return json({ insight: await dayInsight(user.id, 'app') })

    case 'unlink': {
      if (account) {
        await db.from('telegram_accounts').delete().eq('user_id', user.id)
        await say(account.chat_id, 'Уведомления Semternity отключены. Подключить снова — в приложении: Профиль → Telegram.')
      }
      return json({ ok: true })
    }

    default:
      return json({ error: 'unknown action' }, 400)
  }
})
