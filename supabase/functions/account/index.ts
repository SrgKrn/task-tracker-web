// Удаление аккаунта из профиля. Удалить пользователя может только сервисный ключ, поэтому —
// функция. Вызывается из приложения с токеном вошедшего пользователя и удаляет только его:
// сначала файлы из хранилища (их база сама не удалит), затем пользователя — остальное
// (задачи, учёт, группы, настройки, привязки) уходит каскадом.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await db.auth.getUser(token)
  if (!auth?.user) return json({ error: 'forbidden' }, 403)
  const userId = auth.user.id

  const body = await req.json().catch(() => ({}))
  // слово подтверждения проверяется и здесь: случайный вызов без него ничего не удалит
  if (body?.action !== 'delete' || body?.confirm !== 'удалить') return json({ error: 'unknown action' }, 400)

  // файлы задач и значений групп — пути лежат в таблице attachments
  const { data: files } = await db.from('attachments').select('path').eq('user_id', userId)
  const attachmentPaths = (files ?? []).map((f: { path: string | null }) => f.path).filter((p): p is string => !!p)
  for (let i = 0; i < attachmentPaths.length; i += 100) {
    await db.storage.from('attachments').remove(attachmentPaths.slice(i, i + 100))
  }
  // фото профиля — всё в папке пользователя
  const { data: avatars } = await db.storage.from('avatars').list(userId)
  if (avatars?.length) await db.storage.from('avatars').remove(avatars.map((a) => `${userId}/${a.name}`))

  const { error } = await db.auth.admin.deleteUser(userId)
  if (error) return json({ error: error.message }, 500)
  return json({ deleted: true, files: attachmentPaths.length + (avatars?.length ?? 0) })
})
