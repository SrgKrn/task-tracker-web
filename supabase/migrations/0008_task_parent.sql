-- Вложенность: головная задача (спринт) и её подзадачи. Ровно два уровня.
-- Существующие задачи не трогаем — у них parent_id пустой, и они становятся головными.
alter table tasks add column parent_id uuid references tasks(id) on delete cascade;
create index tasks_parent_id_idx on tasks(parent_id);

-- Инварианты подзадачи держит база, а не интерфейс:
--  * родитель существует и виден пользователю (функция не security definer, RLS действует —
--    подвесить подзадачу к чужой задаче по известному uuid нельзя);
--  * у подзадачи нет своих подзадач, а задача с подзадачами сама подзадачей не становится;
--  * проект и раздел подзадачи всегда совпадают со спринтом — спринт делается для одного клиента.
create function tasks_parent_guard() returns trigger as $$
declare
  parent tasks%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;
  if new.parent_id = new.id then
    raise exception 'Задача не может быть подзадачей самой себя';
  end if;

  select * into parent from tasks where id = new.parent_id;
  if not found then
    raise exception 'Спринт для подзадачи не найден';
  end if;
  if parent.parent_id is not null then
    raise exception 'У подзадачи не может быть своих подзадач';
  end if;
  if tg_op = 'UPDATE' and exists (select 1 from tasks where parent_id = new.id) then
    raise exception 'У задачи есть подзадачи — она не может стать подзадачей';
  end if;

  new.project_id := parent.project_id;
  new.section_id := parent.section_id;
  return new;
end;
$$ language plpgsql set search_path = public;

create trigger tasks_parent_guard
before insert or update of parent_id, project_id, section_id on tasks
for each row execute function tasks_parent_guard();

-- Сменили проект или раздел спринта — подзадачи едут следом.
create function tasks_propagate_to_children() returns trigger as $$
begin
  if new.project_id is distinct from old.project_id or new.section_id is distinct from old.section_id then
    update tasks
    set project_id = new.project_id, section_id = new.section_id
    where parent_id = new.id;
  end if;
  return null;
end;
$$ language plpgsql set search_path = public;

create trigger tasks_propagate_to_children
after update of project_id, section_id on tasks
for each row execute function tasks_propagate_to_children();

revoke execute on function public.tasks_parent_guard() from public;
revoke execute on function public.tasks_propagate_to_children() from public;
