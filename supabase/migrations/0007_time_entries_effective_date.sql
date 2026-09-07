-- День, к которому относится запись, а не день, когда её сохранили.
--
-- Раньше сводка резала created_at до даты, и это давало две ошибки сразу:
-- 1) дата бралась по UTC, поэтому работа после полуночи по местному времени
--    уезжала во вчера;
-- 2) ручная правка старой задачи вычиталась из сегодняшнего дня — правка
--    времени за август роняла кольцо «Сегодня».
--
-- Дату проставляет клиент в местном часовом поясе, поэтому она верна
-- независимо от того, где находится пользователь.
alter table time_entries add column effective_date date;

-- перенос истории: сеанс таймера относится к дню своего начала, ручная правка —
-- к дню, когда её сделали. Существующие данные заведены из Москвы (UTC+3).
update time_entries
set effective_date = (coalesce(started_at, created_at) at time zone 'Europe/Moscow')::date
where effective_date is null;

alter table time_entries alter column effective_date set not null;
alter table time_entries alter column effective_date set default (now() at time zone 'utc')::date;

create index time_entries_effective_date_idx on time_entries(effective_date);
