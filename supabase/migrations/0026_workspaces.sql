-- 0.36: рабочие пространства. В одном профиле — несколько независимых пространств:
-- например «Работа» с клиентами и «Спорт». У каждого свои группы, значения, этапы, задачи,
-- учёт, норма часов, методика и режим фокуса. Общее на профиль — имя, фото, почта, тема,
-- уведомления, Telegram, Google. Учёт времени один на профиль: идти он может только по
-- одной задаче, из любого пространства.
--
-- Всё, что было до сих пор, переезжает в пространство «Работа» — оно основное. Старые
-- версии приложения, которые о пространствах не знают, пишут новые задачи и группы в
-- основное. Серверные функции (Telegram, календарь, итоги дня) пока видят все
-- пространства вместе — их разделение отдельным релизом.

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  -- метка дизайн-системы: точка пространства в переключателе и подписях
  color text not null default 'label-1' check (color ~ '^label-[1-8]$'),
  -- из какого пресета создано (для подсказок); null — собрано вручную
  preset_code text,
  -- основное: сюда пишут старые версии приложения, его настройки видят серверные функции
  is_default boolean not null default false,
  sort_order integer not null default 0,
  planned_hours_per_day numeric,
  planned_hours_per_month numeric,
  work_days_per_week integer not null default 5 check (work_days_per_week between 1 and 7),
  priority_method text not null default 'none' check (priority_method in ('none', 'eisenhower', 'frog', '135', 'abcde')),
  focus_mode text not null default 'pomodoro' check (focus_mode in ('pomodoro', '9030')),
  focus_settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspaces_user_idx on workspaces(user_id);
create unique index workspaces_one_default on workspaces(user_id) where is_default;
create trigger workspaces_set_updated_at before update on workspaces for each row execute function set_updated_at();
alter table workspaces enable row level security;
create policy "workspaces_owner" on workspaces for all using (user_id = auth.uid()) with check (user_id = auth.uid());

/* ── перенос: у каждого пользователя — основное пространство с его настройками ── */

insert into workspaces (user_id, name, is_default, planned_hours_per_day, planned_hours_per_month,
  work_days_per_week, priority_method, focus_mode, focus_settings)
select u.id, 'Работа', true, s.planned_hours_per_day, s.planned_hours_per_month,
  coalesce(s.work_days_per_week, 5), coalesce(s.priority_method, 'none'), coalesce(s.focus_mode, 'pomodoro'),
  coalesce(s.focus_settings, '{}')
from auth.users u left join user_settings s on s.user_id = u.id;

alter table groups add column workspace_id uuid references workspaces(id) on delete cascade;
alter table group_items add column workspace_id uuid references workspaces(id) on delete cascade;
alter table statuses add column workspace_id uuid references workspaces(id) on delete cascade;
alter table tasks add column workspace_id uuid references workspaces(id) on delete cascade;
alter table time_entries add column workspace_id uuid references workspaces(id) on delete cascade;
alter table task_status_events add column workspace_id uuid references workspaces(id) on delete cascade;
alter table comments add column workspace_id uuid references workspaces(id) on delete cascade;
alter table attachments add column workspace_id uuid references workspaces(id) on delete cascade;
alter table task_changes add column workspace_id uuid references workspaces(id) on delete cascade;

-- без триггеров: переезд не должен сдвинуть updated_at, пересчитать часы или попасть в журнал
alter table groups disable trigger user;
alter table group_items disable trigger user;
alter table statuses disable trigger user;
alter table tasks disable trigger user;
alter table time_entries disable trigger user;
alter table task_status_events disable trigger user;
alter table comments disable trigger user;
alter table attachments disable trigger user;
update groups t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and w.is_default;
update group_items t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and w.is_default;
update statuses t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and w.is_default;
update tasks t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and w.is_default;
update time_entries t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and w.is_default;
update task_status_events t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and w.is_default;
update comments t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and w.is_default;
update attachments t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and w.is_default;
update task_changes t set workspace_id = w.id from workspaces w where w.user_id = t.user_id and w.is_default;
alter table groups enable trigger user;
alter table group_items enable trigger user;
alter table statuses enable trigger user;
alter table tasks enable trigger user;
alter table time_entries enable trigger user;
alter table task_status_events enable trigger user;
alter table comments enable trigger user;
alter table attachments enable trigger user;

alter table groups alter column workspace_id set not null;
alter table group_items alter column workspace_id set not null;
alter table statuses alter column workspace_id set not null;
alter table tasks alter column workspace_id set not null;
alter table time_entries alter column workspace_id set not null;

create index groups_workspace_idx on groups(workspace_id);
create index group_items_workspace_idx on group_items(workspace_id);
create index statuses_workspace_idx on statuses(workspace_id);
create index tasks_workspace_idx on tasks(workspace_id);
create index time_entries_workspace_date_idx on time_entries(workspace_id, effective_date);
create index task_status_events_workspace_idx on task_status_events(workspace_id);
create index comments_workspace_idx on comments(workspace_id);
create index attachments_workspace_idx on attachments(workspace_id);
create index task_changes_workspace_idx on task_changes(workspace_id, created_at desc);

/* ── пространство у новых записей ───────────────────────────────── */

-- основное пространство пользователя — для записей старых версий приложения
create function default_workspace(p_user uuid) returns uuid as $$
  select id from public.workspaces where user_id = p_user and is_default limit 1
$$ language sql stable security definer set search_path = public;

-- Группа и этап: пространство своё; не указано — основное.
create function workspace_owned_guard() returns trigger as $$
begin
  if new.workspace_id is null then
    new.workspace_id := default_workspace(new.user_id);
  end if;
  if not exists (select 1 from workspaces where id = new.workspace_id and user_id = new.user_id) then
    raise exception 'Пространство не найдено';
  end if;
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'Перенос между пространствами пока не поддерживается';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- у групп ещё и связь «входит в» — только внутри пространства
create function groups_workspace_link() returns trigger as $$
begin
  if new.parent_group_id is not null
     and not exists (select 1 from groups where id = new.parent_group_id and workspace_id = new.workspace_id) then
    raise exception 'Группа может входить только в группу того же пространства';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger groups_workspace_link before insert or update of workspace_id, parent_group_id on groups
for each row execute function groups_workspace_link();

create trigger groups_workspace before insert or update of workspace_id, parent_group_id on groups
for each row execute function workspace_owned_guard();
create trigger statuses_workspace before insert or update of workspace_id on statuses
for each row execute function workspace_owned_guard();

-- Значение — в пространстве своей группы, всегда.
create function group_items_workspace() returns trigger as $$
begin
  select workspace_id into new.workspace_id from groups where id = new.group_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger group_items_workspace before insert or update of group_id on group_items
for each row execute function group_items_workspace();

-- Задача: подзадача — в пространстве спринта; не указано — основное. Значения групп и
-- этап — только из того же пространства.
create function tasks_workspace() returns trigger as $$
begin
  if new.parent_id is not null then
    select workspace_id into new.workspace_id from tasks where id = new.parent_id;
  elsif new.workspace_id is null then
    new.workspace_id := default_workspace(new.user_id);
  end if;
  if not exists (select 1 from workspaces where id = new.workspace_id and user_id = new.user_id) then
    raise exception 'Пространство не найдено';
  end if;
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id and new.parent_id is null then
    raise exception 'Перенос между пространствами пока не поддерживается';
  end if;
  if exists (select 1 from group_items where id = any(new.item_ids) and workspace_id <> new.workspace_id) then
    raise exception 'Значения групп — из другого пространства';
  end if;
  if new.status_id is not null and exists (select 1 from statuses where id = new.status_id and workspace_id <> new.workspace_id) then
    raise exception 'Этап — из другого пространства';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
-- «a» в начале имени — раньше tasks_items_guard: тот подставляет значения связанных групп
create trigger a_tasks_workspace before insert or update of workspace_id, parent_id, item_ids, status_id on tasks
for each row execute function tasks_workspace();

-- Учёт, этапы, комментарии, файлы — в пространстве своей задачи (файл значения — значения).
create function from_task_workspace() returns trigger as $$
begin
  if new.task_id is not null then
    select workspace_id into new.workspace_id from tasks where id = new.task_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- файл задачи — в пространстве задачи, файл значения группы — значения
create function attachments_workspace() returns trigger as $$
begin
  if new.task_id is not null then
    select workspace_id into new.workspace_id from tasks where id = new.task_id;
  elsif new.item_id is not null then
    select workspace_id into new.workspace_id from group_items where id = new.item_id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger a_time_entries_workspace before insert or update of task_id on time_entries
for each row execute function from_task_workspace();
create trigger task_status_events_workspace before insert on task_status_events
for each row execute function from_task_workspace();
create trigger comments_workspace before insert or update of task_id on comments
for each row execute function from_task_workspace();
create trigger attachments_workspace before insert or update of task_id, item_id on attachments
for each row execute function attachments_workspace();

-- Журнал изменений задач пишет и пространство: запись об удалении задачи переживает
-- саму задачу, и пространство у неё иначе не узнать.
create or replace function log_task_changes() returns trigger as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    insert into public.task_changes (user_id, workspace_id, task_id, task_name, field, new_value)
    values (new.user_id, new.workspace_id, new.id, new.name, 'created', null);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.task_changes (user_id, workspace_id, task_id, task_name, field, old_value)
    values (old.user_id, old.workspace_id, old.id, old.name, 'deleted', null);
    return old;
  end if;

  if new.name is distinct from old.name then
    insert into public.task_changes (user_id, workspace_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.workspace_id, new.id, new.name, 'name', to_jsonb(old.name), to_jsonb(new.name));
  end if;
  if new.planned_hours is distinct from old.planned_hours then
    insert into public.task_changes (user_id, workspace_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.workspace_id, new.id, new.name, 'planned_hours', to_jsonb(old.planned_hours), to_jsonb(new.planned_hours));
  end if;
  if new.start_date is distinct from old.start_date then
    insert into public.task_changes (user_id, workspace_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.workspace_id, new.id, new.name, 'start_date', to_jsonb(old.start_date), to_jsonb(new.start_date));
  end if;
  if new.end_date is distinct from old.end_date then
    insert into public.task_changes (user_id, workspace_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.workspace_id, new.id, new.name, 'end_date', to_jsonb(old.end_date), to_jsonb(new.end_date));
  end if;
  if new.is_daily is distinct from old.is_daily then
    insert into public.task_changes (user_id, workspace_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.workspace_id, new.id, new.name, 'is_daily', to_jsonb(old.is_daily), to_jsonb(new.is_daily));
  end if;
  if new.parent_id is distinct from old.parent_id then
    insert into public.task_changes (user_id, workspace_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.workspace_id, new.id, new.name, 'parent_id', to_jsonb(old.parent_id), to_jsonb(new.parent_id));
  end if;
  -- у подзадачи группы повторяют спринт: их смену пишем только у самого спринта
  if new.parent_id is null and new.item_ids is distinct from old.item_ids then
    insert into public.task_changes (user_id, workspace_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.workspace_id, new.id, new.name, 'item_ids', to_jsonb(old.item_ids), to_jsonb(new.item_ids));
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

/* ── основное пространство ──────────────────────────────────────── */

-- Настройки основного пространства копируются в user_settings: их читают серверные
-- функции (итоги дня, Telegram) и старые версии приложения.
create function workspaces_sync_settings() returns trigger as $$
begin
  if new.is_default then
    insert into public.user_settings (user_id) values (new.user_id) on conflict (user_id) do nothing;
    update public.user_settings set
      planned_hours_per_day = new.planned_hours_per_day,
      planned_hours_per_month = new.planned_hours_per_month,
      work_days_per_week = new.work_days_per_week,
      priority_method = new.priority_method,
      focus_mode = new.focus_mode,
      focus_settings = new.focus_settings
    where user_id = new.user_id;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;
create trigger workspaces_sync_settings after insert or update on workspaces
for each row execute function workspaces_sync_settings();

-- Основное пространство не удаляется (кроме удаления всего аккаунта).
create function workspaces_delete_guard() returns trigger as $$
begin
  if old.is_default and exists (select 1 from auth.users where id = old.user_id) then
    raise exception 'Основное пространство удалить нельзя';
  end if;
  return old;
end;
$$ language plpgsql security definer set search_path = public;
create trigger workspaces_delete_guard before delete on workspaces
for each row execute function workspaces_delete_guard();

/**
 * Удалить пространство со всем содержимым: задачи (с учётом и историей), группы, этапы.
 * По порядку: сперва связи, потом задачи, потом группы — иначе триггеры групп отвязывали
 * бы строки, которые удаляются той же командой. Файлы из хранилища удаляет приложение.
 */
create function delete_workspace(p_workspace uuid) returns void as $$
begin
  if not exists (select 1 from workspaces where id = p_workspace and user_id = auth.uid()) then
    raise exception 'Пространство не найдено';
  end if;
  update group_items set parent_item_id = null where workspace_id = p_workspace and parent_item_id is not null;
  update groups set parent_group_id = null where workspace_id = p_workspace and parent_group_id is not null;
  delete from tasks where workspace_id = p_workspace and parent_id is not null;
  delete from tasks where workspace_id = p_workspace;
  delete from groups where workspace_id = p_workspace;
  delete from statuses where workspace_id = p_workspace;
  delete from workspaces where id = p_workspace;
end;
$$ language plpgsql security invoker set search_path = public;

/* ── лягушка — своя в каждом пространстве ───────────────────────── */

drop index tasks_one_frog_per_day;
create unique index tasks_one_frog_per_day on tasks(workspace_id, frog_date) where frog_date is not null;

drop function set_frog(uuid, date);
create function set_frog(p_task_id uuid, p_date date, p_workspace uuid default null) returns void as $$
declare
  v_ws uuid := coalesce((select workspace_id from public.tasks where id = p_task_id), p_workspace);
begin
  update public.tasks set frog_date = null
  where user_id = auth.uid() and frog_date = p_date and id is distinct from p_task_id
    and (v_ws is null or workspace_id = v_ws);
  if p_task_id is not null then
    update public.tasks set frog_date = p_date where id = p_task_id and user_id = auth.uid();
  end if;
end;
$$ language plpgsql security invoker set search_path = public;
revoke execute on function public.set_frog(uuid, date, uuid) from public, anon;
grant execute on function public.set_frog(uuid, date, uuid) to authenticated;

/* ── пресет — в пространство ───────────────────────────────────── */

/**
 * Применить пресет к пространству p_workspace; null — создать новое пространство
 * (название и цвет — p_options.name / p_options.color, первое пространство — основное).
 * Остальное как раньше: группы по названию не дублируются (в пределах пространства),
 * связь — только у созданных сейчас, этапы — если в пространстве своих нет. Настройки
 * (норма, методика, фокус) пишутся в пространство.
 */
drop function apply_preset(jsonb, jsonb);
create function apply_preset(p_preset jsonb, p_options jsonb default '{}', p_workspace uuid default null) returns json as $$
declare
  v_user uuid := auth.uid();
  v_ws uuid := p_workspace;
  g jsonb;
  v jsonb;
  e jsonb;
  ref jsonb;
  v_gid uuid;
  v_vid uuid;
  v_parent_gid uuid;
  v_order integer;
  v_status uuid;
  v_items uuid[];
  gmap jsonb := '{}';
  created jsonb := '{}';
  n_groups integer := 0;
  n_values integer := 0;
  n_tasks integer := 0;
  n_stages integer := 0;
  v_examples boolean := coalesce((p_options ->> 'examples')::boolean, false);
  v_today date;
begin
  if v_user is null then raise exception 'Нужно войти заново'; end if;

  if v_ws is null then
    select coalesce(max(sort_order) + 1, 0) into v_order from workspaces where user_id = v_user;
    insert into workspaces (user_id, name, color, preset_code, is_default, sort_order)
    values (v_user, coalesce(nullif(trim(p_options ->> 'name'), ''), 'Пространство'),
      coalesce(p_options ->> 'color', 'label-' || (v_order % 8 + 1)), p_options ->> 'code',
      not exists (select 1 from workspaces where user_id = v_user and is_default), v_order)
    returning id into v_ws;
  elsif not exists (select 1 from workspaces where id = v_ws and user_id = v_user) then
    raise exception 'Пространство не найдено';
  end if;

  for g in select * from jsonb_array_elements(coalesce(p_preset -> 'groups', '[]')) loop
    select id into v_gid from groups where workspace_id = v_ws and lower(name) = lower(g ->> 'name') limit 1;
    if v_gid is null then
      select coalesce(max(sort_order) + 1, 0) into v_order from groups where workspace_id = v_ws;
      insert into groups (user_id, workspace_id, name, item_name, required, show_in_list, sort_order)
      values (v_user, v_ws, g ->> 'name', coalesce(g ->> 'item_name', g ->> 'name'),
        coalesce((g ->> 'required')::boolean, false), coalesce((g ->> 'show_in_list')::boolean, true), v_order)
      returning id into v_gid;
      n_groups := n_groups + 1;
      created := created || jsonb_build_object(g ->> 'key', true);
    end if;
    gmap := gmap || jsonb_build_object(g ->> 'key', v_gid);
  end loop;

  for g in select * from jsonb_array_elements(coalesce(p_preset -> 'groups', '[]')) loop
    if g ->> 'parent' is not null and (created ->> (g ->> 'key')) is not null and gmap ? (g ->> 'parent') then
      update groups set parent_group_id = (gmap ->> (g ->> 'parent'))::uuid where id = (gmap ->> (g ->> 'key'))::uuid;
    end if;
  end loop;

  for g in select * from jsonb_array_elements(coalesce(p_preset -> 'groups', '[]')) loop
    v_gid := (gmap ->> (g ->> 'key'))::uuid;
    select parent_group_id into v_parent_gid from groups where id = v_gid;
    for v in select * from jsonb_array_elements(coalesce(g -> 'values', '[]')) loop
      continue when coalesce((v ->> 'example')::boolean, false) and not v_examples;
      continue when exists (select 1 from group_items where group_id = v_gid and lower(name) = lower(v ->> 'name'));
      select coalesce(max(sort_order) + 1, 0) into v_order from group_items where group_id = v_gid;
      insert into group_items (user_id, group_id, name, sort_order, color, parent_item_id)
      values (v_user, v_gid, v ->> 'name', v_order, v ->> 'color',
        case when v ->> 'parent' is not null and v_parent_gid is not null then
          (select id from group_items where group_id = v_parent_gid and lower(name) = lower(v ->> 'parent') limit 1)
        end);
      n_values := n_values + 1;
    end loop;
  end loop;

  if coalesce((p_options ->> 'stages')::boolean, false) and not exists (select 1 from statuses where workspace_id = v_ws) then
    v_order := 0;
    for v in select * from jsonb_array_elements(coalesce(p_preset -> 'stages', '[]')) loop
      insert into statuses (user_id, workspace_id, label, sort_order, is_final)
      values (v_user, v_ws, v ->> 'label', v_order, coalesce((v ->> 'is_final')::boolean, false));
      v_order := v_order + 1;
      n_stages := n_stages + 1;
    end loop;
  end if;

  insert into user_settings (user_id) values (v_user) on conflict (user_id) do nothing;
  if coalesce((p_options ->> 'settings')::boolean, false) and p_preset ? 'settings' then
    update workspaces set
      priority_method = coalesce(p_preset #>> '{settings,priority_method}', priority_method),
      focus_mode = coalesce(p_preset #>> '{settings,focus_mode}', focus_mode),
      planned_hours_per_day = (p_preset #>> '{settings,planned_hours_per_day}')::numeric,
      planned_hours_per_month = (p_preset #>> '{settings,planned_hours_per_month}')::numeric,
      work_days_per_week = coalesce((p_preset #>> '{settings,work_days_per_week}')::int, work_days_per_week)
    where id = v_ws;
  end if;

  if v_examples then
    select (now() at time zone coalesce(s.timezone, 'Europe/Minsk'))::date into v_today from user_settings s where s.user_id = v_user;
    select id into v_status from statuses where workspace_id = v_ws and not is_final order by sort_order limit 1;
    for e in select * from jsonb_array_elements(coalesce(p_preset -> 'examples', '[]')) loop
      v_items := '{}';
      for ref in select * from jsonb_array_elements(coalesce(e -> 'values', '[]')) loop
        select id into v_vid from group_items
        where group_id = (gmap ->> (ref ->> 'group'))::uuid and lower(name) = lower(ref ->> 'value') limit 1;
        if v_vid is not null then v_items := v_items || v_vid; end if;
      end loop;
      insert into tasks (user_id, workspace_id, name, status_id, planned_hours, is_daily, plan_date, item_ids)
      values (v_user, v_ws, e ->> 'name', v_status, coalesce((e ->> 'planned_hours')::numeric, 0),
        coalesce((e ->> 'is_daily')::boolean, false),
        case when coalesce((e ->> 'today')::boolean, false) then v_today end, v_items);
      n_tasks := n_tasks + 1;
    end loop;
  end if;

  if coalesce((p_options ->> 'onboard')::boolean, false) then
    update user_settings set onboarded_at = now() where user_id = v_user;
  end if;

  return json_build_object('workspace', v_ws, 'groups', n_groups, 'values', n_values, 'stages', n_stages, 'tasks', n_tasks);
end;
$$ language plpgsql security invoker set search_path = public;

revoke execute on function public.apply_preset(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.apply_preset(jsonb, jsonb, uuid) to authenticated;
revoke execute on function public.delete_workspace(uuid) from public, anon;
grant execute on function public.delete_workspace(uuid) to authenticated;
revoke execute on function public.default_workspace(uuid) from public, anon;
revoke execute on function public.workspace_owned_guard() from public;
revoke execute on function public.groups_workspace_link() from public;
revoke execute on function public.group_items_workspace() from public;
revoke execute on function public.tasks_workspace() from public;
revoke execute on function public.from_task_workspace() from public;
revoke execute on function public.attachments_workspace() from public;
revoke execute on function public.workspaces_sync_settings() from public;
revoke execute on function public.workspaces_delete_guard() from public;
