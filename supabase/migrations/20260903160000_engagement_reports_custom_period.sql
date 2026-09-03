-- Relatorios de engajamento por intervalo fechado de datas.
-- Reaproveita a fonte canonica de fatos e limita as publicacoes ao calendario
-- local da campanha (America/Campo_Grande), incluindo os dois dias escolhidos.

CREATE OR REPLACE FUNCTION public.engagement_pub_facts_periodo_v2(
  p_client_id uuid, p_data_inicio date, p_data_fim date,
  p_audience_id uuid DEFAULT NULL, p_root_id uuid DEFAULT NULL,
  p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(
  mission_id uuid,titulo text,plataforma text,publicado_em timestamptz,
  pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,
  is_voluntario boolean,tem_contrato boolean,status text,prova text,
  cumprido_em timestamptz,primeiro_acesso_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_dias integer;
  v_ini timestamptz;
  v_fim timestamptz;
BEGIN
  IF p_data_inicio IS NULL OR p_data_fim IS NULL OR p_data_fim < p_data_inicio THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;
  IF p_data_fim > (now() AT TIME ZONE 'America/Campo_Grande')::date THEN
    RAISE EXCEPTION 'A data final nao pode estar no futuro';
  END IF;

  v_dias := greatest(((now() AT TIME ZONE 'America/Campo_Grande')::date - p_data_inicio) + 1, 1);
  v_ini := p_data_inicio::timestamp AT TIME ZONE 'America/Campo_Grande';
  v_fim := (p_data_fim + 1)::timestamp AT TIME ZONE 'America/Campo_Grande';

  RETURN QUERY
  SELECT f.*
  FROM public.engagement_pub_facts_v2(
    p_client_id, v_dias, p_audience_id, 0, p_root_id, p_mission_id
  ) f
  WHERE f.publicado_em >= v_ini AND f.publicado_em < v_fim;
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_pub_kpis_periodo_v2(
  p_client_id uuid, p_data_inicio date, p_data_fim date,
  p_audience_id uuid DEFAULT NULL, p_root_id uuid DEFAULT NULL,
  p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(
  publicacoes integer, obrigados integer, pares integer, cumprimentos integer,
  abriu_sem_confirmar integer, nunca_engajaram integer, adesao numeric,
  e1 integer, e2 integer, e3 integer, publicacoes_ant integer,
  cumprimentos_ant integer, adesao_ant numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
WITH periodo AS (SELECT (p_data_fim-p_data_inicio+1)::int dias),
cur AS (SELECT * FROM engagement_pub_facts_periodo_v2(p_client_id,p_data_inicio,p_data_fim,p_audience_id,p_root_id,p_mission_id)),
ant AS (SELECT * FROM engagement_pub_facts_periodo_v2(p_client_id,p_data_inicio-(SELECT dias FROM periodo),p_data_inicio-1,p_audience_id,p_root_id,NULL)),
c AS (SELECT count(DISTINCT mission_id)::int pubs,count(DISTINCT pessoa_id)::int obrig,count(*)::int pares,
  count(*) FILTER(WHERE status='cumpriu')::int cump,count(*) FILTER(WHERE status='abriu')::int abriu,
  count(*) FILTER(WHERE prova='E1')::int e1,count(*) FILTER(WHERE prova='E2')::int e2,count(*) FILTER(WHERE prova='E3')::int e3 FROM cur),
n AS (SELECT count(*)::int n FROM (SELECT pessoa_id FROM cur GROUP BY pessoa_id HAVING count(*) FILTER(WHERE status<>'nao_abriu')=0)x),
a AS (SELECT count(DISTINCT mission_id)::int pubs,count(*)::int pares,count(*) FILTER(WHERE status='cumpriu')::int cump FROM ant)
SELECT c.pubs,c.obrig,c.pares,c.cump,c.abriu,n.n,
  CASE WHEN c.pares>0 THEN round(c.cump::numeric/c.pares*100,1) ELSE 0 END,
  c.e1,c.e2,c.e3,a.pubs,a.cump,
  CASE WHEN a.pares>0 THEN round(a.cump::numeric/a.pares*100,1) ELSE 0 END
FROM c,n,a;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_publicacoes_desempenho_periodo_v2(
  p_client_id uuid, p_data_inicio date, p_data_fim date,
  p_audience_id uuid DEFAULT NULL, p_root_id uuid DEFAULT NULL,
  p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(mission_id uuid,titulo text,plataforma text,publicado_em timestamptz,
  obrigados integer,cumpriram integer,abriu_sem_confirmar integer,faltaram integer,
  e1 integer,e2 integer,e3 integer,adesao numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
SELECT f.mission_id,min(f.titulo),min(f.plataforma),min(f.publicado_em),count(*)::int,
  count(*) FILTER(WHERE status='cumpriu')::int,count(*) FILTER(WHERE status='abriu')::int,
  count(*) FILTER(WHERE status='nao_abriu')::int,count(*) FILTER(WHERE prova='E1')::int,
  count(*) FILTER(WHERE prova='E2')::int,count(*) FILTER(WHERE prova='E3')::int,
  round(count(*) FILTER(WHERE status='cumpriu')::numeric/nullif(count(*),0)*100,1)
FROM engagement_pub_facts_periodo_v2(p_client_id,p_data_inicio,p_data_fim,p_audience_id,p_root_id,p_mission_id) f
GROUP BY f.mission_id ORDER BY min(f.publicado_em) DESC;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_equipe_desempenho_periodo_v2(
  p_client_id uuid, p_data_inicio date, p_data_fim date,
  p_audience_id uuid DEFAULT NULL, p_root_id uuid DEFAULT NULL,
  p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,
  is_voluntario boolean,tem_contrato boolean,publicacoes integer,cumpridas integer,
  abriu_sem_confirmar integer,faltas integer,pct numeric,prova_principal text,faixa text,
  pct_anterior numeric,variacao numeric,ultima_atividade timestamptz,detalhe jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
WITH cur AS (
  SELECT f.*,
    EXISTS(SELECT 1 FROM mission_checkins c JOIN mission_events e ON e.participant_id=c.participant_id AND e.mission_id=c.mission_id
      WHERE c.mission_id=f.mission_id AND ((f.origem='eleicao' AND c.pessoa_id=f.pessoa_id) OR (f.origem='funcionario' AND c.funcionario_id=f.pessoa_id))
        AND e.event_type::text='click_facebook' AND NOT coalesce(e.is_bot,false)) facebook_abriu,
    EXISTS(SELECT 1 FROM mission_checkins c JOIN mission_events e ON e.participant_id=c.participant_id AND e.mission_id=c.mission_id
      WHERE c.mission_id=f.mission_id AND ((f.origem='eleicao' AND c.pessoa_id=f.pessoa_id) OR (f.origem='funcionario' AND c.funcionario_id=f.pessoa_id))
        AND e.event_type::text='click_instagram' AND NOT coalesce(e.is_bot,false)) instagram_abriu
  FROM engagement_pub_facts_periodo_v2(p_client_id,p_data_inicio,p_data_fim,p_audience_id,p_root_id,p_mission_id) f
), agg AS (
 SELECT f.pessoa_id,f.origem,min(f.nome) nome,min(f.telefone) telefone,min(f.cargo) cargo,
  min(f.regiao) regiao,min(f.cidade) cidade,bool_or(f.is_voluntario) volunt,bool_or(f.tem_contrato) contrato,
  count(*)::int pubs,count(*) FILTER(WHERE status='cumpriu')::int cump,
  count(*) FILTER(WHERE status='abriu')::int abriu,count(*) FILTER(WHERE status='nao_abriu')::int faltas,
  (array_agg(f.prova ORDER BY f.prova))[1] prova,
  max(greatest(coalesce(f.cumprido_em,'epoch'),coalesce(f.primeiro_acesso_em,'epoch'))) ult,
  jsonb_agg(jsonb_build_object('mission_id',f.mission_id,'titulo',f.titulo,'publicado_em',f.publicado_em,
    'status',f.status,'prova',f.prova,'facebook_abriu',f.facebook_abriu,'instagram_abriu',f.instagram_abriu)
    ORDER BY f.publicado_em DESC) detalhe
 FROM cur f GROUP BY 1,2
)
SELECT a.pessoa_id,a.origem,a.nome,a.telefone,a.cargo,a.regiao,a.cidade,a.volunt,a.contrato,
 a.pubs,a.cump,a.abriu,a.faltas,round(a.cump::numeric/nullif(a.pubs,0)*100,1),a.prova,
 CASE WHEN a.cump::numeric/a.pubs>=.8 THEN 'excelente' WHEN a.cump::numeric/a.pubs>=.5 THEN 'atencao'
      WHEN a.cump>0 THEN 'baixo' ELSE 'critico' END,
 NULL::numeric,NULL::numeric,nullif(a.ult,'epoch'),a.detalhe
FROM agg a ORDER BY a.cump::numeric/nullif(a.pubs,0) DESC,a.nome;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_publicacoes_audit_periodo(
  p_client_id uuid, p_data_inicio date, p_data_fim date,
  p_audience_id uuid DEFAULT NULL, p_root_id uuid DEFAULT NULL,
  p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(mission_id uuid,publico_congelado integer,registros_ativos integer,
  pessoas_unicas integer,dispensados integer,duplicados integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
SELECT a.* FROM engagement_publicacoes_audit(
  p_client_id,
  greatest(((now() AT TIME ZONE 'America/Campo_Grande')::date-p_data_inicio)+1,1),
  p_audience_id,p_root_id,p_mission_id
) a JOIN portal_missions m ON m.id=a.mission_id
WHERE coalesce(m.publicado_em,m.created_at) >= p_data_inicio::timestamp AT TIME ZONE 'America/Campo_Grande'
  AND coalesce(m.publicado_em,m.created_at) < (p_data_fim+1)::timestamp AT TIME ZONE 'America/Campo_Grande';
$function$;

REVOKE ALL ON FUNCTION public.engagement_pub_facts_periodo_v2(uuid,date,date,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.engagement_pub_kpis_periodo_v2(uuid,date,date,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.engagement_publicacoes_desempenho_periodo_v2(uuid,date,date,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.engagement_equipe_desempenho_periodo_v2(uuid,date,date,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.engagement_publicacoes_audit_periodo(uuid,date,date,uuid,uuid,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.engagement_pub_facts_periodo_v2(uuid,date,date,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_pub_kpis_periodo_v2(uuid,date,date,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_publicacoes_desempenho_periodo_v2(uuid,date,date,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_equipe_desempenho_periodo_v2(uuid,date,date,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_publicacoes_audit_periodo(uuid,date,date,uuid,uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
