-- 0.37: календарь — в пространство. Встречи календаря попадают в одно пространство
-- (по умолчанию основное, в настройках календаря можно выбрать другое): там их видно на
-- «Сегодня», там предлагаются задачи, чтобы их засчитать.

alter table calendar_sources add column workspace_id uuid references workspaces(id) on delete set null;
alter table calendar_events add column workspace_id uuid references workspaces(id) on delete set null;

update calendar_sources s set workspace_id = w.id from workspaces w where w.user_id = s.user_id and w.is_default;
update calendar_events e set workspace_id = s.workspace_id from calendar_sources s where s.id = e.source_id;
create index calendar_events_workspace_idx on calendar_events(workspace_id, starts_at);

-- календарь без пространства (новый или удалили его пространство) — в основное
create function calendar_sources_workspace() returns trigger as $$
begin
  if new.workspace_id is null then
    new.workspace_id := default_workspace(new.user_id);
  end if;
  if new.workspace_id is not null and not exists (select 1 from workspaces where id = new.workspace_id and user_id = new.user_id) then
    raise exception 'Пространство не найдено';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger calendar_sources_workspace before insert or update of workspace_id on calendar_sources
for each row execute function calendar_sources_workspace();

-- встреча — в пространстве своего календаря
create function calendar_events_workspace() returns trigger as $$
begin
  select workspace_id into new.workspace_id from calendar_sources where id = new.source_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;
create trigger calendar_events_workspace before insert or update of source_id on calendar_events
for each row execute function calendar_events_workspace();

-- календарь перенесли в другое пространство — его встречи едут следом, а подсказанные
-- задачи старого пространства больше не подходят
create function calendar_sources_move_events() returns trigger as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    update calendar_events set workspace_id = new.workspace_id, suggested_task_id = null
    where source_id = new.id;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public;
create trigger calendar_sources_move_events after update of workspace_id on calendar_sources
for each row execute function calendar_sources_move_events();

revoke execute on function public.calendar_sources_workspace() from public;
revoke execute on function public.calendar_events_workspace() from public;
revoke execute on function public.calendar_sources_move_events() from public;
