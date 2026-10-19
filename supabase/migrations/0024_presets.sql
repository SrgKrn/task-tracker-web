-- 0.35: пресеты и первый запуск. Новый пользователь сначала выбирает, для чего ему
-- трекер, — и пресет ставит группы со связями, этапы, норму, методику, режим фокуса и, по
-- желанию, примеры задач. Пользователь, который уже работает, может добавить из пресета
-- недостающие группы: существующие не трогаются.

-- прошёл ли человек первый экран; у тех, кто уже пользуется приложением, — уже прошёл
alter table user_settings add column onboarded_at timestamptz;
insert into user_settings (user_id) select id from auth.users u
where not exists (select 1 from user_settings s where s.user_id = u.id);
update user_settings set onboarded_at = now() where onboarded_at is null;

-- Группы новому пользователю больше не ставятся сами: их ставит выбранный пресет
-- («С чистого листа» — одну группу «Проекты»).
drop trigger if exists on_auth_user_created_groups on auth.users;
drop function if exists create_default_groups();

/**
 * Применить пресет. p_preset — описание из приложения (lib/presets.ts):
 *   groups:   [{key, name, item_name, required, show_in_list, parent, values: [{name, color, parent, example}]}]
 *   stages:   [{label, is_final}]
 *   settings: {priority_method, focus_mode, planned_hours_per_day, planned_hours_per_month, work_days_per_week}
 *   examples: [{name, planned_hours, is_daily, today, values: [{group, value}]}]
 * p_options: {examples, settings, stages, onboard} — что из этого ставить.
 *
 * Группа с тем же названием (без учёта регистра) не создаётся второй — в неё добавляются
 * недостающие значения. Связь «входит в» ставится только у созданных сейчас групп: у
 * существующих её выбрал сам человек. Этапы — только если своих этапов ещё нет.
 */
create function apply_preset(p_preset jsonb, p_options jsonb default '{}') returns json as $$
declare
  v_user uuid := auth.uid();
  g jsonb;
  v jsonb;
  e jsonb;
  ref jsonb;
  v_gid uuid;
  v_vid uuid;
  v_parent_gid uuid;
  v_new boolean;
  v_order integer;
  v_status uuid;
  v_items uuid[];
  gmap jsonb := '{}';      -- key → id группы
  created jsonb := '{}';   -- key → true, если группа создана сейчас
  n_groups integer := 0;
  n_values integer := 0;
  n_tasks integer := 0;
  n_stages integer := 0;
  v_examples boolean := coalesce((p_options ->> 'examples')::boolean, false);
  v_today date;
begin
  if v_user is null then raise exception 'Нужно войти заново'; end if;

  -- 1. группы
  for g in select * from jsonb_array_elements(coalesce(p_preset -> 'groups', '[]')) loop
    select id into v_gid from groups where user_id = v_user and lower(name) = lower(g ->> 'name') limit 1;
    v_new := v_gid is null;
    if v_new then
      select coalesce(max(sort_order) + 1, 0) into v_order from groups where user_id = v_user;
      insert into groups (user_id, name, item_name, required, show_in_list, sort_order)
      values (v_user, g ->> 'name', coalesce(g ->> 'item_name', g ->> 'name'),
        coalesce((g ->> 'required')::boolean, false), coalesce((g ->> 'show_in_list')::boolean, true), v_order)
      returning id into v_gid;
      n_groups := n_groups + 1;
      created := created || jsonb_build_object(g ->> 'key', true);
    end if;
    gmap := gmap || jsonb_build_object(g ->> 'key', v_gid);
  end loop;

  -- 2. связи «входит в» — у созданных сейчас
  for g in select * from jsonb_array_elements(coalesce(p_preset -> 'groups', '[]')) loop
    if g ->> 'parent' is not null and (created ->> (g ->> 'key')) is not null and gmap ? (g ->> 'parent') then
      update groups set parent_group_id = (gmap ->> (g ->> 'parent'))::uuid where id = (gmap ->> (g ->> 'key'))::uuid;
    end if;
  end loop;

  -- 3. значения: недостающие по названию; «входит в» — по названию значения родительской группы
  for g in select * from jsonb_array_elements(coalesce(p_preset -> 'groups', '[]')) loop
    v_gid := (gmap ->> (g ->> 'key'))::uuid;
    select parent_group_id into v_parent_gid from groups where id = v_gid;
    for v in select * from jsonb_array_elements(coalesce(g -> 'values', '[]')) loop
      continue when coalesce((v ->> 'example')::boolean, false) and not v_examples;
      continue when exists (select 1 from group_items where group_id = v_gid and lower(name) = lower(v ->> 'name'));
      select coalesce(max(sort_order) + 1, 0) into v_order from group_items where group_id = v_gid;
      insert into group_items (user_id, group_id, name, sort_order, color, parent_item_id)
      values (v_user, v_gid, v ->> 'name', v_order, v ->> 'color',
        case when v ->> 'parent' is not null and v_parent_gid is not null then
          (select id from group_items where group_id = v_parent_gid and lower(name) = lower(v ->> 'parent') limit 1)
        end);
      n_values := n_values + 1;
    end loop;
  end loop;

  -- 4. этапы — если своих ещё нет
  if coalesce((p_options ->> 'stages')::boolean, false) and not exists (select 1 from statuses where user_id = v_user) then
    v_order := 0;
    for v in select * from jsonb_array_elements(coalesce(p_preset -> 'stages', '[]')) loop
      insert into statuses (user_id, label, sort_order, is_final)
      values (v_user, v ->> 'label', v_order, coalesce((v ->> 'is_final')::boolean, false));
      v_order := v_order + 1;
      n_stages := n_stages + 1;
    end loop;
  end if;

  -- 5. норма, методика, фокус
  insert into user_settings (user_id) values (v_user) on conflict (user_id) do nothing;
  if coalesce((p_options ->> 'settings')::boolean, false) and p_preset ? 'settings' then
    update user_settings set
      priority_method = coalesce(p_preset #>> '{settings,priority_method}', priority_method),
      focus_mode = coalesce(p_preset #>> '{settings,focus_mode}', focus_mode),
      planned_hours_per_day = (p_preset #>> '{settings,planned_hours_per_day}')::numeric,
      planned_hours_per_month = (p_preset #>> '{settings,planned_hours_per_month}')::numeric,
      work_days_per_week = coalesce((p_preset #>> '{settings,work_days_per_week}')::int, work_days_per_week)
    where user_id = v_user;
  end if;

  -- 6. примеры задач: с первым незавершённым этапом и значениями по названиям; «сегодня» —
  -- в поясе человека, а не сервера
  if v_examples then
    select (now() at time zone coalesce(s.timezone, 'Europe/Minsk'))::date into v_today from user_settings s where s.user_id = v_user;
    select id into v_status from statuses where user_id = v_user and not is_final order by sort_order limit 1;
    for e in select * from jsonb_array_elements(coalesce(p_preset -> 'examples', '[]')) loop
      v_items := '{}';
      for ref in select * from jsonb_array_elements(coalesce(e -> 'values', '[]')) loop
        select id into v_vid from group_items
        where group_id = (gmap ->> (ref ->> 'group'))::uuid and lower(name) = lower(ref ->> 'value') limit 1;
        if v_vid is not null then v_items := v_items || v_vid; end if;
      end loop;
      insert into tasks (user_id, name, status_id, planned_hours, is_daily, plan_date, item_ids)
      values (v_user, e ->> 'name', v_status, coalesce((e ->> 'planned_hours')::numeric, 0),
        coalesce((e ->> 'is_daily')::boolean, false),
        case when coalesce((e ->> 'today')::boolean, false) then v_today end, v_items);
      n_tasks := n_tasks + 1;
    end loop;
  end if;

  if coalesce((p_options ->> 'onboard')::boolean, false) then
    update user_settings set onboarded_at = now() where user_id = v_user;
  end if;

  return json_build_object('groups', n_groups, 'values', n_values, 'stages', n_stages, 'tasks', n_tasks);
end;
$$ language plpgsql security invoker set search_path = public;

revoke execute on function public.apply_preset(jsonb, jsonb) from public, anon;
grant execute on function public.apply_preset(jsonb, jsonb) to authenticated;
