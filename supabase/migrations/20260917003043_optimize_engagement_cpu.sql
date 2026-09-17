-- Reduz CPU do historico de engajamento agregando os cliques uma unica vez
-- por missao/pessoa, em vez de executar dois EXISTS correlacionados para cada
-- linha retornada pela fonte de fatos.

CREATE INDEX IF NOT EXISTS idx_mission_events_report_platform_clicks
  ON public.mission_events(client_id,mission_id,participant_id,event_type)
  WHERE NOT coalesce(is_bot,false);

CREATE OR REPLACE FUNCTION public.engagement_equipe_desempenho_periodo_v2(
  p_client_id uuid, p_data_inicio date, p_data_fim date,
  p_audience_id uuid DEFAULT NULL, p_root_id uuid DEFAULT NULL,
  p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,
  is_voluntario boolean,tem_contrato boolean,publicacoes integer,cumpridas integer,
  abriu_sem_confirmar integer,faltas integer,pct numeric,prova_principal text,faixa text,
  pct_anterior numeric,variacao numeric,ultima_atividade timestamptz,detalhe jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
WITH facts AS MATERIALIZED (
  SELECT *
  FROM public.engagement_pub_facts_periodo_v2(
    p_client_id,p_data_inicio,p_data_fim,p_audience_id,p_root_id,p_mission_id
  )
), platform_clicks AS MATERIALIZED (
  SELECT
    c.mission_id,
    CASE
      WHEN c.pessoa_id IS NOT NULL THEN 'eleicao'
      WHEN c.funcionario_id IS NOT NULL THEN 'funcionario'
    END origem,
    coalesce(c.pessoa_id,c.funcionario_id) pessoa_id,
    bool_or(e.event_type::text='click_facebook') facebook_abriu,
    bool_or(e.event_type::text='click_instagram') instagram_abriu
  FROM public.mission_checkins c
  JOIN public.mission_events e
    ON e.client_id=c.client_id
   AND e.mission_id=c.mission_id
   AND e.participant_id=c.participant_id
  WHERE c.client_id=p_client_id
    AND c.mission_id IN (SELECT DISTINCT f.mission_id FROM facts f)
    AND coalesce(c.pessoa_id,c.funcionario_id) IS NOT NULL
    AND e.event_type::text IN ('click_facebook','click_instagram')
    AND NOT coalesce(e.is_bot,false)
  GROUP BY
    c.mission_id,
    CASE
      WHEN c.pessoa_id IS NOT NULL THEN 'eleicao'
      WHEN c.funcionario_id IS NOT NULL THEN 'funcionario'
    END,
    coalesce(c.pessoa_id,c.funcionario_id)
), cur AS (
  SELECT
    f.*,
    coalesce(pc.facebook_abriu,false) facebook_abriu,
    coalesce(pc.instagram_abriu,false) instagram_abriu
  FROM facts f
  LEFT JOIN platform_clicks pc
    ON pc.mission_id=f.mission_id
   AND pc.origem=f.origem
   AND pc.pessoa_id=f.pessoa_id
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

REVOKE ALL ON FUNCTION public.engagement_equipe_desempenho_periodo_v2(uuid,date,date,uuid,uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engagement_equipe_desempenho_periodo_v2(uuid,date,date,uuid,uuid,uuid)
  TO authenticated;

NOTIFY pgrst,'reload schema';
