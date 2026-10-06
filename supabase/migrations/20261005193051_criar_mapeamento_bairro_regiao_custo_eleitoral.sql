begin;

create table if not exists public.eleicao_bairro_regiao (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  municipio text not null default 'CAMPO GRANDE',
  bairro text not null,
  bairro_normalizado text not null,
  regiao_value text not null,
  fonte text not null default 'manual' check (fonte in ('manual', 'planurb')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eleicao_bairro_regiao_bairro_not_blank check (btrim(bairro) <> ''),
  constraint eleicao_bairro_regiao_normalizado_not_blank check (btrim(bairro_normalizado) <> ''),
  constraint eleicao_bairro_regiao_regiao_not_blank check (btrim(regiao_value) <> ''),
  constraint eleicao_bairro_regiao_unique unique (client_id, municipio, bairro_normalizado)
);

create index if not exists eleicao_bairro_regiao_client_regiao_idx
  on public.eleicao_bairro_regiao (client_id, municipio, regiao_value);

alter table public.eleicao_bairro_regiao enable row level security;

revoke all on table public.eleicao_bairro_regiao from public, anon;
grant select, insert, update, delete on table public.eleicao_bairro_regiao to authenticated;

drop policy if exists "Users can read neighborhood region mappings"
  on public.eleicao_bairro_regiao;
create policy "Users can read neighborhood region mappings"
  on public.eleicao_bairro_regiao
  for select
  to authenticated
  using (public.is_super_admin() or public.user_can_access_client(client_id));

drop policy if exists "Users can insert neighborhood region mappings"
  on public.eleicao_bairro_regiao;
create policy "Users can insert neighborhood region mappings"
  on public.eleicao_bairro_regiao
  for insert
  to authenticated
  with check (
    (select auth.uid()) is not null
    and (public.is_super_admin() or public.user_can_access_client(client_id))
  );

drop policy if exists "Users can update neighborhood region mappings"
  on public.eleicao_bairro_regiao;
create policy "Users can update neighborhood region mappings"
  on public.eleicao_bairro_regiao
  for update
  to authenticated
  using (public.is_super_admin() or public.user_can_access_client(client_id))
  with check (
    (select auth.uid()) is not null
    and (public.is_super_admin() or public.user_can_access_client(client_id))
  );

drop policy if exists "Users can delete neighborhood region mappings"
  on public.eleicao_bairro_regiao;
create policy "Users can delete neighborhood region mappings"
  on public.eleicao_bairro_regiao
  for delete
  to authenticated
  using (public.is_super_admin() or public.user_can_access_client(client_id));

drop trigger if exists eleicao_bairro_regiao_set_updated_at
  on public.eleicao_bairro_regiao;
create trigger eleicao_bairro_regiao_set_updated_at
  before update on public.eleicao_bairro_regiao
  for each row execute function public.update_updated_at_column();

comment on table public.eleicao_bairro_regiao is
  'Overrides auditaveis do vinculo entre bairros eleitorais e regioes operacionais da campanha.';

commit;
