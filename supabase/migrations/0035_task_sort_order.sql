-- 0.41: свой порядок задач — перетаскивание в списке.
--
-- tasks.sort_order — место задачи среди соседей: головных задач пространства или подзадач
-- одного спринта. Дробное число: перетаскивание ставит задачу между соседями (среднее их
-- мест) и меняет одну строку, а не перенумеровывает весь список.
--
-- Начальный порядок — тот, что пользователь видит сейчас: головные «по сроку» (без срока —
-- в конце, при равном сроке — новые выше), подзадачи — как в составе спринта (по сроку,
-- затем по созданию).
--
-- Новую задачу без места ставит триггер: головную — в начало списка (её только что
-- создали — она нужна наверху), подзадачу — в конец спринта, рядом с «+ Подзадача».

alter table public.tasks add column if not exists sort_order double precision;

update public.tasks t
set sort_order = s.rn
from (
  select id,
         row_number() over (
           partition by user_id, workspace_id
           order by end_date asc nulls last, created_at desc
         ) as rn
  from public.tasks
  where parent_id is null
) s
where t.id = s.id and t.sort_order is null;

update public.tasks t
set sort_order = s.rn
from (
  select id,
         row_number() over (
           partition by parent_id
           order by end_date asc nulls last, created_at asc
         ) as rn
  from public.tasks
  where parent_id is not null
) s
where t.id = s.id and t.sort_order is null;

create or replace function public.tasks_sort_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.sort_order is not null then
    return new;
  end if;
  if new.parent_id is null then
    select coalesce(min(sort_order), 1) - 1 into new.sort_order
    from tasks
    where user_id = new.user_id
      and workspace_id is not distinct from new.workspace_id
      and parent_id is null;
  else
    select coalesce(max(sort_order), 0) + 1 into new.sort_order
    from tasks
    where parent_id = new.parent_id;
  end if;
  return new;
end;
$$;

-- имя после a_tasks_workspace: пространство у новой задачи к этому моменту уже проставлено
drop trigger if exists tasks_sort_order on public.tasks;
create trigger tasks_sort_order
  before insert on public.tasks
  for each row execute function public.tasks_sort_order();

alter table public.tasks alter column sort_order set not null;

create index if not exists tasks_sort_order_idx on public.tasks (user_id, workspace_id, parent_id, sort_order);
