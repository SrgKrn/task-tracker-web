-- Архивирование разделов/проектов вместо жёсткого удаления (когда на них ссылаются задачи).
alter table sections add column archived boolean not null default false;
alter table projects add column archived boolean not null default false;

-- Связь "эта задача — копия той" (для карточки задачи, аналитики дублей позже).
alter table tasks add column duplicated_from uuid references tasks(id) on delete set null;

-- Точная история смены статуса задачи — «задач закрыто» в сводке считается по факту
-- перехода в финальный статус в периоде, а не по updated_at (который сдвигает любая правка).
create table task_status_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  status_id uuid references statuses(id) on delete set null,
  is_final boolean not null default false,
  created_at timestamptz not null default now()
);

create index task_status_events_task_id_idx on task_status_events(task_id);
create index task_status_events_created_at_idx on task_status_events(created_at);

alter table task_status_events enable row level security;
create policy "task_status_events_owner" on task_status_events for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create function log_task_status_event() returns trigger as $$
declare
  final boolean;
begin
  if new.status_id is distinct from old.status_id then
    select coalesce(is_final, false) into final from statuses where id = new.status_id;
    insert into task_status_events (user_id, task_id, status_id, is_final)
    values (new.user_id, new.id, new.status_id, coalesce(final, false));
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger tasks_log_status_event after update on tasks for each row execute function log_task_status_event();
