-- Stop cascade data loss: deleting a Project/Section that still has tasks should fail loudly,
-- not silently wipe them. Deleting a Task itself still cascades its time_entries/comments/active_timers.
alter table tasks drop constraint tasks_project_id_fkey;
alter table tasks add constraint tasks_project_id_fkey
  foreign key (project_id) references projects(id) on delete restrict;

alter table tasks drop constraint tasks_section_id_fkey;
alter table tasks add constraint tasks_section_id_fkey
  foreign key (section_id) references sections(id) on delete restrict;

-- Lets a status be marked as "this means the task is done" — powers hide-completed filtering,
-- overdue styling, and the dashboard's "closed this period" metric.
alter table statuses add column is_final boolean not null default false;

-- Per-task activity log the user can add free-text notes to, shown merged with time entries
-- in the task timeline.
create table comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table comments enable row level security;
create policy "comments_owner" on comments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
