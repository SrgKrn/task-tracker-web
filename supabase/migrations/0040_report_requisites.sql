-- 0.66: реквизиты в отчёте для клиента (тариф «Про» — та же возможность, что и свой логотип:
-- строка чек-листа лимитов «Свой логотип и реквизиты в отчёте», ключ logo).
--
-- Свои реквизиты (исполнитель) — в настройках профиля, одни на все отчёты.
-- Реквизиты клиента — у значения группы, рядом со ставкой.
-- Обычный текст в несколько строк: название, УНП/ИНН, счёт, банк, адрес — формы разные
-- в каждой стране, поэтому поля не дробим.
--
-- Записать реквизиты можно только на тарифе с logo; убрать — всегда. Сервисный ключ
-- (auth.uid() пустой) не ограничен.

alter table public.user_settings
  add column if not exists report_requisites text;
alter table public.user_settings drop constraint if exists user_settings_report_requisites_check;
alter table public.user_settings
  add constraint user_settings_report_requisites_check
  check (report_requisites is null or char_length(report_requisites) <= 2000);

alter table public.group_items
  add column if not exists requisites text;
alter table public.group_items drop constraint if exists group_items_requisites_check;
alter table public.group_items
  add constraint group_items_requisites_check
  check (requisites is null or char_length(requisites) <= 2000);

create or replace function public.plan_guard_requisites()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text;
  v_old text;
begin
  if tg_table_name = 'user_settings' then
    v_new := new.report_requisites;
    if tg_op = 'UPDATE' then v_old := old.report_requisites; end if;
  else
    v_new := new.requisites;
    if tg_op = 'UPDATE' then v_old := old.requisites; end if;
  end if;
  if auth.uid() is null or v_new is null or btrim(v_new) = '' then
    return new;
  end if;
  if tg_op = 'UPDATE' and v_new is not distinct from v_old then
    return new;
  end if;
  if not public.plan_allows(auth.uid(), 'logo') then
    raise exception 'plan_limit:requisites';
  end if;
  return new;
end;
$$;

drop trigger if exists user_settings_zz_requisites_guard on public.user_settings;
create trigger user_settings_zz_requisites_guard
  before insert or update of report_requisites on public.user_settings
  for each row execute function public.plan_guard_requisites();

drop trigger if exists group_items_zz_requisites_guard on public.group_items;
create trigger group_items_zz_requisites_guard
  before insert or update of requisites on public.group_items
  for each row execute function public.plan_guard_requisites();

revoke all on function public.plan_guard_requisites() from public, anon, authenticated;
