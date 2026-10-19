-- 0.33: профиль вместо «Ещё» и вкладка «Фокус».

/* ── профиль ────────────────────────────────────────────────────── */

-- имя, как называть человека в приложении; фото — путь в бакете avatars
alter table user_settings
  add column display_name text,
  add column avatar_path text,
  -- режим фокуса и длительности: {"pomodoro":{"work":25,"short":5,"long":15,"cycles":4},"deep":{"work":90,"rest":30}}
  add column focus_mode text not null default 'pomodoro' check (focus_mode in ('pomodoro', '9030')),
  add column focus_settings jsonb not null default '{}';

-- Фото профиля: закрытый бакет, путь начинается с id владельца — видит и меняет только он.
insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', false, 2097152)
on conflict (id) do nothing;

create policy "avatars_read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

/* ── фокус ──────────────────────────────────────────────────────── */

-- Идущая фокус-сессия: одна на пользователя. Рабочий отрезок — это обычный учёт
-- (active_timers), перерыв учёт не пишет. plan — отрезки по порядку, после последнего
-- снова первый: [{"kind":"work","seconds":1500},{"kind":"break","seconds":300},…].
create table focus_runs (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  mode text not null check (mode in ('pomodoro', '9030')),
  plan jsonb not null,
  phase_index integer not null default 0,
  phase_kind text not null check (phase_kind in ('work', 'break', 'long')),
  -- running — отрезок идёт; paused — на паузе; ready — перерыв кончился, ждёт старта работы
  state text not null check (state in ('running', 'paused', 'ready')),
  phase_started_at timestamptz,
  phase_ends_at timestamptz,
  -- сколько осталось у отрезка на паузе / ждущего старта
  left_seconds integer,
  updated_at timestamptz not null default now()
);
alter table focus_runs enable row level security;
create policy "focus_runs_owner" on focus_runs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Журнал рабочих отрезков: «помидоров сегодня», «глубоких сессий». completed — отрезок
-- доработан до конца; остановленный раньше в учёт попал, но помидором не считается.
create table focus_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  mode text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  completed boolean not null,
  created_at timestamptz not null default now()
);
create index focus_sessions_user_idx on focus_sessions(user_id, started_at desc);
alter table focus_sessions enable row level security;
create policy "focus_sessions_select" on focus_sessions for select using (user_id = auth.uid());

-- отрезок плана по номеру (по кругу)
create function focus_phase(p_plan jsonb, p_index integer) returns jsonb as $$
  select p_plan -> (p_index % jsonb_array_length(p_plan))
$$ language sql immutable set search_path = public;

/**
 * Довести фокус-сессии до текущего момента: закончившаяся работа закрывает учёт ровно в
 * конце отрезка и начинает перерыв; закончившийся перерыв ставит следующую работу в
 * ожидание — учёт без человека сам не начинается. Возвращает переходы — по ним сервер
 * шлёт пуш и Telegram.
 *
 * Вызывает приложение (только свою сессию) и функция напоминаний с сервисным ключом
 * (все сессии, p_user null).
 */
create function focus_advance(p_user uuid default null)
returns table (user_id uuid, task_id uuid, ended_kind text, next_kind text, next_seconds integer) as $$
declare
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_user uuid := case when v_service then p_user else auth.uid() end;
  r focus_runs;
  t active_timers;
  v_tz text;
  v_next jsonb;
  v_ended text;
begin
  if not v_service and v_user is null then raise exception 'Нужно войти заново'; end if;
  for r in
    select * from focus_runs f
    where f.state = 'running' and f.phase_ends_at <= now() and (v_user is null or f.user_id = v_user)
    for update skip locked
  loop
    v_ended := r.phase_kind;
    -- несколько отрезков могли пройти, пока приложение было закрыто: доводим по одному,
    -- но работа без человека не начинается — на ней цикл и останавливается
    loop
      if r.phase_kind = 'work' then
        select * into t from active_timers a where a.user_id = r.user_id;
        if found and t.task_id is not distinct from r.task_id and t.started_at <= r.phase_ends_at then
          select s.timezone into v_tz from user_settings s where s.user_id = r.user_id;
          perform timer_close(t, r.phase_ends_at, v_tz);
        end if;
        insert into focus_sessions (user_id, task_id, mode, started_at, ended_at, completed)
        values (r.user_id, r.task_id, r.mode, r.phase_started_at, r.phase_ends_at, true);
        v_next := focus_phase(r.plan, r.phase_index + 1);
        r.phase_index := r.phase_index + 1;
        r.phase_kind := v_next ->> 'kind';
        r.phase_started_at := r.phase_ends_at;
        r.phase_ends_at := r.phase_ends_at + make_interval(secs => (v_next ->> 'seconds')::int);
        exit when r.phase_ends_at > now();
      else
        v_next := focus_phase(r.plan, r.phase_index + 1);
        r.phase_index := r.phase_index + 1;
        r.phase_kind := v_next ->> 'kind';
        r.state := 'ready';
        r.left_seconds := (v_next ->> 'seconds')::int;
        r.phase_started_at := null;
        r.phase_ends_at := null;
        exit;
      end if;
    end loop;
    update focus_runs f set phase_index = r.phase_index, phase_kind = r.phase_kind, state = r.state,
      phase_started_at = r.phase_started_at, phase_ends_at = r.phase_ends_at, left_seconds = r.left_seconds,
      updated_at = now()
    where f.user_id = r.user_id;
    user_id := r.user_id;
    task_id := r.task_id;
    ended_kind := v_ended;
    next_kind := r.phase_kind;
    next_seconds := coalesce(r.left_seconds, extract(epoch from r.phase_ends_at - r.phase_started_at)::int);
    return next;
  end loop;
end;
$$ language plpgsql security definer set search_path = public;

/** Начать фокус по задаче: первый отрезок плана — работа, учёт начинается сразу. */
create function focus_start(p_task_id uuid, p_mode text, p_plan jsonb, p_tz text default null) returns void as $$
declare
  v_first jsonb := focus_phase(p_plan, 0);
begin
  if auth.uid() is null then raise exception 'Нужно войти заново'; end if;
  if jsonb_typeof(p_plan) <> 'array' or jsonb_array_length(p_plan) = 0 or v_first ->> 'kind' <> 'work' then
    raise exception 'План фокуса должен начинаться с работы';
  end if;
  perform timer_start(p_task_id, now(), p_tz);
  insert into focus_runs (user_id, task_id, mode, plan, phase_index, phase_kind, state, phase_started_at, phase_ends_at, left_seconds)
  values (auth.uid(), p_task_id, p_mode, p_plan, 0, 'work', 'running', now(), now() + make_interval(secs => (v_first ->> 'seconds')::int), null)
  on conflict (user_id) do update set task_id = excluded.task_id, mode = excluded.mode, plan = excluded.plan,
    phase_index = 0, phase_kind = 'work', state = 'running', phase_started_at = excluded.phase_started_at,
    phase_ends_at = excluded.phase_ends_at, left_seconds = null, updated_at = now();
end;
$$ language plpgsql security invoker set search_path = public;

/** Пауза: у работы учёт закрывается сейчас (только если идёт по задаче фокуса). */
create function focus_pause(p_tz text default null) returns void as $$
declare
  r focus_runs;
  t active_timers;
begin
  select * into r from focus_runs where user_id = auth.uid() for update;
  if not found or r.state <> 'running' then return; end if;
  if r.phase_kind = 'work' then
    select * into t from active_timers where user_id = auth.uid();
    if found and t.task_id is not distinct from r.task_id then perform timer_stop(now(), p_tz, t.started_at); end if;
  end if;
  update focus_runs set state = 'paused', left_seconds = greatest(0, ceil(extract(epoch from phase_ends_at - now())))::int,
    phase_ends_at = null, updated_at = now()
  where user_id = auth.uid();
end;
$$ language plpgsql security invoker set search_path = public;

/** Продолжить после паузы или начать ждущую работу; p_task_id — сменить задачу. */
create function focus_resume(p_tz text default null, p_task_id uuid default null) returns void as $$
declare
  r focus_runs;
begin
  select * into r from focus_runs where user_id = auth.uid() for update;
  if not found or r.state = 'running' then return; end if;
  if p_task_id is not null then r.task_id := p_task_id; end if;
  if r.phase_kind = 'work' and r.task_id is not null then perform timer_start(r.task_id, now(), p_tz); end if;
  update focus_runs set task_id = r.task_id, state = 'running',
    -- после паузы отрезок продолжается: «начало» сдвигается так, чтобы длина осталась прежней
    phase_started_at = now() - make_interval(secs => (focus_phase(plan, phase_index) ->> 'seconds')::int - coalesce(left_seconds, 0)),
    phase_ends_at = now() + make_interval(secs => coalesce(left_seconds, (focus_phase(plan, phase_index) ->> 'seconds')::int)),
    left_seconds = null, updated_at = now()
  where user_id = auth.uid();
end;
$$ language plpgsql security invoker set search_path = public;

/**
 * Следующий отрезок сейчас. Прерванная работа: учёт закрыт, в журнале — не доработан.
 * Нажатие — это решение человека, поэтому следующая работа начинается сразу.
 */
create function focus_skip(p_tz text default null) returns void as $$
declare
  r focus_runs;
  t active_timers;
  v_next jsonb;
begin
  select * into r from focus_runs where user_id = auth.uid() for update;
  if not found then return; end if;
  if r.phase_kind = 'work' and r.state = 'running' then
    select * into t from active_timers where user_id = auth.uid();
    if found and t.task_id is not distinct from r.task_id then perform timer_stop(now(), p_tz, t.started_at); end if;
    insert into focus_sessions (user_id, task_id, mode, started_at, ended_at, completed)
    values (auth.uid(), r.task_id, r.mode, r.phase_started_at, now(), false);
  end if;
  v_next := focus_phase(r.plan, r.phase_index + 1);
  if v_next ->> 'kind' = 'work' and r.task_id is not null then perform timer_start(r.task_id, now(), p_tz); end if;
  update focus_runs set phase_index = phase_index + 1, phase_kind = v_next ->> 'kind', state = 'running',
    phase_started_at = now(), phase_ends_at = now() + make_interval(secs => (v_next ->> 'seconds')::int),
    left_seconds = null, updated_at = now()
  where user_id = auth.uid();
end;
$$ language plpgsql security invoker set search_path = public;

/** Закончить фокус: идущая работа закрывает учёт и пишется в журнал недоработанной. */
create function focus_stop(p_tz text default null) returns void as $$
declare
  r focus_runs;
  t active_timers;
begin
  select * into r from focus_runs where user_id = auth.uid() for update;
  if not found then return; end if;
  if r.phase_kind = 'work' and r.state = 'running' then
    select * into t from active_timers where user_id = auth.uid();
    if found and t.task_id is not distinct from r.task_id then perform timer_stop(now(), p_tz, t.started_at); end if;
    insert into focus_sessions (user_id, task_id, mode, started_at, ended_at, completed)
    values (auth.uid(), r.task_id, r.mode, r.phase_started_at, now(), false);
  end if;
  delete from focus_runs where user_id = auth.uid();
end;
$$ language plpgsql security invoker set search_path = public;

-- журнал пишут только функции фокуса: у пользователя прав на вставку нет
alter function focus_skip(text) security definer;
alter function focus_stop(text) security definer;

revoke execute on function public.focus_phase(jsonb, integer) from public, anon;
revoke execute on function public.focus_advance(uuid) from public, anon;
revoke execute on function public.focus_start(uuid, text, jsonb, text) from public, anon;
revoke execute on function public.focus_pause(text) from public, anon;
revoke execute on function public.focus_resume(text, uuid) from public, anon;
revoke execute on function public.focus_skip(text) from public, anon;
revoke execute on function public.focus_stop(text) from public, anon;
grant execute on function public.focus_phase(jsonb, integer) to authenticated, service_role;
grant execute on function public.focus_advance(uuid) to authenticated, service_role;
grant execute on function public.focus_start(uuid, text, jsonb, text) to authenticated;
grant execute on function public.focus_pause(text) to authenticated;
grant execute on function public.focus_resume(text, uuid) to authenticated;
grant execute on function public.focus_skip(text) to authenticated;
grant execute on function public.focus_stop(text) to authenticated;
