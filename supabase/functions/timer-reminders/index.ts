// Напоминания о долгом учёте и о начале встречи из календаря — пуш-уведомлением и в Telegram
// (если подключён). Работают, даже когда приложение закрыто и экран заблокирован. Функцию раз в минуту вызывает
// pg_cron (заголовок x-cron-secret); из приложения её же вызывают с action: 'test',
// чтобы прислать пробное уведомление.
//
// Ключи VAPID и пароль расписания лежат в таблице app_secrets: RLS закрывает её от всех,
// кроме сервисного ключа этой функции. В репозиторий они не попадают.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Sub {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: rows, error } = await db.from('app_secrets').select('name, value')
  if (error) return json({ error: error.message }, 500)
  const secret = Object.fromEntries((rows ?? []).map((r: { name: string; value: string }) => [r.name, r.value]))
  webpush.setVapidDetails(secret.vapid_subject, secret.vapid_public, secret.vapid_private)
  const appUrl = secret.app_url ?? secret.vapid_subject ?? ''

  /** сообщение в Telegram, если пользователь подключил бота и не выключил этот вид уведомлений */
  async function telegramTo(
    userId: string,
    text: string,
    keyboard?: unknown,
    kind: 'notify_long_timer' | 'notify_meetings' = 'notify_long_timer',
  ) {
    const token = secret.telegram_bot_token
    if (!token) return false
    const { data: acc } = await db
      .from('telegram_accounts')
      .select('chat_id, notify_long_timer, notify_meetings')
      .eq('user_id', userId)
      .maybeSingle()
    if (!acc?.[kind]) return false
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: acc.chat_id, text, reply_markup: keyboard, disable_web_page_preview: true }),
    })
    const j = await r.json().catch(() => ({ ok: false }))
    if (!j.ok) console.error('telegram failed', j.description)
    return !!j.ok
  }

  /** отправить на все устройства пользователя; мёртвые подписки — удалить */
  async function sendTo(userId: string, payload: Record<string, unknown>) {
    const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
    let sent = 0
    let removed = 0
    const failed: number[] = []
    for (const sub of (subs ?? []) as Sub[]) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 3600, urgency: 'high' },
        )
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode ?? 0
        // 404/410 — подписка больше не существует (приложение удалили, разрешение сняли)
        if (code === 404 || code === 410) {
          await db.from('push_subscriptions').delete().eq('id', sub.id)
          removed++
        } else {
          failed.push(code)
          console.error('push failed', code, (e as { body?: string }).body)
        }
      }
    }
    return { devices: subs?.length ?? 0, sent, removed, failed }
  }

  // ── пробное уведомление из настроек: от имени вошедшего пользователя
  if (req.headers.get('x-cron-secret') !== secret.cron_secret) {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
    const { data: auth } = await db.auth.getUser(token)
    if (!auth?.user) return json({ error: 'forbidden' }, 403)
    const body = await req.json().catch(() => ({}))
    if (body?.action !== 'test') return json({ error: 'unknown action' }, 400)
    const result = await sendTo(auth.user.id, {
      title: 'Semternity',
      body: 'Уведомления работают: напомним, если учёт идёт больше часа.',
      url: '/settings',
      tag: 'semternity-test',
    })
    return json(result)
  }

  // ── напоминания по расписанию
  const { data: timers } = await db.from('active_timers').select('user_id, task_id, started_at, reminded_hours')
  const now = Date.now()
  let reminded = 0
  for (const t of timers ?? []) {
    const hours = Math.floor((now - new Date(t.started_at).getTime()) / 3_600_000)
    if (hours < 1 || hours <= t.reminded_hours) continue
    // сначала «застолбить» напоминание: два наложившихся запуска не пришлют его дважды
    const { data: claimed } = await db
      .from('active_timers')
      .update({ reminded_hours: hours })
      .eq('user_id', t.user_id)
      .eq('started_at', t.started_at)
      .lt('reminded_hours', hours)
      .select('user_id')
    if (!claimed?.length) continue

    const { data: task } = await db.from('tasks').select('name').eq('id', t.task_id).maybeSingle()
    const title = hours === 1 ? 'Учёт идёт уже больше часа' : `Учёт идёт уже ${hours} ч`
    const taskName = task?.name?.trim() ?? 'Задача'
    await sendTo(t.user_id, {
      title,
      body: `«${taskName}» — вы всё ещё работаете?`,
      url: `/tasks/${t.task_id}`,
      tag: 'semternity-reminder',
    })
    // в Telegram — с кнопками: остановить можно прямо из чата. В кнопке — время начала
    // сеанса, чтобы она не остановила уже другой, более поздний учёт
    const epoch = Math.floor(new Date(t.started_at).getTime() / 1000)
    const keyboard = {
      inline_keyboard: [
        [
          { text: '⏹ Остановить учёт', callback_data: `stop:${epoch}` },
          { text: '▶︎ Ещё работаю', callback_data: `keep:${epoch}` },
        ],
        ...(appUrl ? [[{ text: 'Открыть в Semternity', url: `${appUrl}/tasks/${t.task_id}` }]] : []),
      ],
    }
    await telegramTo(t.user_id, `⏱ ${title}\n«${taskName}» — вы всё ещё работаете?`, keyboard)
    reminded++
  }

  // ── встреча из календаря началась, а учёт не идёт
  const running = new Set((timers ?? []).map((t) => t.user_id))
  const { data: meetings } = await db
    .from('calendar_events')
    .select('id, user_id, title, starts_at, ends_at, suggested_task_id')
    .eq('status', 'new')
    .eq('reminded', false)
    .lte('starts_at', new Date(now + 60_000).toISOString())
    .gte('starts_at', new Date(now - 5 * 60_000).toISOString())
  let meetingReminders = 0
  for (const ev of meetings ?? []) {
    // отметка до отправки: наложившиеся запуски не напомнят дважды
    const { data: claimed } = await db
      .from('calendar_events')
      .update({ reminded: true })
      .eq('id', ev.id)
      .eq('reminded', false)
      .select('id')
    if (!claimed?.length || running.has(ev.user_id)) continue
    const { data: task } = ev.suggested_task_id
      ? await db.from('tasks').select('id, name').eq('id', ev.suggested_task_id).maybeSingle()
      : { data: null }
    const question = task ? `Начать учёт по «${task.name.trim()}»?` : 'Начать учёт?'
    const { data: prefs } = await db.from('user_settings').select('meeting_reminders').eq('user_id', ev.user_id).maybeSingle()
    if (prefs?.meeting_reminders !== false) {
      await sendTo(ev.user_id, {
        title: `Началась встреча · ${ev.title}`,
        body: question,
        url: task ? `/tasks/${task.id}` : '/',
        tag: `semternity-meeting-${ev.id}`,
      })
    }
    const keyboard = {
      inline_keyboard: [
        task
          ? [{ text: `▶ Начать учёт: ${task.name.trim().slice(0, 30)}`, callback_data: `mt:${ev.id}` }]
          : [{ text: '▶ Выбрать задачу', callback_data: `pk:${ev.id}` }],
        [{ text: 'Не учитывать', callback_data: `sk:${ev.id}` }],
      ],
    }
    await telegramTo(ev.user_id, `📅 Началась встреча «${ev.title}»\n${question}`, keyboard, 'notify_meetings')
    meetingReminders++
  }
  return json({ active: timers?.length ?? 0, reminded, meetingReminders })
})
