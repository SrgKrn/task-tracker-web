-- Пуш-уведомления: подписки устройств и напоминания о долгом учёте.

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on push_subscriptions(user_id);
alter table push_subscriptions enable row level security;
create policy "push_subscriptions_owner" on push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- сколько часов идущего учёта уже отмечено напоминанием: 1 — «больше часа», 2 — «больше двух»…
alter table active_timers add column reminded_hours integer not null default 0;

-- Секреты для серверной функции (ключ VAPID, пароль вызова по расписанию). RLS включён
-- и политик нет: ни анонимный, ни вошедший пользователь эту таблицу не прочтут —
-- только сервисный ключ функции. Значения кладутся отдельно и в репозиторий не попадают.
create table app_secrets (
  name text primary key,
  value text not null
);
alter table app_secrets enable row level security;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Раз в минуту — проверка идущих таймеров. Пароль вызова берётся из app_secrets
-- в момент запуска, в тексте задания его нет. (Применено отдельно, после того как
-- в app_secrets появились ключи.)
select cron.schedule(
  'timer-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://stsyfvrpiytugaljhkqj.supabase.co/functions/v1/timer-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  )
  $$
);
