// Telegram-бот Semternity. Одна функция на три входа:
//   • вебхук Telegram — заголовок X-Telegram-Bot-Api-Secret-Token: /start с кодом привязки
//     и нажатия кнопок под напоминанием («Остановить учёт», «Ещё работаю»);
//   • настройка — заголовок x-cron-secret и action: 'setup': узнать имя бота и поставить вебхук;
//   • приложение — токен вошедшего пользователя: status, link, test, unlink.
//
// Токен бота, имя бота и пароль вебхука лежат в app_secrets (RLS без политик),
// в репозиторий не попадают.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
/** код привязки живёт полчаса */
const CODE_TTL_MS = 30 * 60 * 1000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function randomCode(bytes = 18): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** «1 ч 12 мин», «45 мин» */
function hm(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} мин`
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

/** YYYY-MM-DD в часовом поясе пользователя — день, к которому относится запись */
function localDate(d: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
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
          await say(
            chatId,
            'Ссылка устарела или неверная. Откройте Semternity → Ещё → Telegram и нажмите «Подключить» ещё раз.',
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
          '✅ Semternity подключён.\n\nНапишу, если учёт идёт дольше часа, — с кнопками «Остановить учёт» и «Ещё работаю». Выключить можно в приложении: Ещё → Telegram.',
        )
        return
      }
      await say(chatId, 'Я присылаю уведомления Semternity. Подключение и настройки — в приложении: Ещё → Telegram.')
      return
    }

    const cq = update.callback_query
    if (cq?.id) {
      const chatId = cq.message?.chat?.id as number
      const messageId = cq.message?.message_id as number
      const original = String(cq.message?.text ?? '')
      const [action, epochRaw] = String(cq.data ?? '').split(':')
      const epoch = Number(epochRaw)

      // чей это чат; таймер ищем только среди его владельцев и только тот самый сеанс
      const { data: accounts } = await db.from('telegram_accounts').select('user_id, timezone').eq('chat_id', chatId)
      let timer: { user_id: string; task_id: string; started_at: string } | null = null
      let timezone = 'Europe/Moscow'
      for (const a of accounts ?? []) {
        const { data: t } = await db.from('active_timers').select('user_id, task_id, started_at').eq('user_id', a.user_id).maybeSingle()
        if (t && Math.floor(new Date(t.started_at).getTime() / 1000) === epoch) {
          timer = t
          timezone = a.timezone
          break
        }
      }

      const openButton = (taskId?: string) =>
        taskId && appUrl ? { inline_keyboard: [[{ text: 'Открыть в Semternity', url: `${appUrl}/tasks/${taskId}` }]] } : undefined

      if (!timer) {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Этот учёт уже остановлен' }).catch(() => {})
        await tg('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => {})
        return
      }

      if (action === 'keep') {
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Хорошо, напомню через час' }).catch(() => {})
        await tg('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `${original}\n\n▶︎ Продолжаю — напомню через час`,
          reply_markup: openButton(timer.task_id),
        }).catch(() => {})
        return
      }

      if (action === 'stop') {
        // сначала забираем таймер — если его уже остановили в приложении, второй записи не будет
        const { data: taken } = await db
          .from('active_timers')
          .delete()
          .eq('user_id', timer.user_id)
          .eq('started_at', timer.started_at)
          .select('user_id')
        if (!taken?.length) {
          await tg('answerCallbackQuery', { callback_query_id: cq.id, text: 'Этот учёт уже остановлен' }).catch(() => {})
          return
        }
        const started = new Date(timer.started_at)
        const ended = new Date()
        const minutes = Math.max(0, Math.round((ended.getTime() - started.getTime()) / 60_000))
        await db.from('time_entries').insert({
          user_id: timer.user_id,
          task_id: timer.task_id,
          entry_type: 'timer',
          started_at: timer.started_at,
          ended_at: ended.toISOString(),
          duration_minutes: minutes,
          effective_date: localDate(started, timezone),
        })
        const { data: task } = await db.from('tasks').select('name').eq('id', timer.task_id).maybeSingle()
        await tg('answerCallbackQuery', { callback_query_id: cq.id, text: `Остановлено: ${hm(minutes)}` }).catch(() => {})
        await tg('editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: `⏹ Учёт остановлен\n«${task?.name?.trim() ?? 'Задача'}» — записано ${hm(minutes)}`,
          reply_markup: openButton(timer.task_id),
        }).catch(() => {})
      }
    }
  }

  // ── 2. настройка бота (один раз, после того как токен положен в app_secrets) ──
  if (req.headers.get('x-cron-secret') === secret.cron_secret) {
    const body = await req.json().catch(() => ({}))
    if (body?.action !== 'setup') return json({ error: 'unknown action' }, 400)
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
      description: 'Уведомления Semternity: предупреждаю, если учёт времени идёт дольше часа. Подключение — в приложении: Ещё → Telegram.',
    }).catch(() => {})
    return json({ ok: true, username: me.username })
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
    .select('chat_id, username, first_name, notify_long_timer')
    .eq('user_id', user.id)
    .maybeSingle()

  switch (body?.action) {
    case 'status':
      return json({
        configured,
        bot: botUsername,
        linked: account
          ? { username: account.username, firstName: account.first_name, notifyLongTimer: account.notify_long_timer }
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
          text: '👋 Это пробное сообщение Semternity. Если учёт пойдёт дольше часа — напишу сюда.',
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

    case 'unlink': {
      if (account) {
        await db.from('telegram_accounts').delete().eq('user_id', user.id)
        await say(account.chat_id, 'Уведомления Semternity отключены. Подключить снова — в приложении: Ещё → Telegram.')
      }
      return json({ ok: true })
    }

    default:
      return json({ error: 'unknown action' }, 400)
  }
})
