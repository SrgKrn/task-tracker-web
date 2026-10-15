-- Блок «Время» в сводке дня: один факт о работе пользователя и цитата под его контекст.
-- Считает и выбирает серверная функция telegram (действие insight); приложение и вечерние
-- «Итоги дня» показывают один и тот же блок — он фиксируется при первом показе за день.

/* ── настройки пользователя ──────────────────────────────────────── */

alter table user_settings
  -- все расчёты дат блока («вчера», серии, час) — в этом поясе
  add column timezone text not null default 'Europe/Minsk',
  -- переключатель «Показывать блок „Время“ в сводке»
  add column show_time_block boolean not null default true;

-- у кого привязан Telegram, пояс уже известен — берём его оттуда
insert into user_settings (user_id, timezone)
select user_id, timezone from telegram_accounts
on conflict (user_id) do update set timezone = excluded.timezone;

/* ── дата закрытия задачи ────────────────────────────────────────── */

-- момент перехода в финальный статус; переоткрыли — пусто. Ставит триггер, клиент не пишет.
alter table tasks add column completed_at timestamptz;

create function tasks_set_completed_at() returns trigger as $$
declare
  final boolean;
begin
  if tg_op = 'UPDATE' and new.status_id is not distinct from old.status_id then
    -- статус не менялся — дату не трогаем, что бы ни прислал клиент
    new.completed_at := old.completed_at;
    return new;
  end if;
  select coalesce(is_final, false) into final from public.statuses where id = new.status_id;
  new.completed_at := case when coalesce(final, false) then now() else null end;
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger tasks_set_completed_at
before insert or update on tasks
for each row execute function tasks_set_completed_at();

revoke execute on function public.tasks_set_completed_at() from public;

-- уже закрытые задачи: дата — последнее закрытие из журнала статусов. Где журнала нет
-- (закрыты до его появления), дата остаётся пустой и в статистику задача не попадает.
-- без триггеров: иначе сдвинулся бы updated_at и сработали бы проверки групп
alter table tasks disable trigger user;
update tasks t
set completed_at = e.closed_at
from (
  select task_id, max(created_at) as closed_at
  from task_status_events
  where is_final
  group by task_id
) e, statuses s
where e.task_id = t.id and s.id = t.status_id and s.is_final;
alter table tasks enable trigger user;

create index tasks_user_completed_at_idx on tasks(user_id, completed_at) where completed_at is not null;

/* ── цитаты ──────────────────────────────────────────────────────── */

-- общая таблица для всех пользователей; наполняется seed-файлом и импортом CSV (сервисный ключ)
create table quotes (
  id bigint generated always as identity primary key,
  text text not null check (length(trim(text)) > 0),
  author text not null check (length(trim(author)) > 0),
  -- произведение, письмо, речь
  source text,
  -- контексты фактов и темы, см. supabase/functions/telegram/insight.ts
  tags text[] not null check (
    cardinality(tags) > 0 and tags <@ array[
      'rhythm', 'clients',
      'peak_hours', 'best_weekday', 'streak', 'long_focus', 'day_record', 'hours_milestone',
      'client_share', 'sprint_on_track', 'sprint_burn', 'sprint_closed', 'client_hours', 'client_return',
      'general'
    ]::text[]
  ),
  -- авторство надёжно установлено; false — приписывается, но спорно
  verified boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  -- повторный импорт того же файла не задваивает цитаты
  unique (text, author)
);
create index quotes_tags_idx on quotes using gin (tags) where is_active;

alter table quotes enable row level security;
create policy "quotes_read_active" on quotes for select to authenticated using (is_active);

/* ── показы ──────────────────────────────────────────────────────── */

-- блок дня: какой факт и какая цитата показаны. Одна запись на день — повторное открытие
-- сводки в тот же день показывает то же самое. quote_id пуст, если цитат нет вовсе.
create table quote_impressions (
  user_id uuid not null references auth.users(id) on delete cascade,
  shown_on date not null,
  quote_id bigint references quotes(id) on delete set null,
  -- контекст факта ('streak', 'client_share' …): по нему вчерашний контекст не повторяется
  fact_kind text not null,
  fact_text text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, shown_on)
);
create index quote_impressions_user_quote_idx on quote_impressions(user_id, quote_id);

alter table quote_impressions enable row level security;
-- пишет только серверная функция; пользователь видит свои показы
create policy "quote_impressions_select" on quote_impressions for select using (user_id = auth.uid());
