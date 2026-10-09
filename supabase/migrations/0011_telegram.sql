-- Telegram: чат пользователя, куда бот пишет уведомления, и одноразовые коды привязки.

create table telegram_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id bigint not null,
  username text not null default '',
  first_name text not null default '',
  -- часовой пояс устройства, с которого привязывали: по нему считается день записи,
  -- когда учёт останавливают кнопкой в Telegram
  timezone text not null default 'Europe/Moscow',
  -- предупреждать о долгом учёте; другие виды уведомлений добавятся отдельными флагами
  notify_long_timer boolean not null default true,
  created_at timestamptz not null default now()
);
alter table telegram_accounts enable row level security;
-- читать, переключать и отвязывать — сам пользователь; привязывает только бот (сервисный ключ)
create policy "telegram_accounts_select" on telegram_accounts for select using (user_id = auth.uid());
create policy "telegram_accounts_update" on telegram_accounts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "telegram_accounts_delete" on telegram_accounts for delete using (user_id = auth.uid());

-- Код из ссылки t.me/бот?start=код. Живёт 30 минут, используется один раз.
-- RLS без политик: создаёт и читает только серверная функция.
create table telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  timezone text not null default 'Europe/Moscow',
  created_at timestamptz not null default now()
);
alter table telegram_link_codes enable row level security;
