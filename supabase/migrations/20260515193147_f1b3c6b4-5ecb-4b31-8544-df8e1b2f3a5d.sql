
create table public.eleicao_regioes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  value text not null,
  label text not null,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, value)
);

create index eleicao_regioes_client_idx on public.eleicao_regioes(client_id, ordem);

alter table public.eleicao_regioes enable row level security;

create policy "regioes_select" on public.eleicao_regioes
  for select using (is_super_admin() or user_can_access_client(client_id));

create policy "regioes_insert" on public.eleicao_regioes
  for insert with check (is_super_admin() or user_can_access_client(client_id));

create policy "regioes_update" on public.eleicao_regioes
  for update using (is_super_admin() or user_can_access_client(client_id))
  with check (is_super_admin() or user_can_access_client(client_id));

create policy "regioes_delete" on public.eleicao_regioes
  for delete using (is_super_admin() or user_can_access_client(client_id));

create trigger eleicao_regioes_set_updated_at
  before update on public.eleicao_regioes
  for each row execute function public.update_updated_at_column();

-- Seed: regiões padrão de Campo Grande para todo client que já tem líderes
with defaults(value, label, ordem) as (
  values
    ('centro','Centro',1),
    ('segredo','Segredo',2),
    ('prosa','Prosa',3),
    ('bandeira','Bandeira',4),
    ('anhanduizinho','Anhanduizinho',5),
    ('lagoa','Lagoa',6),
    ('imbirussu','Imbirussu',7),
    ('moreninha','Moreninha',8)
),
targets as (
  select distinct client_id from public.eleicao_pessoas where client_id is not null
  union
  select distinct client_id from public.eleicao_notif_config where client_id is not null
)
insert into public.eleicao_regioes (client_id, value, label, ordem)
select t.client_id, d.value, d.label, d.ordem
from targets t cross join defaults d
on conflict (client_id, value) do nothing;
