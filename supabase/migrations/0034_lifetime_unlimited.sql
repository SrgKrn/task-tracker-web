-- Пожизненный — безлимит, а не «как Про»: всё из «Про» и без числовых ограничений
-- (пространства, группы, место и размер файлов, календари, ссылки, выгрузки).
-- Срок жизни ссылки для клиента (share_days) — правило для всех, его не снимаем.

create or replace function public.plan_limits_of(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (select 1 from public.user_plans where user_id = p_user and plan = 'lifetime') then
      (select limits from public.plan_limits where plan = 'pro')
        || '{"workspaces": null, "groups": null, "items": null, "tasks": null, "subtasks": null, "stages": null,
             "export_per_month": null, "share_links": null, "calendars": null,
             "storage_mb": null, "file_mb": null}'::jsonb
    else
      (select limits from public.plan_limits where plan = public.effective_plan(p_user))
  end
$$;

revoke all on function public.plan_limits_of(uuid) from public, anon, authenticated;
