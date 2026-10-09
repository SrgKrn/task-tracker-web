-- Описание проекта — то, с чего начинается его карточка.
alter table projects add column description text not null default '';

-- Файлы: у задачи или у проекта целиком (база знаний проекта). Сам файл лежит
-- в хранилище attachments, здесь — его имя, размер и где он висит.
create table attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- restrict, как у задач: удалить проект с файлами можно только явно, а не каскадом
  project_id uuid not null references projects(id) on delete restrict,
  task_id uuid references tasks(id) on delete cascade,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  mime text not null default '',
  created_at timestamptz not null default now()
);
create index attachments_project_id_idx on attachments(project_id);
create index attachments_task_id_idx on attachments(task_id);

alter table attachments enable row level security;
create policy "attachments_owner" on attachments for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Файл задачи всегда в проекте этой задачи: и при загрузке, и когда задачу переносят.
create function attachments_project_from_task() returns trigger as $$
begin
  if new.task_id is not null then
    select project_id into new.project_id from tasks where id = new.task_id;
    if new.project_id is null then
      raise exception 'Задача для файла не найдена';
    end if;
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger attachments_project_from_task
before insert or update of task_id, project_id on attachments
for each row execute function attachments_project_from_task();

create function tasks_move_attachments() returns trigger as $$
begin
  if new.project_id is distinct from old.project_id then
    update attachments set project_id = new.project_id where task_id = new.id;
  end if;
  return null;
end;
$$ language plpgsql set search_path = public;

create trigger tasks_move_attachments
after update of project_id on tasks
for each row execute function tasks_move_attachments();

revoke execute on function public.attachments_project_from_task() from public;
revoke execute on function public.tasks_move_attachments() from public;

-- Хранилище: закрытое, путь начинается с id владельца — видит и трогает только он.
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

create policy "attachments_files_read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_files_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "attachments_files_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
