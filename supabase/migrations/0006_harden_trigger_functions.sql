-- Триггерные функции не предназначены для прямого вызова через PostgREST RPC.
-- execute на функции по умолчанию выдан роли PUBLIC, поэтому отзывать нужно именно у неё:
-- отзыв у anon/authenticated ничего не менял. Триггеры выполняются от владельца и не затронуты.
revoke execute on function public.recompute_fact_hours() from public;
revoke execute on function public.log_task_status_event() from public;
revoke execute on function public.set_updated_at() from public;

-- фиксируем search_path, чтобы функция не могла быть подменена через схему поиска
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql set search_path = public;
