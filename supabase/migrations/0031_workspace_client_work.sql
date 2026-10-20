-- «Работа с клиентами» — у пространства. Выключено: в пространстве нет ничего про деньги
-- (ставка, «К оплате», ссылка для клиента). Включено по умолчанию только у пресета «Клиенты»;
-- остальные включают сами в настройках пространства.

alter table public.workspaces
  add column if not exists client_work boolean not null default false;

update public.workspaces set client_work = true where preset_code = 'clients';

-- пресет «Клиенты» включает сам — и при создании пространства, и при применении пресета
create or replace function public.workspaces_client_work_default()
returns trigger
language plpgsql
as $$
begin
  if new.preset_code = 'clients'
     and (tg_op = 'INSERT' or new.preset_code is distinct from old.preset_code) then
    new.client_work := true;
  end if;
  return new;
end;
$$;

drop trigger if exists workspaces_client_work_default on public.workspaces;
create trigger workspaces_client_work_default
  before insert or update of preset_code on public.workspaces
  for each row execute function public.workspaces_client_work_default();
