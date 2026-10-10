-- Google Календарь через вход в Google — основной способ; iCal-ссылка остаётся для других календарей.

-- вид источника: 'google' — основной календарь аккаунта из google_accounts, читается через API;
-- 'ics' — секретная iCal-ссылка, как раньше
alter table calendar_sources
  add column kind text not null default 'ics' check (kind in ('ics', 'google')),
  alter column url drop not null,
  add constraint calendar_sources_ics_has_url check (kind <> 'ics' or url is not null);

-- Google-календарь у пользователя один: повторный вход не создаёт второй
create unique index calendar_sources_one_google on calendar_sources(user_id) where kind = 'google';
