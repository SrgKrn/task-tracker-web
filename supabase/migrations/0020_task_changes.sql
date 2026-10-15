-- Журнал изменений задач для экрана «Хронология»: создание, удаление и правки полей.
-- Этапы пишутся отдельно (task_status_events), учёт и правки часов — это time_entries.
--
-- Пишутся только действия самого пользователя (auth.uid() задан): служебные изменения
-- серверных функций, миграций и cron в хронологию не попадают.

create table task_changes (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- без внешнего ключа: запись об удалении задачи переживает саму задачу
  task_id uuid not null,
  -- название на момент изменения — чтобы строка читалась и после удаления
  task_name text not null,
  -- 'created' | 'deleted' | 'name' | 'planned_hours' | 'start_date' | 'end_date'
  -- | 'is_daily' | 'parent_id' | 'item_ids'
  field text not null,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);
create index task_changes_user_created_idx on task_changes(user_id, created_at desc);
create index task_changes_task_idx on task_changes(task_id);

alter table task_changes enable row level security;
-- пишет только триггер; пользователь видит свои записи
create policy "task_changes_select" on task_changes for select using (user_id = auth.uid());

create function log_task_changes() returns trigger as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    insert into public.task_changes (user_id, task_id, task_name, field, new_value)
    values (new.user_id, new.id, new.name, 'created', null);
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.task_changes (user_id, task_id, task_name, field, old_value)
    values (old.user_id, old.id, old.name, 'deleted', null);
    return old;
  end if;

  if new.name is distinct from old.name then
    insert into public.task_changes (user_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.id, new.name, 'name', to_jsonb(old.name), to_jsonb(new.name));
  end if;
  if new.planned_hours is distinct from old.planned_hours then
    insert into public.task_changes (user_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.id, new.name, 'planned_hours', to_jsonb(old.planned_hours), to_jsonb(new.planned_hours));
  end if;
  if new.start_date is distinct from old.start_date then
    insert into public.task_changes (user_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.id, new.name, 'start_date', to_jsonb(old.start_date), to_jsonb(new.start_date));
  end if;
  if new.end_date is distinct from old.end_date then
    insert into public.task_changes (user_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.id, new.name, 'end_date', to_jsonb(old.end_date), to_jsonb(new.end_date));
  end if;
  if new.is_daily is distinct from old.is_daily then
    insert into public.task_changes (user_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.id, new.name, 'is_daily', to_jsonb(old.is_daily), to_jsonb(new.is_daily));
  end if;
  if new.parent_id is distinct from old.parent_id then
    insert into public.task_changes (user_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.id, new.name, 'parent_id', to_jsonb(old.parent_id), to_jsonb(new.parent_id));
  end if;
  -- у подзадачи группы повторяют спринт: их смену пишем только у самого спринта
  if new.parent_id is null and new.item_ids is distinct from old.item_ids then
    insert into public.task_changes (user_id, task_id, task_name, field, old_value, new_value)
    values (new.user_id, new.id, new.name, 'item_ids', to_jsonb(old.item_ids), to_jsonb(new.item_ids));
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.log_task_changes() from public;

create trigger tasks_log_changes
after insert or update or delete on tasks
for each row execute function log_task_changes();
