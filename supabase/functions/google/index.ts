// Google: вход в Google для Диска и Календаря. Доступ узкий. Диск — drive.file: приложение видит
// только файлы, которые пользователь сам выбрал или которые оно создало (отчёты). Календарь —
// calendar.events.readonly: встречи только читаются. Каждое разрешение спрашивается, когда
// пользователь подключает именно его; аккаунт и ключ обновления у них общие.
//
// Вход через переадресацию, а не всплывающее окно: в приложении на экране «Домой» iPhone
// окна входа не возвращаются обратно. Google возвращает на страницу /oauth/google, та
// отдаёт сюда код и одноразовый state — по нему функция и узнаёт пользователя.
// Ключ обновления хранится только здесь (google_accounts без политик доступа); приложение
// получает от функции ключи доступа на час — для выбора файлов и выгрузки отчётов.
//
// Настройки в app_secrets: google_client_id, google_client_secret, google_api_key (для окна
// выбора файлов), google_app_id (номер проекта Google Cloud).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const SCOPES = {
  drive: 'https://www.googleapis.com/auth/drive.file',
  calendar: 'https://www.googleapis.com/auth/calendar.events.readonly',
} as const
type Service = keyof typeof SCOPES
/** ссылка на вход живёт 20 минут */
const STATE_TTL_MS = 20 * 60 * 1000

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

/** в state зашито, что подключают: «c.…» — календарь, «d.…» — Диск */
function randomState(service: Service): string {
  const a = crypto.getRandomValues(new Uint8Array(24))
  const s = btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${service === 'calendar' ? 'c' : 'd'}.${s}`
}

const serviceOf = (state: string): Service => (state.startsWith('c.') ? 'calendar' : 'drive')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  const { data: rows } = await db.from('app_secrets').select('name, value')
  const secret: Record<string, string> = Object.fromEntries(
    (rows ?? []).map((r: { name: string; value: string }) => [r.name, r.value]),
  )
  const clientId = secret.google_client_id ?? ''
  const clientSecret = secret.google_client_secret ?? ''
  const appUrl = (secret.app_url ?? secret.vapid_subject ?? '').replace(/\/$/, '')
  const redirectUri = `${appUrl}/oauth/google`
  const configured = !!clientId && !!clientSecret && !!appUrl

  const body = await req.json().catch(() => ({}))

  /** ключ доступа на час по ключу обновления */
  async function accessToken(refreshToken: string) {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.access_token) {
      throw new Error(j.error === 'invalid_grant' ? 'revoked' : `token: ${j.error ?? r.status}`)
    }
    return { access_token: j.access_token as string, expires_in: Number(j.expires_in ?? 3600) }
  }

  // ── возврат из Google: пользователь известен по одноразовому state, не по сессии —
  //    страница возврата может открыться в отдельном окне браузера без входа в приложение
  if (body?.action === 'exchange') {
    if (!configured) return json({ error: 'Google ещё не настроен' }, 409)
    const state = String(body.state ?? '')
    const code = String(body.code ?? '')
    const { data: link } = await db.from('google_link_states').select('*').eq('state', state).maybeSingle()
    if (!link || Date.now() - new Date(link.created_at).getTime() > STATE_TTL_MS) {
      return json({ error: 'Ссылка входа устарела — нажмите «Подключить» в приложении ещё раз' }, 400)
    }
    await db.from('google_link_states').delete().eq('state', state)
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tok = await r.json().catch(() => ({}))
    if (!r.ok || !tok.access_token) {
      console.error('exchange', tok)
      return json({ error: 'Google не подтвердил вход — попробуйте ещё раз' }, 400)
    }
    const service = serviceOf(state)
    const scope = String(tok.scope ?? '')
    if (!scope.includes(SCOPES[service])) {
      return json(
        {
          error:
            service === 'calendar'
              ? 'Доступ к календарю не выдан — при входе оставьте галочку «Просмотр мероприятий»'
              : 'Доступ к Диску не выдан — при входе оставьте галочку «Google Диск»',
        },
        400,
      )
    }
    let email = ''
    try {
      const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      }).then((x) => x.json())
      email = String(info.email ?? '')
    } catch {
      // без адреса подключение работает, просто в настройках не будет видно, какой аккаунт
    }
    const { data: prev } = await db.from('google_accounts').select('refresh_token').eq('user_id', link.user_id).maybeSingle()
    // Google присылает ключ обновления только при первом согласии; при повторном берём прежний
    const refresh = tok.refresh_token ?? prev?.refresh_token
    if (!refresh) return json({ error: 'Google не выдал постоянный доступ — отключите и подключите заново' }, 400)
    await db.from('google_accounts').upsert({
      user_id: link.user_id,
      email,
      refresh_token: refresh,
      scope,
    })
    if (service !== 'calendar') return json({ ok: true, email, service })

    // календарь: источник встреч и первое чтение сразу, не дожидаясь расписания
    const { data: existing } = await db
      .from('calendar_sources')
      .select('id')
      .eq('user_id', link.user_id)
      .eq('kind', 'google')
      .maybeSingle()
    if (!existing) {
      await db.from('calendar_sources').insert({ user_id: link.user_id, kind: 'google', name: email || 'Google Календарь' })
    }
    let events = 0
    if (secret.cron_secret) {
      const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret.cron_secret },
        body: JSON.stringify({ action: 'sync', user_id: link.user_id }),
      }).catch(() => null)
      const j = r ? await r.json().catch(() => ({})) : {}
      events = Number(j.events ?? 0)
    }
    return json({ ok: true, email, service, events })
  }

  // ── действия из приложения
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: auth } = await db.auth.getUser(jwt)
  const user = auth?.user
  if (!user) return json({ error: 'forbidden' }, 403)
  const { data: account } = await db.from('google_accounts').select('email, refresh_token, scope').eq('user_id', user.id).maybeSingle()

  switch (body?.action) {
    case 'status':
      return json({
        configured,
        // для окна выбора файлов: ключ API и номер проекта не секретны — они видны в любом браузере
        apiKey: secret.google_api_key ?? '',
        appId: secret.google_app_id ?? '',
        linked: account
          ? {
              email: account.email,
              drive: account.scope.includes(SCOPES.drive),
              calendar: account.scope.includes(SCOPES.calendar),
            }
          : null,
      })

    case 'auth_url': {
      if (!configured) return json({ error: 'Google ещё не настроен' }, 409)
      const service: Service = body.service === 'calendar' ? 'calendar' : 'drive'
      await db.from('google_link_states').delete().eq('user_id', user.id)
      const state = randomState(service)
      const { error } = await db.from('google_link_states').insert({ state, user_id: user.id })
      if (error) return json({ error: error.message }, 500)
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        // прежние разрешения сохраняются (include_granted_scopes) — спрашиваем только новое
        scope: `openid email ${SCOPES[service]}`,
        access_type: 'offline',
        prompt: 'consent',
        include_granted_scopes: 'true',
        state,
      })
      if (user.email) params.set('login_hint', user.email)
      return json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` })
    }

    case 'token': {
      if (!account?.scope.includes(SCOPES.drive)) return json({ error: 'Google Диск не подключён' }, 409)
      try {
        return json(await accessToken(account.refresh_token))
      } catch (e) {
        if (String(e).includes('revoked')) {
          // доступ отозвали в настройках Google — подключение больше не работает
          await db.from('google_accounts').delete().eq('user_id', user.id)
          await db.from('calendar_sources').delete().eq('user_id', user.id).eq('kind', 'google')
          return json({ error: 'Доступ к Google отозван — подключите его заново' }, 409)
        }
        console.error('token', String(e))
        return json({ error: 'Google не выдал доступ — попробуйте ещё раз чуть позже' }, 502)
      }
    }

    case 'unlink': {
      if (account) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(account.refresh_token)}`, {
          method: 'POST',
        }).catch(() => {})
        await db.from('google_accounts').delete().eq('user_id', user.id)
      }
      // вход в Google общий: без него встречи из Google Календаря тоже не читаются
      await db.from('calendar_sources').delete().eq('user_id', user.id).eq('kind', 'google')
      return json({ ok: true })
    }

    default:
      return json({ error: 'unknown action' }, 400)
  }
})
