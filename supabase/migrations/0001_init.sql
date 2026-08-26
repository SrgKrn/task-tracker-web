-- Task + Time Tracker schema
create extension if not exists "pgcrypto";

create table sections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  project_id uuid not null references projects(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  status_id uuid references statuses(id) on delete set null,
  planned_hours numeric(10, 2) not null default 0,
  fact_hours numeric(10, 2) not null default 0,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  entry_type text not null check (entry_type in ('timer', 'manual_adjustment')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_minutes integer not null,
  note text,
  created_at timestamptz not null default now()
);

create table active_timers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  started_at timestamptz not null default now()
);

-- keep tasks.fact_hours in sync with the sum of its time_entries
create function recompute_fact_hours() returns trigger as $$
begin
  update tasks
  set fact_hours = coalesce(
    (select sum(duration_minutes) from time_entries where task_id = coalesce(new.task_id, old.task_id)),
    0
  ) / 60.0,
  updated_at = now()
  where id = coalesce(new.task_id, old.task_id);
  return null;
end;
$$ language plpgsql security definer set search_path = public;

create trigger time_entries_recompute_fact_hours
after insert or update or delete on time_entries
for each row execute function recompute_fact_hours();

-- keep updated_at fresh on edit
create function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger sections_set_updated_at before update on sections for each row execute function set_updated_at();
create trigger projects_set_updated_at before update on projects for each row execute function set_updated_at();
create trigger statuses_set_updated_at before update on statuses for each row execute function set_updated_at();
create trigger tasks_set_updated_at before update on tasks for each row execute function set_updated_at();

-- Row Level Security: every user only ever sees their own rows
alter table sections enable row level security;
alter table projects enable row level security;
alter table statuses enable row level security;
alter table tasks enable row level security;
alter table time_entries enable row level security;
alter table active_timers enable row level security;

create policy "sections_owner" on sections for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "projects_owner" on projects for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "statuses_owner" on statuses for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks_owner" on tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "time_entries_owner" on time_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "active_timers_owner" on active_timers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
