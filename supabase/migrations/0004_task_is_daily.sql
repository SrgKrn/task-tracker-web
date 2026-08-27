-- Ежедневные (рутинные) задачи: всегда попадают в список «Сегодня» независимо от сроков.
alter table tasks add column is_daily boolean not null default false;
