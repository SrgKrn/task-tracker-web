-- Учёт времени: секунды вместо минут и старт/стоп таймера одним запросом.
--
-- Раньше клиент останавливал таймер тремя запросами (прочитать, записать сессию, удалить
-- таймер), а длительность округлял до минут: сессия 20 с записывалась как 0 мин. Теперь
-- длительность хранится в секундах, минуты остаются для старых клиентов и отчётов и
-- считаются из секунд автоматически.

/* ── длительность в секундах ─────────────────────────────────────── */

alter table time_entries add column duration_seconds integer;
-- перенос без пересчёта факта: минуты × 60 дают тот же факт, а пересчёт по каждой записи
-- сдвинул бы updated_at у всех задач с учётом
alter table time_entries disable trigger time_entries_recompute_fact_hours;
update time_entries set duration_seconds = duration_minutes * 60;
alter table time_entries enable trigger time_entries_recompute_fact_hours;

-- старый клиент пишет только минуты — секунды досчитываются; новый пишет секунды —
-- минуты округляются из них. Правка одного поля держит второе в согласии.
create function sync_entry_duration() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if new.duration_seconds is null then
      new.duration_seconds := new.duration_minutes * 60;
    else
      new.duration_minutes := round(new.duration_seconds / 60.0);
    end if;
  elsif new.duration_seconds is distinct from old.duration_seconds then
    new.duration_minutes := round(new.duration_seconds / 60.0);
  elsif new.duration_minutes is distinct from old.duration_minutes then
    new.duration_seconds := new.duration_minutes * 60;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;
revoke execute on function public.sync_entry_duration() from public;

create trigger time_entries_sync_duration
before insert or update on time_entries
for each row execute function sync_entry_duration();

alter table time_entries alter column duration_seconds set not null;
-- минуты теперь может не прислать новый клиент: их посчитает триггер
alter table time_entries alter column duration_minutes drop not null;

-- факт задачи — из секунд, без потери коротких сессий
create or replace function recompute_fact_hours() returns trigger as $$
begin
  update tasks
  set fact_hours = coalesce(
    (select sum(duration_seconds) from time_entries where task_id = coalesce(new.task_id, old.task_id)),
    0
  ) / 3600.0,
  updated_at = now()
  where id = coalesce(new.task_id, old.task_id);
  return null;
end;
$$ language plpgsql security definer set search_path = public;
revoke execute on function public.recompute_fact_hours() from public;

/* ── старт и стоп таймера одним запросом ─────────────────────────── */

-- Часовой пояс пользователя для даты сессии: незнакомый — UTC.
create function timer_zone(p_tz text) returns text as $$
begin
  perform now() at time zone p_tz;
  return p_tz;
exception when others then
  return 'UTC';
end;
$$ language plpgsql stable set search_path = public;

-- Закрыть идущую сессию моментом p_at: запись в историю, таймер — прочь.
-- Вызывается только из timer_start и timer_stop внутри их блокировки.
create function timer_close(p_timer active_timers, p_at timestamptz, p_tz text) returns json as $$
declare
  v_end timestamptz := greatest(p_at, p_timer.started_at);
  v_seconds integer := floor(extract(epoch from v_end - p_timer.started_at))::integer;
  v_entry uuid;
begin
  insert into time_entries (user_id, task_id, entry_type, started_at, ended_at, duration_seconds, effective_date)
  values (
    p_timer.user_id, p_timer.task_id, 'timer', p_timer.started_at, v_end, v_seconds,
    -- сессия относится к дню своего начала в местном времени
    (p_timer.started_at at time zone timer_zone(p_tz))::date
  )
  returning id into v_entry;
  delete from active_timers where user_id = p_timer.user_id;
  return json_build_object('task_id', p_timer.task_id, 'seconds', v_seconds, 'entry_id', v_entry);
end;
$$ language plpgsql set search_path = public;

/**
 * Начать учёт по задаче. Идущий по другой задаче — сначала закрывается.
 * p_at — момент нажатия на устройстве (действие могло ждать сети в очереди); будущее и
 * слишком старое отбрасываются. Если с тех пор уже начат более поздний учёт, действие
 * устарело и ничего не меняет.
 */
create function timer_start(p_task_id uuid, p_at timestamptz default null, p_tz text default null)
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
 */
create function timer_stop(p_at timestamptz default null, p_tz text default null, p_started_at timestamptz default null)
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
  return json_build_object('stopped', timer_close(v_cur, v_at, p_tz));
end;
$$ language plpgsql set search_path = public;

-- вызывать могут только вошедшие пользователи; RLS всё равно ограничивает их своими строками
revoke execute on function public.timer_zone(text) from public;
revoke execute on function public.timer_close(active_timers, timestamptz, text) from public;
revoke execute on function public.timer_start(uuid, timestamptz, text) from public;
revoke execute on function public.timer_stop(timestamptz, text, timestamptz) from public;
grant execute on function public.timer_zone(text) to authenticated;
grant execute on function public.timer_close(active_timers, timestamptz, text) to authenticated;
grant execute on function public.timer_start(uuid, timestamptz, text) to authenticated;
grant execute on function public.timer_stop(timestamptz, text, timestamptz) to authenticated;
