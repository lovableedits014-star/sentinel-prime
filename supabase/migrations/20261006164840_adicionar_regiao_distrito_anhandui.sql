begin;

-- Anhanduí é um distrito rural de Campo Grande e não deve ser somado à
-- Região Urbana do Anhanduizinho. Incluí-lo como território próprio evita
-- distorção nos votos e no custo por voto regional.
insert into public.eleicao_regioes (client_id, value, label, ordem, escopo)
select
  c.id,
  'anhandui',
  'Anhanduí',
  9,
  'campo_grande'
from public.clients c
on conflict (client_id, escopo, value)
do update set
  label = excluded.label,
  ativo = true,
  updated_at = now();

create or replace function public.get_tse_candidate_ranking_by_locations(
  p_ano integer,
  p_uf text,
  p_cod_municipio integer,
  p_cargo text,
  p_bairros text[] default null,
  p_locais text[] default null,
  p_zona integer default null,
  p_secao integer default null,
  p_nr_local integer default null
)
returns table (
  numero integer,
  nome_urna text,
  nome_completo text,
  partido text,
  votos bigint,
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
      max(nullif(btrim(l.bairro), '')) as bairro
    from public.tse_votacao_local l
    where l.ano = 2024
      and l.cod_municipio = p_cod_municipio
    group by l.cod_municipio, l.zona, l.nr_local
  ), candidatos as (
    select
      z.numero,
      max(z.nome_urna) as nome_urna,
      max(z.nome_completo) as nome_completo,
      max(z.partido) as partido
    from public.tse_votacao_zona z
    where z.ano = p_ano
      and z.uf = upper(p_uf)
      and z.cod_municipio = p_cod_municipio
      and z.cargo = p_cargo
      and z.numero is not null
    group by z.numero
  ), apuracao as (
    select
      s.numero,
      sum(s.votos)::bigint as votos
    from public.tse_votacao_secao s
    cross join parametros p
    left join locais l
      on l.cod_municipio = s.cod_municipio
     and l.zona = s.zona
     and l.nr_local = s.nr_local
    where s.ano = p_ano
      and s.uf = upper(p_uf)
      and s.cod_municipio = p_cod_municipio
      and s.cargo = p.cargo_codigo
      and (p_bairros is null or l.bairro = any(p_bairros))
      and (
        p_locais is null
        or (s.zona::text || ':' || s.nr_local::text) = any(p_locais)
      )
      and (p_zona is null or s.zona = p_zona)
      and (p_secao is null or s.secao = p_secao)
      and (p_nr_local is null or s.nr_local = p_nr_local)
    group by s.numero
  ), ranking as (
    select
      a.numero,
      c.nome_urna,
      c.nome_completo,
      c.partido,
      a.votos,
      sum(a.votos) over () as total_votos
    from apuracao a
    left join candidatos c on c.numero = a.numero
    where a.votos > 0
  )
  select
    r.numero,
    r.nome_urna,
    r.nome_completo,
    r.partido,
    r.votos,
    case
      when r.total_votos > 0
        then round((r.votos::numeric / r.total_votos::numeric) * 100, 4)
      else 0::numeric
    end as percentual
  from ranking r
  order by r.votos desc, r.numero;
$$;

revoke all on function public.get_tse_candidate_ranking_by_locations(
  integer, text, integer, text, text[], text[], integer, integer, integer
) from public, anon;
grant execute on function public.get_tse_candidate_ranking_by_locations(
  integer, text, integer, text, text[], text[], integer, integer, integer
) to authenticated;

notify pgrst, 'reload schema';

commit;
