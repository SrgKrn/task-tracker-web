/*
 * 0.43 «Первые шаги»: подсказки рядом с функциями.
 *
 * user_settings.tips — какие подсказки человек уже закрыл: {"timer": "2026-10-24T…", …}.
 *   Хранится в профиле, чтобы на втором устройстве те же подсказки не всплывали заново.
 * user_settings.tips_enabled — переключатель «Показывать подсказки» в справке.
 * user_settings.use_days / use_day — сколько разных дней человек открывал приложение
 *   (по своему поясу). По ним условия «на 3-й день» — неделя перерыва ничего не пропускает.
 *
 * Тем, кто уже прошёл первый экран, все подсказки 0.43 сразу отмечены: они пользуются
 * приложением и так. Список ниже должен совпадать с TIP_IDS в src/lib/tips.ts (тест).
 */

alter table public.user_settings
  add column if not exists tips jsonb not null default '{}'::jsonb,
  add column if not exists tips_enabled boolean not null default true,
  add column if not exists use_days integer not null default 0,
  add column if not exists use_day date;

-- tips-0.43: new-task, timer, ring, timer-note, stage, groups, subtasks, drag, summary, focus, tile, method, history, telegram, workspaces, export
update public.user_settings
set tips = tips || (
  select jsonb_object_agg(id, now())
  from unnest(array['new-task', 'timer', 'ring', 'timer-note', 'stage', 'groups', 'subtasks', 'drag',
    'summary', 'focus', 'tile', 'method', 'history', 'telegram', 'workspaces', 'export']) as id
)
where onboarded_at is not null;

-- «был в приложении»: теперь ещё и считает дни пользования
create or replace function public.app_seen(p_version text, p_device text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_settings s
  set last_seen_at = now(),
      last_seen_version = left(p_version, 20),
      last_seen_device = left(p_device, 40),
      use_days = s.use_days + case
        when s.use_day is distinct from (now() at time zone coalesce(s.timezone, 'Europe/Minsk'))::date then 1 else 0 end,
      use_day = (now() at time zone coalesce(s.timezone, 'Europe/Minsk'))::date
  where s.user_id = auth.uid()
$$;
revoke all on function public.app_seen(text, text) from public, anon;
grant execute on function public.app_seen(text, text) to authenticated;

-- закрыть подсказку: дописать одну отметку, не затирая отметки с другого устройства
create or replace function public.tip_seen(p_id text)
returns void
language sql
security invoker
set search_path = public
as $$
  update public.user_settings
  set tips = tips || jsonb_build_object(left(p_id, 40), now())
  where user_id = auth.uid()
$$;
revoke all on function public.tip_seen(text) from public, anon;
grant execute on function public.tip_seen(text) to authenticated;

-- «Показать подсказки заново»
create or replace function public.tips_reset()
returns void
language sql
security invoker
set search_path = public
as $$
  update public.user_settings set tips = '{}'::jsonb, tips_enabled = true where user_id = auth.uid()
$$;
revoke all on function public.tips_reset() from public, anon;
grant execute on function public.tips_reset() to authenticated;
