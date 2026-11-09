-- 0.66: управление аккаунтами в админке.
--
-- admin_log — журнал действий админов: кто, что, когда, над кем. Закрыт для всех (RLS без
--   политик); пишут функции admin_* от имени владельца и серверная функция account
--   сервисным ключом, читает админ через admin_log_list().
-- admin_users() — ещё последний вход, блокировка и «это админ».
-- admin_set_plan() — тариф до даты и пробный период с датой окончания.
-- admin_target() — проверка перед удалением, блокировкой и сбросом пароля: зовёт серверная
--   функция account с токеном админа. Себя и другого админа трогать нельзя.

/* ── журнал ─────────────────────────────────────────────────────────── */

create table if not exists public.admin_log (
  id           bigint generated always as identity primary key,
  admin_id     uuid references auth.users(id) on delete set null,
  admin_email  text,
  -- без внешнего ключа: запись об удалении переживает удалённого человека
  target_id    uuid,
  target_email text,
  action       text not null check (action in ('delete', 'ban', 'unban', 'reset_password', 'set_plan', 'reset_trial')),
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists admin_log_created_idx on public.admin_log (created_at desc);
create index if not exists admin_log_target_idx on public.admin_log (target_id, created_at desc);
alter table public.admin_log enable row level security;

-- запись от имени текущего админа; только для функций admin_*, снаружи не вызвать
create or replace function public.admin_log_write(p_target uuid, p_action text, p_details jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = public, auth
as $$
  insert into public.admin_log (admin_id, admin_email, target_id, target_email, action, details)
  values (auth.uid(), (select u.email::text from auth.users u where u.id = auth.uid()),
          p_target, (select u.email::text from auth.users u where u.id = p_target),
          p_action, coalesce(p_details, '{}'::jsonb))
$$;
revoke all on function public.admin_log_write(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.admin_log_list(p_user uuid default null, p_limit int default 100)
returns table (
  id bigint,
  created_at timestamptz,
  action text,
  admin_email text,
  target_id uuid,
  target_email text,
  details jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  return query
  select l.id, l.created_at, l.action, l.admin_email, l.target_id, l.target_email, l.details
  from public.admin_log l
  where p_user is null or l.target_id = p_user
  order by l.created_at desc, l.id desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

/* ── кого можно трогать ─────────────────────────────────────────────── */

-- для удаления, блокировки и сброса пароля: возвращает почту человека
create or replace function public.admin_target(p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_email text;
begin
  perform public.admin_guard();
  if p_user = auth.uid() then raise exception 'admin_target:self'; end if;
  if exists (select 1 from public.admins a where a.user_id = p_user) then raise exception 'admin_target:admin'; end if;
  select u.email::text into v_email from auth.users u where u.id = p_user;
  if not found then raise exception 'admin_target:not_found'; end if;
  return v_email;
end;
$$;

/* ── люди ───────────────────────────────────────────────────────────── */

-- новые поля в конце: тип результата меняется, поэтому функцию пересоздаём
drop function if exists public.admin_users();
create function public.admin_users()
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
  push boolean,
  last_sign_in timestamptz,
  banned_until timestamptz,
  is_admin boolean
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
         exists (select 1 from push_subscriptions ps where ps.user_id = u.id),
         u.last_sign_in_at,
         case when u.banned_until > now() then u.banned_until end,
         exists (select 1 from admins a where a.user_id = u.id)
  from auth.users u
  left join user_settings s on s.user_id = u.id
  left join user_plans p on p.user_id = u.id
  order by u.created_at desc;
end;
$$;

/* ── тарифы ─────────────────────────────────────────────────────────── */

-- plan — free/plus/pro/lifetime; срок — p_until (дата) или p_days (дней), без них — бессрочно.
-- p_trial — пробный период: только plus/pro и только со сроком.
drop function if exists public.admin_set_plan(uuid, text, int, text);
create or replace function public.admin_set_plan(
  p_user uuid,
  p_plan text,
  p_days int default null,
  p_note text default null,
  p_until timestamptz default null,
  p_trial boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_until timestamptz;
  v_trial boolean := coalesce(p_trial, false) and p_plan in ('plus', 'pro');
  v_old jsonb;
begin
  perform public.admin_guard();
  if p_plan not in ('free', 'plus', 'pro', 'lifetime') then raise exception 'bad_plan'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user) then raise exception 'admin_target:not_found'; end if;
  v_until := case
    when p_plan in ('free', 'lifetime') then null
    when p_until is not null then p_until
    when p_days is not null then now() + make_interval(days => p_days)
  end;
  if v_until is not null and v_until <= now() then raise exception 'bad_until'; end if;
  if v_trial and v_until is null then raise exception 'trial_needs_until'; end if;

  select jsonb_build_object('plan', p.plan, 'until', p.paid_until, 'trial', p.trial) into v_old
  from public.user_plans p where p.user_id = p_user;

  insert into public.user_plans (user_id, plan, paid_until, trial, trial_used_at, note)
  values (p_user, p_plan, v_until, v_trial, case when v_trial then now() end,
          coalesce(p_note, case when v_trial then 'пробный — выдан в админке' else 'выдано в админке' end))
  on conflict (user_id) do update
    set plan = excluded.plan, paid_until = excluded.paid_until, trial = excluded.trial,
        trial_used_at = coalesce(public.user_plans.trial_used_at, excluded.trial_used_at),
        note = excluded.note, updated_at = now();

  perform public.admin_log_write(p_user, 'set_plan',
    jsonb_build_object('plan', p_plan, 'until', v_until, 'trial', v_trial, 'before', v_old));
end;
$$;

create or replace function public.admin_reset_trial(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard();
  update public.user_plans set trial_used_at = null, updated_at = now() where user_id = p_user;
  perform public.admin_log_write(p_user, 'reset_trial', '{}'::jsonb);
end;
$$;

revoke all on function public.admin_users(), public.admin_log_list(uuid, int), public.admin_target(uuid),
  public.admin_set_plan(uuid, text, int, text, timestamptz, boolean), public.admin_reset_trial(uuid) from public, anon;
grant execute on function public.admin_users(), public.admin_log_list(uuid, int), public.admin_target(uuid),
  public.admin_set_plan(uuid, text, int, text, timestamptz, boolean), public.admin_reset_trial(uuid) to authenticated;
