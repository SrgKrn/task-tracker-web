-- Удаление аккаунта падало, если у человека есть связанные группы («Проекты входят в
-- Клиентов»): при каскадном удалении пользователя триггер группы отвязывал другие группы,
-- которые удалялись той же командой, и Postgres отказывал («tuple to be updated was already
-- modified»). Отвязывать незачем, когда уходит сам пользователь: всё его удалится целиком.
-- security definer — проверить auth.users может только владелец функции, не пользователь.
create or replace function groups_before_delete() returns trigger as $$
declare
  ids uuid[];
begin
  -- пользователя уже нет — это каскад удаления аккаунта
  if not exists (select 1 from auth.users where id = old.user_id) then
    return old;
  end if;
  select coalesce(array_agg(id), '{}') into ids from group_items where group_id = old.id;
  update group_items set parent_item_id = null where parent_item_id = any(ids);
  update groups set parent_group_id = null where parent_group_id = old.id;
  -- только головные: подзадачи получат то же самое от своих спринтов
  update tasks
  set item_ids = array(select x from unnest(item_ids) x where x <> all(ids))
  where parent_id is null and item_ids && ids;
  return old;
end;
$$ language plpgsql security definer set search_path = public;

revoke execute on function public.groups_before_delete() from public;
