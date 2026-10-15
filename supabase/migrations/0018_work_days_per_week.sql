-- Рабочих дней в неделе (первые N дней с понедельника: 5 — пн–пт, 6 — пн–сб, 7 — без выходных).
-- По ним «Сводка» и отчёт считают норму периода: раньше дневная цель умножалась на все дни,
-- включая выходные (7 ч × 31 = 217 ч за октябрь).
alter table user_settings add column work_days_per_week smallint not null default 5
  check (work_days_per_week between 1 and 7);
