-- Ставка в час: основная — у значения группы (клиента), у спринта её можно переопределить.
-- Сумма в отчёте считается на клиенте: в базе только ставка и валюта.

alter table public.group_items
  add column if not exists hourly_rate numeric(12, 2) check (hourly_rate is null or hourly_rate >= 0),
  add column if not exists rate_currency text check (rate_currency is null or rate_currency in ('BYN', 'USD', 'EUR', 'RUB'));

alter table public.tasks
  add column if not exists hourly_rate numeric(12, 2) check (hourly_rate is null or hourly_rate >= 0),
  add column if not exists rate_currency text check (rate_currency is null or rate_currency in ('BYN', 'USD', 'EUR', 'RUB'));

comment on column public.group_items.hourly_rate is 'ставка в час; null — не задана';
comment on column public.tasks.hourly_rate is 'ставка спринта; null — как у клиента';
