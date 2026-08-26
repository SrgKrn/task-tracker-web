-- Personal overall time-budget target (day and/or month), one row per user.
create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  planned_hours_per_day numeric(10, 2),
  planned_hours_per_month numeric(10, 2),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;
create policy "user_settings_owner" on user_settings for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create trigger user_settings_set_updated_at before update on user_settings for each row execute function set_updated_at();
