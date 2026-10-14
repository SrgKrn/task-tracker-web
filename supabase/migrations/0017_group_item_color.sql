-- Цвет значения группы — точка у клиента в строке задачи, на плашке учёта, в сводке и отчёте.
-- Хранится ключ метки дизайн-системы ('label-1' … 'label-8'), а не hex: сам цвет берётся из
-- токенов --label-N и у каждой темы свой. null — без цвета.
alter table group_items add column color text
  check (color is null or color ~ '^label-[1-8]$');

-- Начальная раздача по кругу — только группам, чьё значение видно в строке задачи
-- (по умолчанию это «Проекты»): у «Разделов» цвета нет, иначе в строке было бы две точки.
update group_items i
set color = 'label-' || (((x.rn - 1) % 8) + 1)
from (
  select gi.id, row_number() over (partition by gi.group_id order by gi.sort_order, gi.created_at) as rn
  from group_items gi
  join groups g on g.id = gi.group_id
  where g.show_in_list
) x
where x.id = i.id;

-- Новое значение такой группы получает следующий цвет по кругу; выбрать другой можно в
-- настройках группы. Явно переданный цвет (или null из формы) не трогаем.
create function group_items_default_color() returns trigger as $$
begin
  if new.color is null and exists (select 1 from public.groups where id = new.group_id and show_in_list) then
    new.color := 'label-' || (
      (select count(*) from public.group_items where group_id = new.group_id) % 8 + 1
    );
  end if;
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger group_items_default_color
before insert on group_items
for each row execute function group_items_default_color();

revoke execute on function public.group_items_default_color() from public;
