-- 0.41: свой логотип в отчёте (тариф «Про»).
--
-- Логотип — небольшая PNG-картинка прямо в настройках пользователя (data URL). Приложение
-- уменьшает её до размера шапки отчёта перед сохранением, поэтому отдельный бакет не
-- нужен, а в отчёт по ссылке логотип попадает вместе со снимком — клиенту без входа не
-- нужен доступ к чужому хранилищу.
--
-- Поставить логотип можно только на тарифе с logo; убрать — всегда. Сервисный ключ
-- (auth.uid() пустой) не ограничен.

alter table public.user_settings
  add column if not exists report_logo text;

alter table public.user_settings drop constraint if exists user_settings_report_logo_check;
alter table public.user_settings
  add constraint user_settings_report_logo_check
  check (report_logo is null or (report_logo like 'data:image/png;base64,%' and char_length(report_logo) <= 400000));

create or replace function public.plan_guard_report_logo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.report_logo is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.report_logo is not distinct from old.report_logo then
    return new;
  end if;
  if not public.plan_allows(auth.uid(), 'logo') then
    raise exception 'plan_limit:logo';
  end if;
  return new;
end;
$$;

drop trigger if exists user_settings_zz_logo_guard on public.user_settings;
create trigger user_settings_zz_logo_guard
  before insert or update of report_logo on public.user_settings
  for each row execute function public.plan_guard_report_logo();

revoke all on function public.plan_guard_report_logo() from public, anon, authenticated;
