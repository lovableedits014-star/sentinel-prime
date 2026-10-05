-- Integra a divulgacao oficial das Eleicoes 2026 (EA20/TSE) ao modulo
-- de Inteligencia Eleitoral. A carga e executada pela Edge Function
-- sync-tse-2026 com service_role; consumidores autenticados sao somente leitura.

begin;

alter table public.tse_votacao_zona
  add column if not exists seq_candidato bigint,
  add column if not exists percentual numeric(12, 9),
  add column if not exists eleicao integer,
  add column if not exists pleito integer,
  add column if not exists tse_idg bigint,
  add column if not exists tse_generated_at text,
  add column if not exists source text not null default 'dados_abertos_tse',
  add column if not exists sync_id uuid;

create index if not exists idx_tse_vot_escopo_relatorio
  on public.tse_votacao_zona (ano, uf, cargo, turno, cod_municipio, zona);

create index if not exists idx_tse_vot_candidato_relatorio
  on public.tse_votacao_zona (ano, uf, cargo, numero, cod_municipio);

create table if not exists public.tse_sync_runs (
  id uuid primary key default gen_random_uuid(),
  ano integer not null,
  turno integer not null default 1,
  uf text not null,
  cargo text not null,
  cargo_codigo text not null,
  eleicao integer not null,
  pleito integer not null,
  status text not null default 'running'
    check (status in ('running', 'success', 'error')),
  municipalities integer not null default 0,
  zones integer not null default 0,
  rows_imported integer not null default 0,
  tse_files integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_tse_sync_runs_latest
  on public.tse_sync_runs (ano, uf, cargo, started_at desc);

alter table public.tse_sync_runs enable row level security;

revoke all on table public.tse_sync_runs from public, anon;
grant select on table public.tse_sync_runs to authenticated;

drop policy if exists "Super admins read TSE sync runs" on public.tse_sync_runs;
create policy "Super admins read TSE sync runs"
  on public.tse_sync_runs
  for select
  to authenticated
  using ((select public.is_super_admin()));

create or replace function public.get_tse_dimensions()
returns table (uf text, municipio text, cargo text, ano integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct t.uf, t.municipio, t.cargo, t.ano
  from public.tse_votacao_zona t
  where t.uf is not null
    and t.municipio is not null
    and t.cargo is not null
  order by t.uf, t.municipio, t.cargo, t.ano;
$$;

create or replace function public.get_tse_coverage(
  p_anos integer[] default null,
  p_uf text default null,
  p_municipio text default null,
  p_cargo text default null
)
returns table (
  ano integer,
  ufs bigint,
  municipios bigint,
  candidatos bigint,
  votos bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.ano,
    count(distinct t.uf)::bigint as ufs,
    count(distinct (t.uf, t.cod_municipio))::bigint as municipios,
    count(distinct (t.cargo, t.numero, coalesce(t.partido, '')))::bigint as candidatos,
    coalesce(sum(t.votos), 0)::bigint as votos
  from public.tse_votacao_zona t
  where (p_anos is null or t.ano = any(p_anos))
    and (p_uf is null or t.uf = p_uf)
    and (p_municipio is null or t.municipio = p_municipio)
    and (p_cargo is null or t.cargo = p_cargo)
  group by t.ano
  order by t.ano;
$$;

create or replace function public.get_tse_admin_coverage()
returns table (
  uf text,
  ano integer,
  registros bigint,
  zonas bigint,
  municipios bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.uf,
    t.ano,
    count(*)::bigint,
    count(distinct (t.cod_municipio, t.zona))::bigint,
    count(distinct t.cod_municipio)::bigint
  from public.tse_votacao_zona t
  group by t.uf, t.ano
  order by t.uf, t.ano;
$$;

create or replace function public.get_tse_local_coverage()
returns table (
  uf text,
  ano integer,
  locais bigint,
  com_bairro bigint,
  municipios bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.uf,
    t.ano,
    count(distinct (t.cod_municipio, t.zona, t.nr_local))::bigint,
    (count(distinct (t.cod_municipio, t.zona, t.nr_local))
      filter (where t.bairro is not null and btrim(t.bairro) <> ''))::bigint,
    count(distinct t.cod_municipio)::bigint
  from public.tse_votacao_local t
  group by t.uf, t.ano
  order by t.uf, t.ano;
$$;

create or replace function public.get_tse_candidate_ranking(
  p_ano integer,
  p_uf text,
  p_cargo text,
  p_municipio text default null
)
returns table (
  numero integer,
  nome_urna text,
  nome_completo text,
  partido text,
  situacao text,
  votos bigint,
  municipios bigint,
  zonas bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.numero,
    max(t.nome_urna) as nome_urna,
    max(t.nome_completo) as nome_completo,
    max(t.partido) as partido,
    max(t.situacao) as situacao,
    coalesce(sum(t.votos), 0)::bigint as votos,
    count(distinct t.cod_municipio)::bigint as municipios,
    count(distinct (t.cod_municipio, t.zona))::bigint as zonas
  from public.tse_votacao_zona t
  where t.ano = p_ano
    and t.uf = upper(p_uf)
    and t.cargo = p_cargo
    and (p_municipio is null or t.municipio = p_municipio)
    and t.numero is not null
  group by t.numero
  order by sum(t.votos) desc, t.numero;
$$;

create or replace function public.get_tse_candidate_geography(
  p_ano integer,
  p_uf text,
  p_cargo text,
  p_numeros integer[],
  p_municipio text default null
)
returns table (
  numero integer,
  nome_urna text,
  partido text,
  cod_municipio integer,
  municipio text,
  zona integer,
  votos bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.numero,
    max(t.nome_urna) as nome_urna,
    max(t.partido) as partido,
    t.cod_municipio,
    t.municipio,
    t.zona,
    coalesce(sum(t.votos), 0)::bigint as votos
  from public.tse_votacao_zona t
  where t.ano = p_ano
    and t.uf = upper(p_uf)
    and t.cargo = p_cargo
    and t.numero = any(p_numeros)
    and (p_municipio is null or t.municipio = p_municipio)
  group by t.numero, t.cod_municipio, t.municipio, t.zona
  order by t.municipio, t.zona, t.numero;
$$;

revoke all on function public.get_tse_dimensions() from public, anon;
revoke all on function public.get_tse_coverage(integer[], text, text, text) from public, anon;
revoke all on function public.get_tse_admin_coverage() from public, anon;
revoke all on function public.get_tse_local_coverage() from public, anon;
revoke all on function public.get_tse_candidate_ranking(integer, text, text, text) from public, anon;
revoke all on function public.get_tse_candidate_geography(integer, text, text, integer[], text) from public, anon;

grant execute on function public.get_tse_dimensions() to authenticated;
grant execute on function public.get_tse_coverage(integer[], text, text, text) to authenticated;
grant execute on function public.get_tse_admin_coverage() to authenticated;
grant execute on function public.get_tse_local_coverage() to authenticated;
grant execute on function public.get_tse_candidate_ranking(integer, text, text, text) to authenticated;
grant execute on function public.get_tse_candidate_geography(integer, text, text, integer[], text) to authenticated;

create or replace function public.get_tse_locais_summary(
  p_ano integer,
  p_cod_municipio integer,
  p_cargo text,
  p_turno integer
)
returns table (
  zona integer,
  nr_local integer,
  nome_local text,
  endereco text,
  bairro text,
  total_votos bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    t.zona,
    t.nr_local,
    max(t.nome_local),
    max(t.endereco),
    max(t.bairro),
    sum(t.votos)::bigint
  from public.tse_votacao_local t
  where t.ano = p_ano
    and t.cod_municipio = p_cod_municipio
    and t.cargo = p_cargo
    and t.turno = p_turno
  group by t.zona, t.nr_local
  order by sum(t.votos) desc;
$$;

revoke all on function public.get_tse_locais_summary(integer, integer, text, integer) from public, anon;
grant execute on function public.get_tse_locais_summary(integer, integer, text, integer) to authenticated;

commit;
