-- Лимиты тарифов по чек-листу (артефакт «Лимиты тарифов Semternity», решения 20.10.2026).
-- Здесь — то, что должна держать база: пространства, группы, «Работа с клиентами»,
-- файлы, ссылки для клиентов, пробный период. Остальное (экспорт, история, Telegram,
-- Google) закрывает приложение и серверные функции по той же таблице plan_limits.
-- Проверки не трогают сервисные операции (auth.uid() пуст) — миграции, клоны, cron.

/* ── тарифы: «Плюс», пробный период ───────────────────────────────── */

alter table public.user_plans drop constraint if exists user_plans_plan_check;
alter table public.user_plans
  add constraint user_plans_plan_check check (plan in ('free', 'plus', 'pro', 'lifetime', 'studio'));
alter table public.user_plans
  add column if not exists trial boolean not null default false,
  add column if not exists trial_used_at timestamptz;

/* ── таблица лимитов: null — без ограничения ──────────────────────── */

create table if not exists public.plan_limits (
  plan text primary key check (plan in ('free', 'plus', 'pro')),
  limits jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.plan_limits enable row level security;
drop policy if exists plan_limits_read on public.plan_limits;
create policy plan_limits_read on public.plan_limits for select to authenticated using (true);

insert into public.plan_limits (plan, limits) values
('free', '{
  "workspaces": 1, "groups": 3, "items": null, "tasks": null, "subtasks": null, "stages": null,
  "client_work": false, "canvas": true, "presets": true,
  "timer": true, "norm": true, "history_days": 365, "chronology_days": 90, "tile": true, "mosaic": "month",
  "focus": true, "methods": true,
  "export": false, "export_per_month": 0, "export_drive": false, "export_extras": false, "logo": false,
  "rate": false, "billing": false, "share_links": 0, "share_days": 30,
  "push": true, "tg_reminders": false, "tg_digest": false, "gcal": false, "calendars": 0, "gdrive": false,
  "storage_mb": 200, "file_mb": 10, "support": "в боте"
}'),
('plus', '{
  "workspaces": 3, "groups": 5, "items": null, "tasks": null, "subtasks": null, "stages": null,
  "client_work": false, "canvas": true, "presets": true,
  "timer": true, "norm": true, "history_days": null, "chronology_days": null, "tile": true, "mosaic": "month_year",
  "focus": true, "methods": true,
  "export": true, "export_per_month": null, "export_drive": false, "export_extras": true, "logo": false,
  "rate": false, "billing": false, "share_links": 0, "share_days": 30,
  "push": true, "tg_reminders": true, "tg_digest": true, "gcal": false, "calendars": 0, "gdrive": false,
  "storage_mb": 1024, "file_mb": 30, "support": "в боте, 2 дня"
}'),
('pro', '{
  "workspaces": 5, "groups": null, "items": null, "tasks": null, "subtasks": null, "stages": null,
  "client_work": true, "canvas": true, "presets": true,
  "timer": true, "norm": true, "history_days": null, "chronology_days": null, "tile": true, "mosaic": "month_year",
  "focus": true, "methods": true,
  "export": true, "export_per_month": null, "export_drive": true, "export_extras": true, "logo": true,
  "rate": true, "billing": true, "share_links": null, "share_days": 30,
  "push": true, "tg_reminders": true, "tg_digest": true, "gcal": true, "calendars": null, "gdrive": true,
  "storage_mb": 3072, "file_mb": 100, "support": "в течение рабочего дня"
}')
on conflict (plan) do update set limits = excluded.limits, updated_at = now();

/* ── действующий тариф и лимиты ───────────────────────────────────── */

-- Пожизненный — как «Про»; платный с истёкшим сроком (в том числе пробный) — «Старт».
create or replace function public.effective_plan(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select case
      when p.plan in ('lifetime', 'studio') then 'pro'
      when p.plan in ('plus', 'pro') and (p.paid_until is null or p.paid_until > now()) then p.plan
      else 'free'
    end
    from public.user_plans p where p.user_id = p_user
  ), 'free')
$$;

create or replace function public.plan_limits_of(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select limits from public.plan_limits where plan = public.effective_plan(p_user)
$$;

-- Числовой лимит: null — без ограничения.
create or replace function public.plan_limit_int(p_user uuid, p_key text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when jsonb_typeof(public.plan_limits_of(p_user) -> p_key) = 'number'
              then (public.plan_limits_of(p_user) ->> p_key)::integer end
$$;

create or replace function public.plan_allows(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((public.plan_limits_of(p_user) ->> p_key)::boolean, false)
$$;

-- Всё про тариф текущего пользователя одним запросом — для приложения.
create or replace function public.my_plan()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'plan', coalesce(p.plan, 'free'),
    'effective', public.effective_plan(auth.uid()),
    'paid_until', p.paid_until,
    'trial', coalesce(p.trial, false),
    'trial_used', p.trial_used_at is not null,
    'note', p.note,
    'limits', public.plan_limits_of(auth.uid())
  )
  from (select 1) one
  left join public.user_plans p on p.user_id = auth.uid()
$$;

-- Пробный период: 7 дней «Плюса» или «Про», один раз на аккаунт.
create or replace function public.start_trial(p_plan text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur public.user_plans;
begin
  if uid is null then raise exception 'not_signed_in'; end if;
  if p_plan not in ('plus', 'pro') then raise exception 'plan_limit:trial_plan'; end if;
  select * into cur from public.user_plans where user_id = uid;
  if cur.trial_used_at is not null then raise exception 'plan_limit:trial_used'; end if;
  if public.effective_plan(uid) <> 'free' then raise exception 'plan_limit:already_paid'; end if;
  insert into public.user_plans (user_id, plan, paid_until, trial, trial_used_at, note)
  values (uid, p_plan, now() + interval '7 days', true, now(), 'пробный период')
  on conflict (user_id) do update
    set plan = excluded.plan, paid_until = excluded.paid_until, trial = true,
        trial_used_at = excluded.trial_used_at, note = excluded.note, updated_at = now();
  return public.my_plan();
end;
$$;

-- служебные: их зовут триггеры и my_plan() от имени владельца; тариф чужого человека не узнать
revoke all on function public.effective_plan(uuid), public.plan_limits_of(uuid),
  public.plan_limit_int(uuid, text), public.plan_allows(uuid, text) from public, anon, authenticated;
grant execute on function public.my_plan(), public.start_trial(text) to authenticated;

/* ── проверки ─────────────────────────────────────────────────────── */

-- Пространство в архиве (после понижения тарифа) в лимит не входит.
alter table public.workspaces add column if not exists archived_at timestamptz;

create or replace function public.plan_guard_workspaces()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  lim integer;
begin
  if uid is null then return new; end if;
  if tg_op = 'INSERT' then
    lim := public.plan_limit_int(new.user_id, 'workspaces');
    if lim is not null and (select count(*) from public.workspaces
                            where user_id = new.user_id and archived_at is null) >= lim then
      raise exception 'plan_limit:workspaces';
    end if;
    -- пресет «Клиенты» на тарифе без работы с клиентами — просто без неё
    if new.client_work and not public.plan_allows(new.user_id, 'client_work') then
      new.client_work := false;
    end if;
  elsif new.client_work and not old.client_work and not public.plan_allows(new.user_id, 'client_work') then
    -- включил пресет — молча без неё; включил человек сам — объясняем отказом
    if new.preset_code is distinct from old.preset_code then
      new.client_work := false;
    else
      raise exception 'plan_limit:client_work';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_zz_plan_guard on public.workspaces;
-- на любое изменение: client_work включает и триггер пресета, а не только правка поля
create trigger workspaces_zz_plan_guard
  before insert or update on public.workspaces
  for each row execute function public.plan_guard_workspaces();

create or replace function public.plan_guard_groups()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim integer;
begin
  if auth.uid() is null then return new; end if;
  lim := public.plan_limit_int(new.user_id, 'groups');
  if lim is not null and (select count(*) from public.groups where workspace_id = new.workspace_id) >= lim then
    raise exception 'plan_limit:groups';
  end if;
  return new;
end;
$$;

drop trigger if exists groups_zz_plan_guard on public.groups;
create trigger groups_zz_plan_guard
  before insert on public.groups
  for each row execute function public.plan_guard_groups();

-- Файлы в нашем хранилище (path задан); ссылки на Диск место не занимают.
create or replace function public.plan_guard_attachments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  file_mb integer;
  storage_mb integer;
begin
  if auth.uid() is null or new.path is null then return new; end if;
  file_mb := public.plan_limit_int(new.user_id, 'file_mb');
  if file_mb is not null and coalesce(new.size, 0) > file_mb::bigint * 1024 * 1024 then
    raise exception 'plan_limit:file_mb';
  end if;
  storage_mb := public.plan_limit_int(new.user_id, 'storage_mb');
  if storage_mb is not null and
     (select coalesce(sum(size), 0) from public.attachments where user_id = new.user_id and path is not null)
       + coalesce(new.size, 0) > storage_mb::bigint * 1024 * 1024 then
    raise exception 'plan_limit:storage_mb';
  end if;
  return new;
end;
$$;

drop trigger if exists attachments_zz_plan_guard on public.attachments;
create trigger attachments_zz_plan_guard
  before insert on public.attachments
  for each row execute function public.plan_guard_attachments();

-- Ссылки для клиентов: только с работой с клиентами, живут share_days дней.
alter table public.report_shares add column if not exists expires_at timestamptz;

create or replace function public.plan_guard_report_shares()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lim integer;
  days integer;
begin
  if auth.uid() is null then return new; end if;
  if not public.plan_allows(new.user_id, 'billing') then
    raise exception 'plan_limit:share_links';
  end if;
  lim := public.plan_limit_int(new.user_id, 'share_links');
  if lim is not null and (select count(*) from public.report_shares
                          where user_id = new.user_id and revoked_at is null
                            and (expires_at is null or expires_at > now())) >= lim then
    raise exception 'plan_limit:share_links';
  end if;
  days := public.plan_limit_int(new.user_id, 'share_days');
  if days is not null then new.expires_at := now() + make_interval(days => days); end if;
  return new;
end;
$$;

drop trigger if exists report_shares_zz_plan_guard on public.report_shares;
create trigger report_shares_zz_plan_guard
  before insert on public.report_shares
  for each row execute function public.plan_guard_report_shares();

-- Просроченная ссылка не открывается, как отозванная.
create or replace function public.get_shared_report(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.report_shares;
begin
  if p_token is null or length(p_token) < 20 then
    return null;
  end if;
  update public.report_shares
     set views = views + 1, last_viewed_at = now()
   where token = p_token and revoked_at is null
     and (expires_at is null or expires_at > now())
  returning * into r;
  if not found then
    return null;
  end if;
  return jsonb_build_object('title', r.title, 'created_at', r.created_at, 'expires_at', r.expires_at, 'data', r.data);
end;
$$;

revoke all on function public.get_shared_report(text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated;
