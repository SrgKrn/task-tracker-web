// Удаление аккаунта и действия админа над чужим аккаунтом. Удалить или заблокировать
// пользователя может только сервисный ключ, поэтому — функция.
//
// action 'delete' — человек удаляет себя (слово «удалить»).
// action 'admin_delete' | 'admin_ban' | 'admin_unban' | 'admin_reset_password' — админка (0.66).
//   Право проверяет база: admin_target() с токеном вызвавшего зовёт admin_guard и не даёт
//   тронуть себя и другого админа. Каждое действие пишется в admin_log.
//
// Удаление: сначала файлы из хранилища (их база сама не удалит), затем пользователь —
// остальное (задачи, учёт, группы, настройки, привязки) уходит каскадом.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

/** файлы человека и сам человек; возвращает число удалённых файлов */
async function wipeUser(db: SupabaseClient, userId: string): Promise<{ files: number; error?: string }> {
  // файлы задач и значений групп — пути лежат в таблице attachments
  const { data: files } = await db.from('attachments').select('path').eq('user_id', userId)
  const attachmentPaths = (files ?? []).map((f: { path: string | null }) => f.path).filter((p): p is string => !!p)
  for (let i = 0; i < attachmentPaths.length; i += 100) {
    await db.storage.from('attachments').remove(attachmentPaths.slice(i, i + 100))
  }
  // фото профиля — всё в папке пользователя
  const { data: avatars } = await db.storage.from('avatars').list(userId)
  if (avatars?.length) await db.storage.from('avatars').remove(avatars.map((a) => `${userId}/${a.name}`))
  // скриншоты обращений «Написать нам» — тоже папка пользователя
  const { data: shots } = await db.storage.from('feedback').list(userId, { limit: 1000 })
  if (shots?.length) await db.storage.from('feedback').remove(shots.map((s) => `${userId}/${s.name}`))

  const filesCount = attachmentPaths.length + (avatars?.length ?? 0) + (shots?.length ?? 0)
  const { error } = await db.auth.admin.deleteUser(userId)
  return { files: filesCount, error: error?.message }
}

const ADMIN_ACTIONS = ['admin_delete', 'admin_ban', 'admin_unban', 'admin_reset_password'] as const
type AdminAction = (typeof ADMIN_ACTIONS)[number]
// блокировка «навсегда» — сто лет; снять — 'none'
const BAN_FOREVER = '876000h'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const url = Deno.env.get('SUPABASE_URL')!
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await db.auth.getUser(token)
  if (!auth?.user) return json({ error: 'forbidden' }, 403)
  const userId = auth.user.id

  const body = await req.json().catch(() => ({}))

  if (body?.action === 'delete') {
    // слово подтверждения проверяется и здесь: случайный вызов без него ничего не удалит
    if (body?.confirm !== 'удалить') return json({ error: 'unknown action' }, 400)
    const res = await wipeUser(db, userId)
    if (res.error) return json({ error: res.error }, 500)
    return json({ deleted: true, files: res.files })
  }

  if (!ADMIN_ACTIONS.includes(body?.action)) return json({ error: 'unknown action' }, 400)
  const action = body.action as AdminAction
  const target = typeof body?.user === 'string' ? body.user : ''
  if (!/^[0-9a-f-]{36}$/i.test(target)) return json({ error: 'bad user' }, 400)

  // право — в базе, от имени вызвавшего: не админ, сам, другой админ — отказ
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: targetEmail, error: guardError } = await asCaller.rpc('admin_target', { p_user: target })
  if (guardError || typeof targetEmail !== 'string') {
    const code = guardError?.message?.match(/admin_target:\w+|forbidden/)?.[0] ?? 'forbidden'
    return json({ error: code }, code === 'admin_target:not_found' ? 404 : 403)
  }

  const log = (kind: string, details: Record<string, unknown> = {}) =>
    db.from('admin_log').insert({
      admin_id: userId,
      admin_email: auth.user.email ?? null,
      target_id: target,
      target_email: targetEmail,
      action: kind,
      details,
    })

  if (action === 'admin_delete') {
    // подтверждение — почта удаляемого, набранная вручную
    if (String(body?.confirm ?? '').trim().toLowerCase() !== targetEmail.toLowerCase()) return json({ error: 'confirm_mismatch' }, 400)
    const res = await wipeUser(db, target)
    if (res.error) return json({ error: res.error }, 500)
    await log('delete', { files: res.files })
    return json({ deleted: true, files: res.files })
  }

  if (action === 'admin_ban' || action === 'admin_unban') {
    const ban = action === 'admin_ban'
    const { error } = await db.auth.admin.updateUserById(target, { ban_duration: ban ? BAN_FOREVER : 'none' })
    if (error) return json({ error: error.message }, 500)
    await log(ban ? 'ban' : 'unban')
    return json({ banned: ban })
  }

  // admin_reset_password: то же письмо, что «Забыли пароль?» на экране входа
  const redirect = typeof body?.redirect === 'string' && /^https?:\/\//.test(body.redirect) ? body.redirect : undefined
  const { error } = await db.auth.resetPasswordForEmail(targetEmail, redirect ? { redirectTo: redirect } : undefined)
  if (error) return json({ error: error.message }, 500)
  await log('reset_password')
  return json({ sent: true })
})
