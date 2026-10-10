-- Конструктор групп. Раньше у задачи было ровно два измерения — проект и раздел, — зашитых
-- в схему. Теперь измерения («группы») заводит сам пользователь: добавляет свои, переименовывает,
-- связывает («проект входит в клиента»), удаляет ненужные, в том числе проекты и разделы.
--
-- Проекты и разделы переезжают сюда обычными группами, значения — с теми же id: ссылки на
-- карточки, файлы и история не теряются. Таблицы projects/sections и колонки tasks.project_id,
-- tasks.section_id пока остаются: ими ещё пользуются открытые на телефонах старые версии
-- приложения, и их записи база переносит в новую модель (см. «наследие» ниже).

create table groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- «Проекты» — в меню, группировке, фильтрах и отчётах
  name text not null,
  -- «Проект» — подпись поля в задаче
  item_name text not null,
  sort_order integer not null default 0,
  -- без значения в этой группе задачу не создать
  required boolean not null default false,
  -- значение видно в строке задачи в списках
  show_in_list boolean not null default true,
  -- связь: каждое значение этой группы входит в значение родительской
  parent_group_id uuid references groups(id) on delete set null,
  -- группа пришла из старой схемы: в неё переносятся записи старых версий приложения
  legacy text check (legacy in ('project', 'section')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index groups_user_id_idx on groups(user_id);
create index groups_parent_group_id_idx on groups(parent_group_id);

create table group_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  name text not null,
  -- описание в карточке значения: клиент, договорённости, ссылки
  description text not null default '',
  sort_order integer not null default 0,
  -- в архиве — не предлагается в новых задачах, но история по нему сохраняется
  archived boolean not null default false,
  -- во что входит значение (значение родительской группы)
  parent_item_id uuid references group_items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index group_items_group_id_idx on group_items(group_id);
create index group_items_parent_item_id_idx on group_items(parent_item_id);

create trigger groups_set_updated_at before update on groups for each row execute function set_updated_at();
create trigger group_items_set_updated_at before update on group_items for each row execute function set_updated_at();

alter table groups enable row level security;
alter table group_items enable row level security;
-- Ссылки на свои же группы и значения («входит в») проверяют триггеры ниже: политика,
-- которая читает собственную таблицу, Postgres считает бесконечной рекурсией.
create policy "groups_owner" on groups for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- подзапрос идёт под RLS: значение можно добавить только в свою группу
create policy "group_items_owner" on group_items for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from groups g where g.id = group_id));

-- значения групп у задачи: по одному из каждой группы
alter table tasks add column item_ids uuid[] not null default '{}';
create index tasks_item_ids_idx on tasks using gin (item_ids);
alter table tasks alter column project_id drop not null;
alter table tasks alter column section_id drop not null;

-- файлы: у задачи (task_id) или у значения группы целиком — его база знаний (item_id)
alter table attachments add column item_id uuid references group_items(id) on delete cascade;
create index attachments_item_id_idx on attachments(item_id);
alter table attachments alter column project_id drop not null;
drop trigger attachments_project_from_task on attachments;
drop function attachments_project_from_task();
drop trigger tasks_move_attachments on tasks;
drop function tasks_move_attachments();
drop policy "attachments_owner" on attachments;
create policy "attachments_owner" on attachments for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (item_id is null or exists (select 1 from group_items i where i.id = item_id))
    and (task_id is null or exists (select 1 from tasks t where t.id = task_id))
  );

-- какую историю изменений пользователь уже видел
alter table user_settings add column seen_release text;

/* ── переезд данных ─────────────────────────────────────────────── */

insert into groups (user_id, name, item_name, sort_order, required, show_in_list, legacy)
select id, 'Разделы', 'Раздел', 0, true, false, 'section' from auth.users;
insert into groups (user_id, name, item_name, sort_order, required, show_in_list, legacy)
select id, 'Проекты', 'Проект', 1, true, true, 'project' from auth.users;

insert into group_items (id, user_id, group_id, name, sort_order, archived, created_at, updated_at)
select s.id, s.user_id, g.id, s.name, s.sort_order, s.archived, s.created_at, s.updated_at
from sections s join groups g on g.user_id = s.user_id and g.legacy = 'section';

insert into group_items (id, user_id, group_id, name, description, sort_order, archived, created_at, updated_at)
select p.id, p.user_id, g.id, p.name, p.description, p.sort_order, p.archived, p.created_at, p.updated_at
from projects p join groups g on g.user_id = p.user_id and g.legacy = 'project';

-- без триггеров: updated_at задач не должен сдвинуться от переезда
alter table tasks disable trigger user;
update tasks set item_ids = array_remove(array[section_id, project_id], null);
alter table tasks enable trigger user;

update attachments set item_id = project_id where task_id is null and project_id is not null;

/* ── правила для групп ──────────────────────────────────────────── */

-- Группа не может входить сама в себя — ни напрямую, ни через другие.
create function groups_guard() returns trigger as $$
declare
  cycle boolean;
begin
  if new.parent_group_id is null then
    return new;
  end if;
  if new.parent_group_id = new.id then
    raise exception 'Группа не может входить сама в себя';
  end if;
  if not exists (select 1 from groups where id = new.parent_group_id and user_id = new.user_id) then
    raise exception 'Связанная группа не найдена';
  end if;
  with recursive up(id, parent_group_id) as (
    select id, parent_group_id from groups where id = new.parent_group_id
    union
    select g.id, g.parent_group_id from groups g join up on g.id = up.parent_group_id
  )
  select exists (select 1 from up where up.id = new.id) into cycle;
  if cycle then
    raise exception 'Связь замкнулась бы в круг — группа уже входит в эту';
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger groups_guard
before insert or update of parent_group_id on groups
for each row execute function groups_guard();

-- Сменили связь группы — прежние «входит в» указывают на значения другой группы, сбрасываем.
create function groups_relink() returns trigger as $$
begin
  if new.parent_group_id is distinct from old.parent_group_id then
    update group_items set parent_item_id = null where group_id = new.id and parent_item_id is not null;
  end if;
  return null;
end;
$$ language plpgsql set search_path = public;

create trigger groups_relink
after update of parent_group_id on groups
for each row execute function groups_relink();

-- Удаление группы: задачи теряют её значение, связанные группы — связь.
create function groups_before_delete() returns trigger as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into ids from group_items where group_id = old.id;
  update group_items set parent_item_id = null where parent_item_id = any(ids);
  update groups set parent_group_id = null where parent_group_id = old.id;
  -- только головные: подзадачи получат то же самое от своих спринтов
  update tasks
  set item_ids = array(select x from unnest(item_ids) x where x <> all(ids))
  where parent_id is null and item_ids && ids;
  return old;
end;
$$ language plpgsql set search_path = public;

create trigger groups_before_delete
before delete on groups
for each row execute function groups_before_delete();

-- Значение не переезжает в другую группу; «входит в» — только значение связанной группы.
create function group_items_guard() returns trigger as $$
declare
  parent_group uuid;
  item_group uuid;
begin
  if tg_op = 'UPDATE' and new.group_id <> old.group_id then
    raise exception 'Значение нельзя перенести в другую группу';
  end if;
  if new.parent_item_id is not null then
    select parent_group_id into parent_group from groups where id = new.group_id;
    select group_id into item_group from group_items where id = new.parent_item_id and user_id = new.user_id;
    if parent_group is null or item_group is distinct from parent_group then
      raise exception 'Значение может входить только в значение связанной группы';
    end if;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger group_items_guard
before insert or update of group_id, parent_item_id on group_items
for each row execute function group_items_guard();

-- Значение переподвесили («проект перешёл к другому клиенту») — задачи с ним следуют за ним.
create function group_items_relink_tasks() returns trigger as $$
begin
  if new.parent_item_id is distinct from old.parent_item_id then
    update tasks set item_ids = item_ids where parent_id is null and item_ids @> array[new.id];
  end if;
  return null;
end;
$$ language plpgsql set search_path = public;

create trigger group_items_relink_tasks
after update of parent_item_id on group_items
for each row execute function group_items_relink_tasks();

-- Значение, которое есть в задачах, не удаляется — для этого есть архив.
create function group_items_delete_guard() returns trigger as $$
begin
  if exists (select 1 from tasks where item_ids @> array[old.id]) then
    raise exception '«%» есть в задачах — его можно отправить в архив', old.name;
  end if;
  return old;
end;
$$ language plpgsql set search_path = public;

create trigger group_items_delete_guard
before delete on group_items
for each row execute function group_items_delete_guard();

/* ── значения групп у задачи ────────────────────────────────────── */

create function tasks_items_guard() returns trigger as $$
declare
  legacy_group uuid;
  parent_items uuid[];
  n_items integer;
  n_groups integer;
  missing record;
  steps integer := 0;
begin
  -- 1. Наследие: старые версии приложения пишут проект и раздел в project_id/section_id.
  --    Только прямая запись (глубина 1) — не отголоски наших же триггеров.
  if pg_trigger_depth() = 1 then
    if new.project_id is not null and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id) then
      select id into legacy_group from groups where user_id = new.user_id and legacy = 'project';
      if legacy_group is not null and exists (select 1 from group_items where id = new.project_id and group_id = legacy_group) then
        new.item_ids := array(
          select x from unnest(new.item_ids) x
          where x not in (select id from group_items where group_id = legacy_group)
        ) || new.project_id;
      end if;
    end if;
    if new.section_id is not null and (tg_op = 'INSERT' or new.section_id is distinct from old.section_id) then
      select id into legacy_group from groups where user_id = new.user_id and legacy = 'section';
      if legacy_group is not null and exists (select 1 from group_items where id = new.section_id and group_id = legacy_group) then
        new.item_ids := array(
          select x from unnest(new.item_ids) x
          where x not in (select id from group_items where group_id = legacy_group)
        ) || new.section_id;
      end if;
    end if;
  end if;

  if new.parent_id is not null then
    -- 2. Подзадача всегда в тех же группах, что её спринт, — что бы ни прислали.
    select item_ids into parent_items from tasks where id = new.parent_id;
    new.item_ids := coalesce(parent_items, '{}');
  else
    -- 3. Без повторов; каждое значение существует, принадлежит владельцу задачи
    --    и группы не повторяются.
    new.item_ids := array(select distinct x from unnest(new.item_ids) x where x is not null);
    select count(*), count(distinct group_id) into n_items, n_groups
    from group_items where id = any(new.item_ids) and user_id = new.user_id;
    if n_items <> cardinality(new.item_ids) then
      raise exception 'Значение группы не найдено';
    end if;
    if n_groups <> n_items then
      raise exception 'В одной группе у задачи может быть только одно значение';
    end if;

    -- 4. Связи: значение тянет за собой то, во что входит («проект → его клиент»).
    loop
      select gi.parent_item_id as item, p.group_id into missing
      from group_items gi join group_items p on p.id = gi.parent_item_id
      where gi.id = any(new.item_ids) and not (gi.parent_item_id = any(new.item_ids))
      limit 1;
      exit when not found;
      steps := steps + 1;
      if steps > 10 then
        raise exception 'Значения задачи противоречат связям групп';
      end if;
      new.item_ids := array(
        select x from unnest(new.item_ids) x
        where x not in (select id from group_items where group_id = missing.group_id)
      ) || missing.item;
    end loop;
  end if;

  -- 5. Наследие в обратную сторону: старые версии читают проект и раздел из колонок.
  select gi.id into new.project_id
  from group_items gi join groups g on g.id = gi.group_id
  where g.user_id = new.user_id and g.legacy = 'project' and gi.id = any(new.item_ids)
    and exists (select 1 from projects p where p.id = gi.id)
  limit 1;
  select gi.id into new.section_id
  from group_items gi join groups g on g.id = gi.group_id
  where g.user_id = new.user_id and g.legacy = 'section' and gi.id = any(new.item_ids)
    and exists (select 1 from sections s where s.id = gi.id)
  limit 1;
  return new;
end;
$$ language plpgsql set search_path = public;

-- имя важно: before-триггеры идут по алфавиту, этот — раньше tasks_parent_guard
create trigger tasks_items_guard
before insert or update of item_ids, parent_id, project_id, section_id on tasks
for each row execute function tasks_items_guard();

-- Значения спринта сменились — подзадачи следом.
create function tasks_items_to_children() returns trigger as $$
begin
  if new.item_ids is distinct from old.item_ids then
    update tasks set item_ids = new.item_ids where parent_id = new.id and item_ids is distinct from new.item_ids;
  end if;
  return null;
end;
$$ language plpgsql set search_path = public;

create trigger tasks_items_to_children
after update on tasks
for each row execute function tasks_items_to_children();

/* ── наследие: записи старых версий приложения ──────────────────── */

create function projects_legacy_sync() returns trigger as $$
declare
  g uuid;
begin
  select id into g from groups where user_id = new.user_id and legacy = 'project';
  if g is null then
    return null;
  end if;
  insert into group_items (id, user_id, group_id, name, description, sort_order, archived)
  values (new.id, new.user_id, g, new.name, new.description, new.sort_order, new.archived)
  on conflict (id) do update
  set name = excluded.name, description = excluded.description,
      sort_order = excluded.sort_order, archived = excluded.archived;
  return null;
end;
$$ language plpgsql set search_path = public;

create trigger projects_legacy_sync
after insert or update on projects
for each row execute function projects_legacy_sync();

create function sections_legacy_sync() returns trigger as $$
declare
  g uuid;
begin
  select id into g from groups where user_id = new.user_id and legacy = 'section';
  if g is null then
    return null;
  end if;
  insert into group_items (id, user_id, group_id, name, sort_order, archived)
  values (new.id, new.user_id, g, new.name, new.sort_order, new.archived)
  on conflict (id) do update
  set name = excluded.name, sort_order = excluded.sort_order, archived = excluded.archived;
  return null;
end;
$$ language plpgsql set search_path = public;

create trigger sections_legacy_sync
after insert or update on sections
for each row execute function sections_legacy_sync();

-- старая версия грузит файл проекта с project_id — он же значение группы «Проекты»
create function attachments_legacy_item() returns trigger as $$
begin
  if new.item_id is null and new.task_id is null and new.project_id is not null
     and exists (select 1 from group_items where id = new.project_id) then
    new.item_id := new.project_id;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger attachments_legacy_item
before insert on attachments
for each row execute function attachments_legacy_item();

/* ── новые пользователи начинают с двух привычных групп ─────────── */

create function create_default_groups() returns trigger as $$
begin
  insert into public.groups (user_id, name, item_name, sort_order, required, show_in_list)
  values (new.id, 'Разделы', 'Раздел', 0, false, false),
         (new.id, 'Проекты', 'Проект', 1, false, true);
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created_groups
after insert on auth.users
for each row execute function create_default_groups();

revoke execute on function public.groups_guard() from public;
revoke execute on function public.groups_relink() from public;
revoke execute on function public.groups_before_delete() from public;
revoke execute on function public.group_items_guard() from public;
revoke execute on function public.group_items_relink_tasks() from public;
revoke execute on function public.group_items_delete_guard() from public;
revoke execute on function public.tasks_items_guard() from public;
revoke execute on function public.tasks_items_to_children() from public;
revoke execute on function public.projects_legacy_sync() from public;
revoke execute on function public.sections_legacy_sync() from public;
revoke execute on function public.attachments_legacy_item() from public;
revoke execute on function public.create_default_groups() from public, anon, authenticated;
