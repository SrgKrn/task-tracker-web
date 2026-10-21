-- 0.41: «Написать нам» и админка.
--
-- feedback — обращения пользователей: идея, ошибка, отзыв с оценкой, другое. До трёх
-- скриншотов в закрытом бакете feedback. Пользователь видит только свои обращения и ответ
-- на них; админ — все, меняет статус и отвечает.
--
-- admins — кто админ. Таблица закрыта для всех (RLS без политик); роль проверяет
-- is_admin() от имени владельца. Админ назначается отдельно, вне миграции.
--
-- Админка читает данные всех пользователей только через функции admin_* — каждая
-- сначала проверяет is_admin(). Прямого доступа к чужим строкам у админа нет.
--
-- user_settings.last_seen_* — когда и с какой версии человек последний раз открывал
-- приложение: для «активных за день/неделю/месяц» и «версий у пользователей».

/* ── админы ─────────────────────────────────────────────────────────── */

create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

/* ── «был в приложении» ─────────────────────────────────────────────── */

alter table public.user_settings
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_seen_version text,
  add column if not exists last_seen_device text;

-- приложение зовёт при открытии; строки настроек может не быть — тогда ничего
create or replace function public.app_seen(p_version text, p_device text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_settings
  set last_seen_at = now(),
      last_seen_version = left(p_version, 20),
      last_seen_device = left(p_device, 40)
  where user_id = auth.uid()
$$;
revoke all on function public.app_seen(text, text) from public, anon;
grant execute on function public.app_seen(text, text) to authenticated;

/* ── обращения ──────────────────────────────────────────────────────── */

create table if not exists public.feedback (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('idea', 'bug', 'review', 'other')),
  rating        smallint check (rating between 1 and 5),
  body          text not null check (char_length(body) between 1 and 5000),
  screenshots   text[] not null default '{}' check (cardinality(screenshots) <= 3),
  app_version   text,
  device        text,
  plan          text,
  status        text not null default 'new' check (status in ('new', 'in_progress', 'done', 'declined')),
  reply         text check (reply is null or char_length(reply) <= 5000),
  replied_at    timestamptz,
  reply_seen_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists feedback_select on public.feedback;
create policy feedback_select on public.feedback
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback
  for insert with check (user_id = auth.uid());

drop policy if exists feedback_update_admin on public.feedback;
create policy feedback_update_admin on public.feedback
  for update using (public.is_admin()) with check (public.is_admin());

-- новое обращение: статус, ответ и тариф ставит база, а не клиент
create or replace function public.feedback_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.status := 'new';
  new.reply := null;
  new.replied_at := null;
  new.reply_seen_at := null;
  new.created_at := now();
  new.updated_at := now();
  if new.kind <> 'review' then new.rating := null; end if;
  new.plan := public.effective_plan(new.user_id);
  new.app_version := left(new.app_version, 20);
  new.device := left(new.device, 40);
  return new;
end;
$$;

drop trigger if exists feedback_before_insert on public.feedback;
create trigger feedback_before_insert
  before insert on public.feedback
  for each row execute function public.feedback_before_insert();

-- правка админом: текст обращения и автора не меняет; новый ответ — снова «не прочитан»
create or replace function public.feedback_before_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.user_id := old.user_id;
  new.kind := old.kind;
  new.rating := old.rating;
  new.body := old.body;
  new.screenshots := old.screenshots;
  new.created_at := old.created_at;
  new.updated_at := now();
  if new.reply is distinct from old.reply then
    new.reply := nullif(btrim(new.reply), '');
    new.replied_at := case when new.reply is null then null else now() end;
    new.reply_seen_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists feedback_before_update on public.feedback;
create trigger feedback_before_update
  before update on public.feedback
  for each row execute function public.feedback_before_update();

-- пользователь прочитал ответ (менять свои обращения напрямую он не может)
create or replace function public.feedback_seen(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.feedback
  set reply_seen_at = now()
  where id = p_id and user_id = auth.uid() and reply is not null and reply_seen_at is null
$$;
revoke all on function public.feedback_seen(uuid) from public, anon;
grant execute on function public.feedback_seen(uuid) to authenticated;

grant select, insert, update on public.feedback to authenticated;

/* ── скриншоты ──────────────────────────────────────────────────────── */

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "feedback_insert" on storage.objects;
create policy "feedback_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "feedback_read" on storage.objects;
create policy "feedback_read" on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

/* ── админка ────────────────────────────────────────────────────────── */

create or replace function public.admin_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
end;
$$;

-- последняя активность: открытие приложения, запись учёта или вход
create or replace function public.admin_users()
returns table (
  id uuid,
  email text,
  name text,
  created_at timestamptz,
  last_active timestamptz,
  last_seen_version text,
  last_seen_device text,
  plan text,
  effective text,
  paid_until timestamptz,
  trial boolean,
  trial_used boolean,
  workspaces int,
  tasks int,
  hours numeric,
  hours_30d numeric,
  feedback int,
  telegram boolean,
  google boolean,
  push boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  perform public.admin_guard();
  return query
  select u.id,
         u.email::text,
         s.display_name,
         u.created_at,
         greatest(s.last_seen_at, u.last_sign_in_at, (select max(te.created_at) from time_entries te where te.user_id = u.id)),
         s.last_seen_version,
         s.last_seen_device,
         coalesce(p.plan, 'free'),
         public.effective_plan(u.id),
         p.paid_until,
         coalesce(p.trial, false),
         p.trial_used_at is not null,
         (select count(*)::int from workspaces w where w.user_id = u.id),
         (select count(*)::int from tasks t where t.user_id = u.id),
         (select round(coalesce(sum(te.duration_seconds), 0) / 3600.0, 1) from time_entries te where te.user_id = u.id),
         (select round(coalesce(sum(te.duration_seconds), 0) / 3600.0, 1) from time_entries te
            where te.user_id = u.id and te.effective_date >= current_date - 30),
         (select count(*)::int from feedback f where f.user_id = u.id),
         exists (select 1 from telegram_accounts ta where ta.user_id = u.id),
         exists (select 1 from google_accounts ga where ga.user_id = u.id),
         exists (select 1 from push_subscriptions ps where ps.user_id = u.id)
  from auth.users u
  left join user_settings s on s.user_id = u.id
  left join user_plans p on p.user_id = u.id
  order by u.created_at desc;
end;
$$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  perform public.admin_guard();
  with act as (
    select u.id, u.created_at,
           greatest(s.last_seen_at, u.last_sign_in_at, (select max(te.created_at) from time_entries te where te.user_id = u.id)) as last_active
    from auth.users u left join user_settings s on s.user_id = u.id
  )
  select jsonb_build_object(
    'users', (select count(*) from act),
    'new_7d', (select count(*) from act where created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from act where created_at > now() - interval '30 days'),
    'active_1d', (select count(*) from act where last_active > now() - interval '1 day'),
    'active_7d', (select count(*) from act where last_active > now() - interval '7 days'),
    'active_30d', (select count(*) from act where last_active > now() - interval '30 days'),
    'hours_7d', (select round(coalesce(sum(duration_seconds), 0) / 3600.0, 1) from time_entries where effective_date >= current_date - 7),
    'entries_7d', (select count(*) from time_entries where created_at > now() - interval '7 days'),
    'tasks_7d', (select count(*) from tasks where created_at > now() - interval '7 days'),
    'feedback_new', (select count(*) from feedback where status = 'new'),
    'rating_avg', (select round(avg(rating)::numeric, 1) from feedback where rating is not null),
    'plans', (select coalesce(jsonb_object_agg(pl, n), '{}') from (
               select public.effective_plan(id) || case when exists (select 1 from user_plans p where p.user_id = act.id and p.plan = 'lifetime') then '_lifetime' else '' end as pl, count(*) n
               from act group by 1) x),
    'presets', (select coalesce(jsonb_object_agg(code, n), '{}') from (
               select coalesce(preset_code, 'без пресета') code, count(*) n from workspaces group by 1) x),
    'features', jsonb_build_object(
      'telegram', (select count(distinct user_id) from telegram_accounts),
      'google', (select count(distinct user_id) from google_accounts),
      'calendar', (select count(distinct user_id) from calendar_sources),
      'push', (select count(distinct user_id) from push_subscriptions),
      'focus', (select count(distinct user_id) from focus_sessions),
      'client_work', (select count(distinct user_id) from workspaces where client_work),
      'shares', (select count(distinct user_id) from report_shares),
      'methods', (select count(*) from user_settings where coalesce(priority_method, 'none') <> 'none'),
      'several_workspaces', (select count(*) from (select user_id from workspaces group by user_id having count(*) > 1) x)
    ),
    'signups_by_week', (select coalesce(jsonb_agg(jsonb_build_object('week', w, 'n', n) order by w), '[]') from (
               select date_trunc('week', created_at)::date w, count(*) n from act
               where created_at > now() - interval '12 weeks' group by 1) x)
  ) into result;
  return result;
end;
$$;

create or replace function public.admin_system()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, cron, net
as $$
declare
  result jsonb;
begin
  perform public.admin_guard();
  select jsonb_build_object(
    'cron', (select coalesce(jsonb_agg(row_to_json(x) order by x.job), '[]') from (
      select j.jobname as job, j.schedule,
             (select max(d.start_time) from cron.job_run_details d where d.jobid = j.jobid) as last_run,
             (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) as last_status,
             (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '1 day') as runs_24h,
             (select count(*) from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '1 day' and d.status <> 'succeeded') as failed_24h
      from cron.job j) x),
    'http_24h', (select jsonb_build_object('total', count(*), 'failed', count(*) filter (where status_code >= 400 or error_msg is not null))
                 from net._http_response where created > now() - interval '1 day'),
    'versions', (select coalesce(jsonb_agg(jsonb_build_object('version', v, 'users', n, 'last', l) order by l desc), '[]') from (
                 select coalesce(last_seen_version, 'не открывали после 0.41') v, count(*) n, max(last_seen_at) l
                 from user_settings group by 1) x),
    'storage_mb', (select jsonb_object_agg(bucket_id, mb) from (
                 select bucket_id, round(sum(coalesce((metadata ->> 'size')::bigint, 0)) / 1048576.0, 1) mb
                 from storage.objects group by bucket_id) x)
  ) into result;
  return result;
end;
$$;

-- выдать тариф: plan — free/plus/pro/lifetime; days — на сколько дней (null — бессрочно)
create or replace function public.admin_set_plan(p_user uuid, p_plan text, p_days int default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  if p_plan not in ('free', 'plus', 'pro', 'lifetime') then raise exception 'bad_plan'; end if;
  insert into public.user_plans (user_id, plan, paid_until, trial, note)
  values (p_user, p_plan,
          case when p_days is null or p_plan in ('free', 'lifetime') then null else now() + make_interval(days => p_days) end,
          false, coalesce(p_note, 'выдано в админке'))
  on conflict (user_id) do update
    set plan = excluded.plan, paid_until = excluded.paid_until, trial = false,
        note = excluded.note, updated_at = now();
end;
$$;

-- снова разрешить пробный период (например, если человек не успел попробовать)
create or replace function public.admin_reset_trial(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  update public.user_plans set trial_used_at = null, updated_at = now() where user_id = p_user;
end;
$$;

revoke all on function public.admin_guard(), public.admin_users(), public.admin_stats(), public.admin_system(),
  public.admin_set_plan(uuid, text, int, text), public.admin_reset_trial(uuid) from public, anon;
grant execute on function public.admin_users(), public.admin_stats(), public.admin_system(),
  public.admin_set_plan(uuid, text, int, text), public.admin_reset_trial(uuid) to authenticated;
