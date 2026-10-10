-- Интеграции: сводки и управление из Telegram, встречи из Google Календаря, файлы Google Диска.

/* ── Telegram: сводки и напоминания о встречах ───────────────────── */

alter table telegram_accounts
  add column daily_summary boolean not null default true,
  add column weekly_summary boolean not null default true,
  -- час местного времени, когда приходит сводка (и итоги недели в пятницу)
  add column summary_hour smallint not null default 20 check (summary_hour between 0 and 23),
  add column notify_meetings boolean not null default true,
  add column last_daily_on date,
  add column last_weekly_on date,
  -- текст, присланный боту без идущего учёта: ждёт, к какой задаче его отнести
  add column pending_comment text;

/* ── Календарь ───────────────────────────────────────────────────── */

-- секретная iCal-ссылка календаря: по ней сервер читает встречи без входа в Google
create table calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  url text not null,
  name text not null default '',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
alter table calendar_sources enable row level security;
create policy "calendar_sources_owner" on calendar_sources for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- встречи окна «неделя назад — три дня вперёд»: их можно засчитать в учёт
create table calendar_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references calendar_sources(id) on delete cascade,
  uid text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  title text not null default '',
  -- задача, в которую встречу предлагается засчитать (по правилам и названиям)
  suggested_task_id uuid references tasks(id) on delete set null,
  status text not null default 'new' check (status in ('new', 'logged', 'dismissed')),
  task_id uuid references tasks(id) on delete set null,
  entry_id uuid references time_entries(id) on delete set null,
  reminded boolean not null default false,
  created_at timestamptz not null default now(),
  unique (source_id, uid, starts_at)
);
create index calendar_events_user_starts_idx on calendar_events(user_id, starts_at);
alter table calendar_events enable row level security;
create policy "calendar_events_owner" on calendar_events for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- «Планёрка Ромашка» → «Спринт 7»: что выбрали однажды, предлагается дальше само
create table calendar_rules (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title_key text not null,
  task_id uuid not null references tasks(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (user_id, title_key)
);
alter table calendar_rules enable row level security;
create policy "calendar_rules_owner" on calendar_rules for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table user_settings
  -- лента учёта и сроков для подписки в календаре; ссылка по секретному ключу
  add column calendar_feed_token text unique,
  -- пуш в начале встречи, если учёт не идёт
  add column meeting_reminders boolean not null default true,
  -- папка Google Диска для отчётов
  add column drive_reports_folder_id text,
  add column drive_reports_folder_name text;

/* ── Google Диск ─────────────────────────────────────────────────── */

-- токен доступа к Диску; читает только сервер — у таблицы нет политик
create table google_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  refresh_token text not null,
  scope text not null default '',
  created_at timestamptz not null default now()
);
alter table google_accounts enable row level security;

-- одноразовые коды входа: связывают ответ Google с пользователем
create table google_link_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table google_link_states enable row level security;

-- файл из Диска — ссылка, а не копия в хранилище
alter table attachments add column drive_file_id text;
alter table attachments add column url text;
alter table attachments alter column path drop not null;
alter table attachments add constraint attachments_file_or_link check (path is not null or url is not null);

-- папка значения группы (проекта, клиента) на Диске
alter table group_items add column drive_folder_id text;
alter table group_items add column drive_folder_name text;

/* ── расписания ──────────────────────────────────────────────────── */

-- календари перечитываются каждые 15 минут, сводки проверяются тогда же
select cron.schedule(
  'calendar-sync',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://stsyfvrpiytugaljhkqj.supabase.co/functions/v1/calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where name = 'cron_secret')
    ),
    body := '{"action":"sync"}'::jsonb
  )
  $$
);

select cron.schedule(
  'telegram-digest',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://stsyfvrpiytugaljhkqj.supabase.co/functions/v1/telegram',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_secrets where name = 'cron_secret')
    ),
    body := '{"action":"digest"}'::jsonb
  )
  $$
);
