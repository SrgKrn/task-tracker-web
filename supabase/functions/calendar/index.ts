// Календарь: встречи из Google Календаря — через вход в Google (основной способ, ключ обновления
// из google_accounts) или из любого календаря по секретной iCal-ссылке. Одна функция на три входа:
//   • расписание (x-cron-secret, action: 'sync') — раз в 15 минут перечитывает все календари;
//     с user_id — только календари этого пользователя (сразу после входа в Google);
//   • приложение (токен пользователя) — подключить ссылку или Google Календарь, обновить сейчас,
//     отключить, получить ссылку на ленту учёта;
//   • лента учёта (GET ?feed=ключ) — сессии и сроки задач в формате iCal: на неё
//     подписываются в календаре, и учёт виден рядом со встречами.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'
import ICAL from 'npm:ical.js@2.1.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
/** встречи берём с недели назад до трёх дней вперёд: засчитать прошедшие и напомнить о ближайших */
const BACK_DAYS = 7
const AHEAD_DAYS = 3
/** длиннее — это не встреча, а «отпуск» или «в офисе» */
const MAX_EVENT_HOURS = 12
const MAX_ICS_BYTES = 8 * 1024 * 1024
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

/** «Планёрка 12.10 — Ромашка!» → «планерка ромашка»: так одинаковые встречи узнаются */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeUrl(raw: string): string {
  const url = raw.trim().replace(/^webcal:\/\//i, 'https://')
  const parsed = new URL(url)
  if (parsed.protocol !== 'https:') throw new Error('Нужна ссылка, начинающаяся с https://')
  return parsed.toString()
}

async function fetchIcs(url: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'text/calendar, */*' } })
    if (r.status === 404 || r.status === 403 || r.status === 401) {
      throw new Error('Календарь по ссылке не открылся — проверьте, что это секретный адрес в формате iCal')
    }
    if (!r.ok) throw new Error(`Календарь не ответил (${r.status}) — попробуем позже`)
    const text = await r.text()
    if (text.length > MAX_ICS_BYTES) throw new Error('Календарь слишком большой')
    if (!text.includes('BEGIN:VCALENDAR')) {
      throw new Error('По ссылке не календарь — нужен «Секретный адрес в формате iCal»')
    }
    return text
  } finally {
    clearTimeout(timer)
  }
}

interface Occurrence {
  uid: string
  start: Date
  end: Date
  title: string
}

/** Встречи календаря в окне [from, to]: с повторами, переносами и отменами отдельных встреч. */
function occurrences(text: string, from: Date, to: Date): { name: string; list: Occurrence[] } {
  const comp = new ICAL.Component(ICAL.parse(text))
  for (const tz of comp.getAllSubcomponents('vtimezone')) {
    try {
      ICAL.TimezoneService.register(tz)
    } catch {
      // незнакомый пояс — такие встречи просто прочитаются по UTC
    }
  }
  const name = String(comp.getFirstPropertyValue('x-wr-calname') ?? '')
  const masters = new Map<string, InstanceType<typeof ICAL.Event>>()
  const exceptions: InstanceType<typeof ICAL.Event>[] = []
  for (const v of comp.getAllSubcomponents('vevent')) {
    const ev = new ICAL.Event(v)
    if (!ev.uid) continue
    if (ev.isRecurrenceException()) exceptions.push(ev)
    else masters.set(ev.uid, ev)
  }
  for (const exc of exceptions) {
    const master = masters.get(exc.uid)
    if (master) master.relateException(exc)
    else masters.set(`${exc.uid}#${exc.recurrenceId}`, exc)
  }

  const cancelled = (c: InstanceType<typeof ICAL.Component>) =>
    String(c.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED'
  const list: Occurrence[] = []
  const push = (uid: string, s: Date, e: Date, title: string) => {
    const hours = (e.getTime() - s.getTime()) / 3_600_000
    if (hours <= 0 || hours > MAX_EVENT_HOURS) return
    if (e < from || s > to) return
    list.push({ uid, start: s, end: e, title: title.trim() || 'Без названия' })
  }

  for (const ev of masters.values()) {
    if (cancelled(ev.component)) continue
    // целый день — это не встреча, учитывать нечего
    if (ev.startDate?.isDate) continue
    if (ev.isRecurring()) {
      const it = ev.iterator()
      let next
      let guard = 0
      while ((next = it.next()) && guard++ < 5000) {
        const details = ev.getOccurrenceDetails(next)
        const s = details.startDate.toJSDate()
        if (s > to) break
        if (cancelled(details.item.component)) continue
        push(ev.uid, s, details.endDate.toJSDate(), String(details.item.summary ?? ''))
      }
    } else {
      push(ev.uid, ev.startDate.toJSDate(), ev.endDate.toJSDate(), String(ev.summary ?? ''))
    }
  }
  return { name, list }
}

/* ── Google Календарь через API ──────────────────────────────────── */

interface GoogleCreds {
  clientId: string
  clientSecret: string
}

interface GoogleEvent {
  id: string
  status?: string
  summary?: string
  eventType?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { self?: boolean; responseStatus?: string }[]
}

async function googleAccessToken(db: SupabaseClient, userId: string, creds: GoogleCreds): Promise<string> {
  const { data: acc } = await db.from('google_accounts').select('refresh_token, scope').eq('user_id', userId).maybeSingle()
  if (!acc) throw new Error('Вход в Google отключён — войдите через Google заново')
  if (!acc.scope.includes(GOOGLE_CALENDAR_SCOPE)) {
    throw new Error('Нет разрешения читать календарь — войдите через Google ещё раз')
  }
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: acc.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) {
    if (j.error === 'invalid_grant') throw new Error('Доступ к Google отозван или истёк — войдите через Google заново')
    throw new Error('Google не выдал доступ — попробуем позже')
  }
  return j.access_token as string
}

/** Встречи основного календаря в окне [from, to]: повторы Google разворачивает сам (singleEvents). */
async function googleOccurrences(
  db: SupabaseClient,
  userId: string,
  creds: GoogleCreds,
  from: Date,
  to: Date,
): Promise<{ name: string; list: Occurrence[] }> {
  const token = await googleAccessToken(db, userId, creds)
  const list: Occurrence[] = []
  let name = ''
  let pageToken = ''
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      maxResults: '2500',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      const reason = String(j?.error?.errors?.[0]?.reason ?? j?.error?.status ?? '')
      const message = String(j?.error?.message ?? '')
      console.error('google events', r.status, reason, message)
      if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /has not been used|is disabled/i.test(message)) {
        throw new Error('В проекте Google Cloud не включён Google Calendar API')
      }
      if (r.status === 401 || r.status === 403) throw new Error('Google не дал прочитать календарь — войдите через Google заново')
      throw new Error(`Google Календарь не ответил (${r.status}) — попробуем позже`)
    }
    name = name || String(j.summary ?? '')
    for (const ev of (j.items ?? []) as GoogleEvent[]) {
      if (ev.status === 'cancelled') continue
      // целый день, «работаю из…», «нет на месте», «время для работы» — не встречи
      if (!ev.start?.dateTime || !ev.end?.dateTime) continue
      if (ev.eventType && ev.eventType !== 'default' && ev.eventType !== 'fromGmail') continue
      // встречу отклонили — учитывать нечего
      if (ev.attendees?.some((a) => a.self && a.responseStatus === 'declined')) continue
      const s = new Date(ev.start.dateTime)
      const e = new Date(ev.end.dateTime)
      const hours = (e.getTime() - s.getTime()) / 3_600_000
      if (hours <= 0 || hours > MAX_EVENT_HOURS) continue
      list.push({ uid: ev.id, start: s, end: e, title: String(ev.summary ?? '').trim() || 'Без названия' })
    }
    pageToken = String(j.nextPageToken ?? '')
    if (!pageToken) break
  }
  return { name, list }
}

/* ── какую задачу предложить для встречи ─────────────────────────── */

interface TaskRow {
  id: string
  name: string
  item_ids: string[]
  status_id: string | null
  parent_id: string | null
  duplicated_from: string | null
  created_at: string
}

async function suggestFor(db: SupabaseClient, userId: string) {
  const [{ data: tasks }, { data: statuses }, { data: rules }, { data: items }, { data: events }] = await Promise.all([
    db.from('tasks').select('id, name, item_ids, status_id, parent_id, duplicated_from, created_at').eq('user_id', userId),
    db.from('statuses').select('id, is_final').eq('user_id', userId),
    db.from('calendar_rules').select('title_key, task_id').eq('user_id', userId),
    db.from('group_items').select('id, name, archived').eq('user_id', userId),
    db.from('calendar_events').select('id, title, suggested_task_id').eq('user_id', userId).eq('status', 'new'),
  ])
  const final = new Set((statuses ?? []).filter((s) => s.is_final).map((s) => s.id))
  const all = (tasks ?? []) as TaskRow[]
  const byId = new Map(all.map((t) => [t.id, t]))
  const open = (t: TaskRow) => !t.status_id || !final.has(t.status_id)
  const newestFirst = (a: TaskRow, b: TaskRow) => b.created_at.localeCompare(a.created_at)

  /** задача из правила закрыта — берём её «новый период», если он есть */
  const latest = (taskId: string): string | null => {
    let t = byId.get(taskId)
    for (let guard = 0; t && guard < 50; guard++) {
      if (open(t)) return t.id
      const next = all.filter((x) => x.duplicated_from === t!.id && !x.parent_id).sort(newestFirst)[0]
      if (!next) break
      t = next
    }
    return null
  }
  const ruleMap = new Map((rules ?? []).map((r) => [r.title_key, r.task_id]))
  const names = (items ?? [])
    .filter((i) => !i.archived && titleKey(i.name).length >= 3)
    .map((i) => ({ id: i.id, key: titleKey(i.name) }))
    .sort((a, b) => b.key.length - a.key.length)

  for (const ev of events ?? []) {
    const key = titleKey(ev.title)
    let suggestion: string | null = null
    const ruled = ruleMap.get(key)
    if (ruled) suggestion = latest(ruled)
    if (!suggestion) {
      // в названии встречи есть имя проекта или клиента — свежая открытая задача с ним
      const padded = ` ${key} `
      const hit = names.find((n) => padded.includes(` ${n.key} `) || (n.key.length >= 5 && key.includes(n.key)))
      if (hit) {
        suggestion =
          all
            .filter((t) => !t.parent_id && open(t) && t.item_ids.includes(hit.id))
            .sort(newestFirst)[0]?.id ?? null
      }
    }
    if (suggestion !== ev.suggested_task_id) {
      await db.from('calendar_events').update({ suggested_task_id: suggestion }).eq('id', ev.id)
    }
  }
}

/* ── синхронизация ───────────────────────────────────────────────── */

interface Source {
  id: string
  user_id: string
  kind: 'ics' | 'google'
  url: string | null
}

const SOURCE_COLUMNS = 'id, user_id, kind, url'

async function syncSource(db: SupabaseClient, src: Source, creds: GoogleCreds): Promise<{ events: number; error?: string }> {
  const now = Date.now()
  const from = new Date(now - BACK_DAYS * 86_400_000)
  const to = new Date(now + AHEAD_DAYS * 86_400_000)
  try {
    const { name, list } =
      src.kind === 'google'
        ? await googleOccurrences(db, src.user_id, creds, from, to)
        : occurrences(await fetchIcs(src.url!), from, to)
    const rows = list.map((o) => ({
      user_id: src.user_id,
      source_id: src.id,
      uid: o.uid,
      starts_at: o.start.toISOString(),
      ends_at: o.end.toISOString(),
      title: o.title.slice(0, 500),
    }))
    // только эти поля: статус, задача и отметка о напоминании у известных встреч сохраняются
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db
        .from('calendar_events')
        .upsert(rows.slice(i, i + 200), { onConflict: 'source_id,uid,starts_at' })
      if (error) throw new Error(error.message)
    }
    // встречу отменили или перенесли — ещё не засчитанную убираем
    const keep = new Set(rows.map((r) => `${r.uid}|${new Date(r.starts_at).getTime()}`))
    const { data: existing } = await db
      .from('calendar_events')
      .select('id, uid, starts_at')
      .eq('source_id', src.id)
      .eq('status', 'new')
      .gte('starts_at', from.toISOString())
    const stale = (existing ?? [])
      .filter((e) => !keep.has(`${e.uid}|${new Date(e.starts_at).getTime()}`))
      .map((e) => e.id)
    if (stale.length) await db.from('calendar_events').delete().in('id', stale)
    // совсем старые незасчитанные встречи больше никому не нужны
    await db
      .from('calendar_events')
      .delete()
      .eq('source_id', src.id)
      .eq('status', 'new')
      .lt('starts_at', new Date(now - 30 * 86_400_000).toISOString())

    await db
      .from('calendar_sources')
      .update({ last_synced_at: new Date().toISOString(), last_error: null, ...(name ? { name } : {}) })
      .eq('id', src.id)
    return { events: rows.length }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    await db.from('calendar_sources').update({ last_error: message }).eq('id', src.id)
    return { events: 0, error: message }
  }
}

/* ── лента учёта для подписки ────────────────────────────────────── */

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** строки iCal длиннее 75 байт переносятся с пробелом в начале следующей */
function fold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const parts: string[] = []
  let cur = ''
  for (const ch of line) {
    if (enc.encode(cur + ch).length > (parts.length ? 74 : 75)) {
      parts.push(cur)
      cur = ch
    } else cur += ch
  }
  parts.push(cur)
  return parts.join('\r\n ')
}

const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const day = (iso: string) => iso.replace(/-/g, '')

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? (m ? `${h} ч ${m} мин` : `${h} ч`) : `${m} мин`
}

async function feed(db: SupabaseClient, token: string, appUrl: string): Promise<Response> {
  const { data: owner } = await db.from('user_settings').select('user_id').eq('calendar_feed_token', token).maybeSingle()
  if (!owner) return new Response('Not found', { status: 404 })
  const userId = owner.user_id as string
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const [{ data: entries }, { data: tasks }, { data: statuses }] = await Promise.all([
    db
      .from('time_entries')
      .select('id, task_id, started_at, ended_at, duration_minutes, note')
      .eq('user_id', userId)
      .eq('entry_type', 'timer')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(3000),
    db.from('tasks').select('id, name, parent_id, end_date, status_id').eq('user_id', userId),
    db.from('statuses').select('id, is_final').eq('user_id', userId),
  ])
  const final = new Set((statuses ?? []).filter((s) => s.is_final).map((s) => s.id))
  const byId = new Map((tasks ?? []).map((t) => [t.id, t]))
  const titleOf = (id: string) => {
    const t = byId.get(id)
    if (!t) return 'Задача'
    const parent = t.parent_id ? byId.get(t.parent_id) : undefined
    return parent ? `${parent.name.trim()} / ${t.name.trim()}` : t.name.trim()
  }
  const stamp = utc(new Date())
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Semternity//Учёт//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Semternity — учёт',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const e of entries ?? []) {
    if (!e.started_at || !e.ended_at) continue
    const note = e.note && e.note.trim() !== 'Manual correction' ? `\n${e.note.trim()}` : ''
    lines.push(
      'BEGIN:VEVENT',
      `UID:entry-${e.id}@semternity`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(new Date(e.started_at))}`,
      `DTEND:${utc(new Date(e.ended_at))}`,
      `SUMMARY:${icsEscape(`⏱ ${titleOf(e.task_id)}`)}`,
      `DESCRIPTION:${icsEscape(`Учёт: ${hm(e.duration_minutes)}${note}`)}`,
      ...(appUrl ? [`URL:${appUrl}/tasks/${e.task_id}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  for (const t of tasks ?? []) {
    if (!t.end_date || t.parent_id || (t.status_id && final.has(t.status_id))) continue
    const next = new Date(`${t.end_date}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    lines.push(
      'BEGIN:VEVENT',
      `UID:due-${t.id}@semternity`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(t.end_date)}`,
      `DTEND;VALUE=DATE:${day(next.toISOString().slice(0, 10))}`,
      `SUMMARY:${icsEscape(`⚑ Срок: ${t.name.trim()}`)}`,
      ...(appUrl ? [`URL:${appUrl}/tasks/${t.id}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return new Response(lines.map(fold).join('\r\n') + '\r\n', {
    headers: { ...CORS, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function randomToken(bytes = 24): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
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
  const appUrl = secret.app_url ?? secret.vapid_subject ?? ''
  const creds: GoogleCreds = { clientId: secret.google_client_id ?? '', clientSecret: secret.google_client_secret ?? '' }

  // ── лента учёта: календарь сам приходит за ней по ссылке
  const feedToken = new URL(req.url).searchParams.get('feed')
  if (req.method === 'GET' && feedToken) return feed(db, feedToken, appUrl)

  // ── расписание: перечитать все календари
  if (req.headers.get('x-cron-secret') === secret.cron_secret && secret.cron_secret) {
    const body = await req.json().catch(() => ({}))
    let query = db.from('calendar_sources').select(SOURCE_COLUMNS)
    if (typeof body?.user_id === 'string') query = query.eq('user_id', body.user_id)
    const { data: sources } = await query
    const users = new Set<string>()
    let events = 0
    let failed = 0
    for (const src of (sources ?? []) as Source[]) {
      const r = await syncSource(db, src, creds)
      events += r.events
      if (r.error) failed++
      users.add(src.user_id)
    }
    for (const u of users) await suggestFor(db, u)
    return json({ sources: sources?.length ?? 0, events, failed })
  }

  // ── приложение
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await db.auth.getUser(jwt)
  const user = auth?.user
  if (!user) return json({ error: 'forbidden' }, 403)
  const body = await req.json().catch(() => ({}))

  switch (body?.action) {
    case 'add': {
      let url: string
      try {
        url = normalizeUrl(String(body.url ?? ''))
      } catch (e) {
        return json({ error: e instanceof Error && /https/.test(e.message) ? e.message : 'Это не похоже на ссылку' }, 400)
      }
      // сначала проверяем, что по ссылке правда календарь
      try {
        occurrences(await fetchIcs(url), new Date(), new Date())
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : 'Календарь не открылся' }, 400)
      }
      const { data: src, error } = await db
        .from('calendar_sources')
        .upsert({ user_id: user.id, url }, { onConflict: 'user_id,url' })
        .select(SOURCE_COLUMNS)
        .single()
      if (error) return json({ error: error.message }, 500)
      const r = await syncSource(db, src as Source, creds)
      await suggestFor(db, user.id)
      return json({ ok: true, events: r.events, error: r.error ?? null })
    }

    case 'add_google': {
      // вход в Google с разрешением на календарь уже есть — показывать встречи снова
      const { data: acc } = await db.from('google_accounts').select('email, scope').eq('user_id', user.id).maybeSingle()
      if (!acc?.scope.includes(GOOGLE_CALENDAR_SCOPE)) return json({ error: 'Сначала войдите через Google' }, 409)
      const { data: existing } = await db
        .from('calendar_sources')
        .select(SOURCE_COLUMNS)
        .eq('user_id', user.id)
        .eq('kind', 'google')
        .maybeSingle()
      let src = existing as Source | null
      if (!src) {
        const { data, error } = await db
          .from('calendar_sources')
          .insert({ user_id: user.id, kind: 'google', name: acc.email || 'Google Календарь' })
          .select(SOURCE_COLUMNS)
          .single()
        if (error) return json({ error: error.message }, 500)
        src = data as Source
      }
      const r = await syncSource(db, src, creds)
      await suggestFor(db, user.id)
      return json({ ok: true, events: r.events, error: r.error ?? null })
    }

    case 'sync': {
      const { data: sources } = await db.from('calendar_sources').select(SOURCE_COLUMNS).eq('user_id', user.id)
      let events = 0
      const errors: string[] = []
      for (const src of (sources ?? []) as Source[]) {
        const r = await syncSource(db, src, creds)
        events += r.events
        if (r.error) errors.push(r.error)
      }
      await suggestFor(db, user.id)
      return json({ ok: true, events, errors })
    }

    case 'remove': {
      await db.from('calendar_sources').delete().eq('id', String(body.id ?? '')).eq('user_id', user.id)
      return json({ ok: true })
    }

    case 'feed': {
      const { data: s } = await db.from('user_settings').select('calendar_feed_token').eq('user_id', user.id).maybeSingle()
      let token = s?.calendar_feed_token as string | null | undefined
      if (!token || body.reset) {
        token = randomToken()
        const { error } = await db.from('user_settings').upsert({ user_id: user.id, calendar_feed_token: token })
        if (error) return json({ error: error.message }, 500)
      }
      return json({ url: `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar?feed=${token}` })
    }

    default:
      return json({ error: 'unknown action' }, 400)
  }
})
