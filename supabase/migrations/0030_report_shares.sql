-- Отчёт клиенту по ссылке: снимок отчёта по одному клиенту на момент отправки.
-- Владелец видит и отзывает свои ссылки. Посторонний — только через get_shared_report
-- по секретному токену: таблица для него закрыта, перебрать ссылки нельзя.

create table if not exists public.report_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  -- случайная строка из приложения (crypto.getRandomValues), не угадывается
  token text not null unique check (length(token) >= 20),
  -- клиент, по которому собран снимок; удалили значение — снимок остаётся
  item_id uuid references public.group_items(id) on delete set null,
  title text not null,
  period_from date not null,
  period_to date not null,
  -- то, что увидит клиент: спринты, часы, сумма. Без журнала и комментариев
  data jsonb not null,
  views integer not null default 0,
  last_viewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists report_shares_user_idx on public.report_shares (user_id, created_at desc);

alter table public.report_shares enable row level security;

drop policy if exists report_shares_owner on public.report_shares;
create policy report_shares_owner on public.report_shares
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Открыть отчёт по ссылке: без входа. Отозванная или чужая ссылка — null.
create or replace function public.get_shared_report(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.report_shares;
begin
  if p_token is null or length(p_token) < 20 then
    return null;
  end if;
  update public.report_shares
     set views = views + 1, last_viewed_at = now()
   where token = p_token and revoked_at is null
  returning * into r;
  if not found then
    return null;
  end if;
  return jsonb_build_object('title', r.title, 'created_at', r.created_at, 'data', r.data);
end;
$$;

revoke all on function public.get_shared_report(text) from public;
grant execute on function public.get_shared_report(text) to anon, authenticated;
