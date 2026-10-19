-- Методики приоритизации (0.32). Пользователь выбирает одну методику на всё приложение:
-- матрица Эйзенхауэра, «Съешь лягушку», правило 1-3-5 или ABCDE. От неё зависят поле
-- приоритета в карточке, вид «Сегодня» и порядок в «Задачах».
--
-- Отметки всех методик хранятся у задачи независимо: переключились на ABCDE и обратно —
-- квадранты Эйзенхауэра на месте. Все колонки необязательные: пустая — «не отмечено».

alter table user_settings add column priority_method text not null default 'none'
  check (priority_method in ('none', 'eisenhower', 'frog', '135', 'abcde'));

alter table tasks
  -- Эйзенхауэр. urgent: null — по сроку (до конца два дня или меньше — срочно), true/false —
  -- пользователь решил сам; important: null — задача ещё не разобрана
  add column urgent boolean,
  add column important boolean,
  -- «Съешь лягушку»: день, на который задача — лягушка; лягушка одна в день
  add column frog_date date,
  -- правило 1-3-5: размер задачи; null — подсказывается по плану часов
  add column effort text check (effort in ('big', 'medium', 'small')),
  -- ABCDE: буква и номер внутри буквы (A-1, A-2)
  add column abc_letter text check (abc_letter in ('A', 'B', 'C', 'D', 'E')),
  add column abc_rank smallint check (abc_rank > 0),
  -- кому поручено (D у ABCDE, «Поручить» у Эйзенхауэра)
  add column delegated_to text;

create unique index tasks_one_frog_per_day on tasks(user_id, frog_date) where frog_date is not null;

-- Назначить лягушку дня одним вызовом: прежняя лягушка этого дня снимается, иначе
-- уникальный индекс не дал бы поставить новую. p_task_id null — просто снять.
create function set_frog(p_task_id uuid, p_date date) returns void as $$
begin
  update public.tasks set frog_date = null
  where user_id = auth.uid() and frog_date = p_date and id is distinct from p_task_id;
  if p_task_id is not null then
    update public.tasks set frog_date = p_date where id = p_task_id and user_id = auth.uid();
  end if;
end;
$$ language plpgsql security invoker set search_path = public;

revoke execute on function public.set_frog(uuid, date) from public, anon;
grant execute on function public.set_frog(uuid, date) to authenticated;
