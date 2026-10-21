// Уведомления об обращениях «Написать нам» (0.41).
//
// action 'submitted' — зовёт приложение пользователя сразу после отправки: админам приходит
// сообщение в Telegram (если у админа привязан бот). Проверяется, что обращение — его.
// action 'replied' — зовёт админка после ответа: автору приходит пуш на все устройства и
// сообщение в Telegram, если бот привязан. Проверяется, что зовёт админ.
//
// Доступ — по токену вошедшего пользователя (verify_jwt выключен, как у остальных функций:
// проверка в коде). Ключи VAPID и токен бота — в app_secrets, не в репозитории.
import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

const KIND: Record<string, string> = { idea: '💡 Идея', bug: '🐞 Ошибка', review: '⭐ Отзыв', other: '✉️ Другое' }
const PLAN: Record<string, string> = { free: 'Старт', plus: 'Плюс', pro: 'Про' }

interface Feedback {
  id: string
  user_id: string
  kind: string
  rating: number | null
  body: string
  screenshots: string[]
  app_version: string | null
  device: string | null
  plan: string | null
  reply: string | null
}

function cut(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await db.auth.getUser(token)
  if (!auth?.user) return json({ error: 'forbidden' }, 403)
  const caller = auth.user.id

  const body = await req.json().catch(() => ({}))
  const id = typeof body?.id === 'string' ? body.id : ''
  if (!id) return json({ error: 'no id' }, 400)

  const { data: rows } = await db.from('app_secrets').select('name, value')
  const secret = Object.fromEntries((rows ?? []).map((r: { name: string; value: string }) => [r.name, r.value]))
  const appUrl = (secret.app_url ?? secret.vapid_subject ?? '').replace(/\/$/, '')

  const { data: fb } = await db.from('feedback').select('*').eq('id', id).maybeSingle<Feedback>()
  if (!fb) return json({ error: 'not found' }, 404)

  async function telegram(chatId: number | string, text: string, url?: string) {
    if (!secret.telegram_bot_token) return false
    const keyboard = url && url.startsWith('https://') ? { inline_keyboard: [[{ text: 'Открыть', url }]] } : undefined
    const r = await fetch(`https://api.telegram.org/bot${secret.telegram_bot_token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup: keyboard, disable_web_page_preview: true }),
    })
    const j = await r.json().catch(() => ({ ok: false }))
    if (!j.ok) console.error('telegram failed', j.description)
    return !!j.ok
  }

  // ── новое обращение → админам в Telegram
  if (body.action === 'submitted') {
    if (fb.user_id !== caller) return json({ error: 'forbidden' }, 403)
    const { data: admins } = await db.from('admins').select('user_id')
    const adminIds = (admins ?? []).map((a: { user_id: string }) => a.user_id)
    if (!adminIds.length) return json({ telegram: 0 })
    const { data: chats } = await db.from('telegram_accounts').select('chat_id').in('user_id', adminIds)
    const { data: who } = await db.auth.admin.getUserById(fb.user_id)
    const { data: settings } = await db.from('user_settings').select('display_name').eq('user_id', fb.user_id).maybeSingle()
    const name = settings?.display_name ? `${settings.display_name} · ` : ''
    const meta = [
      fb.rating ? '★'.repeat(fb.rating) + '☆'.repeat(5 - fb.rating) : '',
      fb.plan ? PLAN[fb.plan] ?? fb.plan : '',
      fb.app_version ? `v${fb.app_version}` : '',
      fb.device ?? '',
      fb.screenshots.length ? `скриншотов: ${fb.screenshots.length}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
    const text = `${KIND[fb.kind] ?? fb.kind}\n${name}${who?.user?.email ?? ''}\n${meta}\n\n${cut(fb.body, 3000)}`
    let sent = 0
    for (const c of chats ?? []) if (await telegram(c.chat_id, text, appUrl && `${appUrl}/admin?f=${fb.id}`)) sent++
    return json({ telegram: sent })
  }

  // ── ответ админа → автору пуш и Telegram
  if (body.action === 'replied') {
    const { data: isAdmin } = await db.from('admins').select('user_id').eq('user_id', caller).maybeSingle()
    if (!isAdmin) return json({ error: 'forbidden' }, 403)
    if (!fb.reply) return json({ error: 'no reply' }, 400)

    let pushed = 0
    if (secret.vapid_public && secret.vapid_private) {
      webpush.setVapidDetails(secret.vapid_subject, secret.vapid_public, secret.vapid_private)
      const { data: subs } = await db.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', fb.user_id)
      const payload = JSON.stringify({
        title: 'Ответ на ваше обращение',
        body: cut(fb.reply, 160),
        url: '/settings/feedback',
        tag: `feedback-${fb.id}`,
      })
      for (const sub of subs ?? []) {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, {
            TTL: 86400,
          })
          pushed++
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode ?? 0
          if (code === 404 || code === 410) await db.from('push_subscriptions').delete().eq('id', sub.id)
          else console.error('push failed', code)
        }
      }
    }

    let tg = false
    const { data: acc } = await db.from('telegram_accounts').select('chat_id').eq('user_id', fb.user_id).maybeSingle()
    if (acc) {
      tg = await telegram(
        acc.chat_id,
        `Ответ на ваше обращение\n«${cut(fb.body, 200)}»\n\n${cut(fb.reply, 3000)}`,
        appUrl && `${appUrl}/settings/feedback`,
      )
    }
    return json({ push: pushed, telegram: tg })
  }

  return json({ error: 'unknown action' }, 400)
})
