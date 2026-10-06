begin;

alter table public.tse_votacao_secao
  drop constraint if exists tse_votacao_secao_cargo_check;

alter table public.tse_votacao_secao
  add constraint tse_votacao_secao_cargo_check
  check (cargo in (1, 3, 5, 6, 7));

-- A carga anterior gravava apenas deputado federal/estadual. Reiniciar o cursor
-- garante que cada boletim seja relido com os cinco cargos após o deploy da função.
update public.tse_secao_sync_status
set status = 'pending',
    secoes_processadas = 0,
    proximo_cursor = 0,
    erro = null,
    updated_at = now()
where ano = 2026;

create or replace function public.get_tse_candidate_sections(
  p_ano integer,
  p_uf text,
  p_cod_municipio integer,
  p_cargo text,
  p_numero integer
)
returns table (
  zona integer,
  secao integer,
  secoes_agregadas integer[],
  nr_local integer,
  nome_local text,
  endereco text,
  bairro text,
  votos integer,
  percentual numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  with parametros as (
    select case p_cargo
      when 'Presidente' then 1
      when 'Governador' then 3
      when 'Senador' then 5
      when 'Deputado Federal' then 6
      when 'Deputado Estadual' then 7
      else 0
    end as cargo_codigo
  ), locais as (
    select
      l.cod_municipio,
      l.zona,
      l.nr_local,
      max(l.nome_local) as nome_local,
      max(l.endereco) as endereco,
      max(nullif(btrim(l.bairro), '')) as bairro
    from public.tse_votacao_local l
    where l.cod_municipio = p_cod_municipio
      and l.ano = 2024
    group by l.cod_municipio, l.zona, l.nr_local
  ), catalogo as (
    select distinct
      s.cod_municipio,
      s.zona,
      s.secao,
      s.secoes_agregadas,
      s.nr_local
    from public.tse_votacao_secao s
    cross join parametros p
    where s.ano = p_ano
      and s.uf = upper(p_uf)
      and s.cod_municipio = p_cod_municipio
      and s.cargo = p.cargo_codigo
  ), secoes as (
    select
      c.zona,
      c.secao,
      c.secoes_agregadas,
      c.nr_local,
      l.nome_local,
      l.endereco,
      l.bairro,
      coalesce(s.votos, 0)::integer as votos,
      sum(coalesce(s.votos, 0)) over () as total_votos
    from catalogo c
    cross join parametros p
    left join public.tse_votacao_secao s
      on s.ano = p_ano
     and s.uf = upper(p_uf)
     and s.cod_municipio = p_cod_municipio
     and s.zona = c.zona
     and s.secao = c.secao
     and s.cargo = p.cargo_codigo
     and s.numero = p_numero
    left join locais l
      on l.cod_municipio = c.cod_municipio
     and l.zona = c.zona
     and l.nr_local = c.nr_local
  )
  select
    s.zona,
    s.secao,
    s.secoes_agregadas,
    s.nr_local,
    s.nome_local,
    s.endereco,
    s.bairro,
    s.votos,
    case
      when s.total_votos > 0
        then round((s.votos::numeric / s.total_votos::numeric) * 100, 4)
      else 0::numeric
    end as percentual
  from secoes s
  order by s.votos desc, s.zona, s.secao;
$$;

revoke all on function public.get_tse_candidate_sections(integer, text, integer, text, integer)
  from public, anon;
grant execute on function public.get_tse_candidate_sections(integer, text, integer, text, integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;
