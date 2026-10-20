-- Тариф пользователя. Отдельная таблица, а не поле в user_settings:
-- пользователь может только читать свою строку, менять её может лишь сервер (сервисный ключ, вебхук оплаты).
create table if not exists public.user_plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'free'
             check (plan in ('free', 'pro', 'studio', 'lifetime')),
  paid_until timestamptz,          -- null у free и lifetime
  note       text,                 -- откуда тариф: «основатель», «оплата bePaid #…»
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_plans enable row level security;

drop policy if exists user_plans_select_own on public.user_plans;
create policy user_plans_select_own on public.user_plans
  for select using (user_id = auth.uid());
-- политик на insert/update/delete нет: клиент не может выдать себе тариф

-- Пожизненный безлимит первым живым пользователям
insert into public.user_plans (user_id, plan, note)
select id, 'lifetime', 'первые пользователи, 20.10.2026'
from auth.users
where email in ('sergey.kornyushko2708@gmail.com', 'katrinavelley@gmail.com', 'igrusar94@gmail.com')
on conflict (user_id) do update set plan = 'lifetime', paid_until = null, note = excluded.note, updated_at = now();
