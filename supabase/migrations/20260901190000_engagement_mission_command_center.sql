-- Fonte unica da aba operacional: acumulado integral da missao + movimento do
-- dia, sempre sobre o mesmo conjunto de lideres.

CREATE OR REPLACE FUNCTION public.engagement_mission_command_center(
  p_client_id uuid,
  p_mission_id uuid DEFAULT NULL,
  p_dia date DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  p_root_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_mission uuid:=p_mission_id;
  v_ini timestamptz:=(p_dia::timestamp AT TIME ZONE 'America/Cuiaba');
  v_fim timestamptz:=((p_dia+1)::timestamp AT TIME ZONE 'America/Cuiaba');
  v_result jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;

  IF v_mission IS NULL THEN
    SELECT m.id INTO v_mission
    FROM portal_missions m
    WHERE m.client_id=p_client_id AND m.archived_at IS NULL AND coalesce(m.is_active,true)
      AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))
    ORDER BY coalesce(m.publicado_em,m.created_at) DESC,m.id DESC LIMIT 1;
  END IF;

  IF v_mission IS NULL THEN
    RETURN jsonb_build_object('mission',NULL,'cumulative',jsonb_build_object(),
      'today',jsonb_build_object(),'people','[]'::jsonb,'updated_at',now());
  END IF;

  WITH facts_raw AS MATERIALIZED (
    SELECT * FROM public.engagement_pub_facts_v2(
      p_client_id,3650,NULL,0,p_root_id,v_mission
    )
  ), facts AS MATERIALIZED (
    SELECT DISTINCT ON(f.origem,f.pessoa_id) f.*
    FROM facts_raw f
    ORDER BY f.origem,f.pessoa_id,
      CASE f.status WHEN 'cumpriu' THEN 0 WHEN 'abriu' THEN 1 ELSE 2 END,
      f.cumprido_em DESC NULLS LAST
  ), totals AS (
    SELECT count(*)::integer obrigados,
      count(*) FILTER(WHERE f.status='cumpriu')::integer concluidos,
      count(*) FILTER(WHERE f.status='abriu')::integer abriu,
      count(*) FILTER(WHERE f.status='nao_abriu')::integer nao_abriu,
      count(*) FILTER(WHERE f.prova='E1')::integer e1,
      count(*) FILTER(WHERE f.prova='E2')::integer e2,
      count(*) FILTER(WHERE f.prova='E3')::integer e3,
      count(*) FILTER(WHERE f.cumprido_em>=v_ini AND f.cumprido_em<v_fim)::integer concluidos_hoje,
      count(*) FILTER(WHERE f.primeiro_acesso_em>=v_ini AND f.primeiro_acesso_em<v_fim)::integer abriram_hoje
    FROM facts f
  ), events_today AS (
    SELECT count(*)::integer eventos,
      count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL)::integer identificados,
      count(*) FILTER(WHERE e.event_type::text='open')::integer aberturas,
      count(*) FILTER(WHERE e.event_type::text LIKE 'click_%')::integer cliques,
      count(DISTINCT e.participant_id) FILTER(
        WHERE e.event_type::text='declared_done' AND e.participant_id IS NOT NULL
      )::integer confirmacoes
    FROM mission_events e
    WHERE e.client_id=p_client_id AND e.mission_id=v_mission
      AND e.created_at>=v_ini AND e.created_at<v_fim AND NOT coalesce(e.is_bot,false)
  ), hourly AS (
    SELECT jsonb_agg(jsonb_build_object(
      'hora',h.hora,
      'eventos',coalesce(x.eventos,0),
      'pessoas',coalesce(x.pessoas,0),
      'confirmacoes',coalesce(x.confirmacoes,0)
    ) ORDER BY h.hora) dados
    FROM generate_series(0,23) h(hora)
    LEFT JOIN (
      SELECT extract(hour FROM e.created_at AT TIME ZONE 'America/Cuiaba')::integer hora,
        count(*)::integer eventos,
        count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL)::integer pessoas,
        count(DISTINCT e.participant_id) FILTER(
          WHERE e.event_type::text='declared_done' AND e.participant_id IS NOT NULL
        )::integer confirmacoes
      FROM mission_events e
      WHERE e.client_id=p_client_id AND e.mission_id=v_mission
        AND e.created_at>=v_ini AND e.created_at<v_fim AND NOT coalesce(e.is_bot,false)
      GROUP BY 1
    ) x ON x.hora=h.hora
  ), people_json AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'pessoa_id',f.pessoa_id,'origem',f.origem,'nome',f.nome,'telefone',f.telefone,
      'cargo',f.cargo,'regiao',f.regiao,'cidade',f.cidade,'status',f.status,'prova',f.prova,
      'cumprido_em',f.cumprido_em,'primeiro_acesso_em',f.primeiro_acesso_em,
      'concluiu_hoje',(f.cumprido_em>=v_ini AND f.cumprido_em<v_fim),
      'abriu_hoje',(f.primeiro_acesso_em>=v_ini AND f.primeiro_acesso_em<v_fim)
    ) ORDER BY CASE f.status WHEN 'nao_abriu' THEN 0 WHEN 'abriu' THEN 1 ELSE 2 END,f.nome),'[]'::jsonb) dados
    FROM facts f
  )
  SELECT jsonb_build_object(
    'mission',jsonb_build_object('id',m.id,'title',coalesce(m.title,m.post_url,'Missao'),
      'platform',m.platform,'published_at',coalesce(m.publicado_em,m.created_at)),
    'cumulative',jsonb_build_object('obrigados',t.obrigados,'concluidos',t.concluidos,
      'abriu_sem_concluir',t.abriu,'nao_abriu',t.nao_abriu,
      'taxa',CASE WHEN t.obrigados>0 THEN round(100.0*t.concluidos/t.obrigados,1) ELSE 0 END,
      'e1',t.e1,'e2',t.e2,'e3',t.e3),
    'today',jsonb_build_object('dia',p_dia,'eventos',coalesce(e.eventos,0),
      'pessoas_identificadas',coalesce(e.identificados,0),'aberturas',coalesce(e.aberturas,0),
      'cliques',coalesce(e.cliques,0),'confirmacoes_evento',coalesce(e.confirmacoes,0),
      'lideres_concluiram',t.concluidos_hoje,'lideres_abriram',t.abriram_hoje),
    'hourly',h.dados,'people',p.dados,'updated_at',now()
  ) INTO v_result
  FROM portal_missions m CROSS JOIN totals t CROSS JOIN events_today e CROSS JOIN hourly h CROSS JOIN people_json p
  WHERE m.id=v_mission AND m.client_id=p_client_id;

  RETURN coalesce(v_result,jsonb_build_object('mission',NULL,'cumulative',jsonb_build_object(),
    'today',jsonb_build_object(),'people','[]'::jsonb,'updated_at',now()));
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_operational_missions(p_client_id uuid,p_limit integer DEFAULT 50)
RETURNS TABLE(mission_id uuid,titulo text,publicado_em timestamptz,is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
  SELECT m.id,coalesce(m.title,m.post_url,'Missao'),coalesce(m.publicado_em,m.created_at),coalesce(m.is_active,true)
  FROM portal_missions m
  WHERE m.client_id=p_client_id AND m.archived_at IS NULL
    AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))
    AND public.is_client_member(p_client_id)
  ORDER BY coalesce(m.publicado_em,m.created_at) DESC,m.id DESC
  LIMIT greatest(1,least(coalesce(p_limit,50),200));
$function$;

REVOKE ALL ON FUNCTION public.engagement_mission_command_center(uuid,uuid,date,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.engagement_operational_missions(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_mission_command_center(uuid,uuid,date,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_operational_missions(uuid,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
