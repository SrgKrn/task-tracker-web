-- 0042: описание задачи — свободный текст в карточке (договорённости, ссылки, что сделать).
-- Пустая строка по умолчанию: старые клиенты описания не знают и при вставке его не шлют.
-- В журнал правок (task_changes) описание не пишется: его правят часто и по кусочку.

alter table public.tasks
  add column if not exists description text not null default '';

alter table public.tasks
  drop constraint if exists tasks_description_length;
alter table public.tasks
  add constraint tasks_description_length check (char_length(description) <= 20000);
