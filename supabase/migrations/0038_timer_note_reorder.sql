-- 0.42: комментарий к идущему учёту и перестановка задач одним запросом.
--
-- 1. active_timers.note — комментарий, который пишут, пока учёт идёт. При остановке любым
--    путём (кольцо, карточка, фокус, переключение задачи) timer_close переносит его в запись
--    истории. Telegram останавливает учёт сам и переносит комментарий у себя.
-- 2. timer_start / timer_stop получают необязательный p_note: последний набранный текст едет
--    вместе с нажатием, даже если автосохранение не успело или нажатие ждало сети. Старые
--    клиенты и функции фокуса зовут их без p_note — работают как раньше.
-- 3. reorder_tasks(p_items) — новые места задач одним запросом (при переходе на «свой
--    порядок» их больше сотни; раньше был запрос на каждую задачу).

alter table public.active_timers
  add column if not exists note text check (note is null or char_length(note) <= 2000);

-- Закрыть идущую сессию моментом p_at: запись в историю (с комментарием), таймер — прочь.
create or replace function public.timer_close(p_timer active_timers, p_at timestamptz, p_tz text) returns json as $$
declare
  v_end timestamptz := greatest(p_at, p_timer.started_at);
  v_seconds integer := floor(extract(epoch from v_end - p_timer.started_at))::integer;
  v_entry uuid;
begin
  insert into time_entries (user_id, task_id, entry_type, started_at, ended_at, duration_seconds, effective_date, note)
  values (
    p_timer.user_id, p_timer.task_id, 'timer', p_timer.started_at, v_end, v_seconds,
    -- сессия относится к дню своего начала в местном времени; без пояса — UTC (раньше
    -- вызов без p_tz падал на пустой дате)
    (p_timer.started_at at time zone timer_zone(coalesce(p_tz, 'UTC')))::date,
    nullif(btrim(p_timer.note), '')
  )
  returning id into v_entry;
  delete from active_timers where user_id = p_timer.user_id;
  return json_build_object('task_id', p_timer.task_id, 'seconds', v_seconds, 'entry_id', v_entry);
end;
$$ language plpgsql set search_path = public;

drop function if exists public.timer_start(uuid, timestamptz, text);
drop function if exists public.timer_stop(timestamptz, text, timestamptz);

/**
 * Начать учёт по задаче. Идущий по другой задаче — сначала закрывается; p_note, если
 * передан, — его последний комментарий (null — оставить тот, что сохранён).
 */
create function public.timer_start(p_task_id uuid, p_at timestamptz default null, p_tz text default null, p_note text default null)
returns json as $$
declare
  v_user uuid := auth.uid();
  v_at timestamptz := least(coalesce(p_at, now()), now());
  v_cur active_timers;
  v_stopped json;
begin
  if v_user is null then raise exception 'Нужно войти заново'; end if;
  if v_at < now() - interval '7 days' then v_at := now(); end if;
  perform 1 from tasks where id = p_task_id and user_id = v_user;
  if not found then raise exception 'Задача не найдена'; end if;

  -- два устройства одновременно не начнут два учёта
  perform pg_advisory_xact_lock(hashtext('timer:' || v_user::text));

  select * into v_cur from active_timers where user_id = v_user;
  if found then
    if v_cur.task_id = p_task_id then
      return json_build_object('started_at', v_cur.started_at, 'task_id', p_task_id, 'stopped', null);
    end if;
    if v_cur.started_at > v_at then
      return json_build_object('started_at', v_cur.started_at, 'task_id', v_cur.task_id, 'stopped', null, 'stale', true);
    end if;
    if p_note is not null then v_cur.note := left(p_note, 2000); end if;
    v_stopped := timer_close(v_cur, v_at, p_tz);
  end if;

  insert into active_timers (user_id, task_id, started_at, reminded_hours)
  values (v_user, p_task_id, v_at, 0);
  return json_build_object('started_at', v_at, 'task_id', p_task_id, 'stopped', v_stopped);
end;
$$ language plpgsql set search_path = public;

/**
 * Остановить учёт моментом p_at. p_started_at — какой именно учёт останавливают: если
 * с тех пор начат другой (на другом устройстве или из Telegram), он не трогается.
 * p_note — последний комментарий (null — оставить сохранённый).
 */
create function public.timer_stop(p_at timestamptz default null, p_tz text default null, p_started_at timestamptz default null, p_note text default null)
returns json as $$
declare
  v_user uuid := auth.uid();
  v_at timestamptz := least(coalesce(p_at, now()), now());
  v_cur active_timers;
begin
  if v_user is null then raise exception 'Нужно войти заново'; end if;
  perform pg_advisory_xact_lock(hashtext('timer:' || v_user::text));

  select * into v_cur from active_timers where user_id = v_user;
  if not found then return json_build_object('stopped', null); end if;
  -- сравнение до секунды: клиент хранит время без микросекунд
  if p_started_at is not null and date_trunc('second', v_cur.started_at) <> date_trunc('second', p_started_at) then
    return json_build_object('stopped', null, 'stale', true);
  end if;
  if p_note is not null then v_cur.note := left(p_note, 2000); end if;
  return json_build_object('stopped', timer_close(v_cur, v_at, p_tz));
end;
$$ language plpgsql set search_path = public;

revoke execute on function public.timer_start(uuid, timestamptz, text, text) from public;
revoke execute on function public.timer_stop(timestamptz, text, timestamptz, text) from public;
grant execute on function public.timer_start(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.timer_stop(timestamptz, text, timestamptz, text) to authenticated;

/**
 * Новые места задач: [{id, sort_order}, …]. Только свои задачи; чужие и несуществующие id
 * молча пропускаются. Возвращает число переставленных.
 */
create or replace function public.reorder_tasks(p_items jsonb) returns integer as $$
declare
  v_n integer;
begin
  if auth.uid() is null then raise exception 'Нужно войти заново'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 2000 then
    raise exception 'reorder_tasks: нужен массив до 2000 задач';
  end if;
  update tasks t
  set sort_order = (x ->> 'sort_order')::double precision
  from jsonb_array_elements(p_items) x
  where t.id = (x ->> 'id')::uuid
    and t.user_id = auth.uid()
    and t.sort_order is distinct from (x ->> 'sort_order')::double precision;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$ language plpgsql security invoker set search_path = public;

revoke execute on function public.reorder_tasks(jsonb) from public;
grant execute on function public.reorder_tasks(jsonb) to authenticated;
