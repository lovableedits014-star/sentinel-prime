-- Metricas operacionais sem misturar eventos brutos, pessoas unicas e o
-- subconjunto de lideres obrigados da missao.

CREATE OR REPLACE FUNCTION public.engagement_mission_activity_summary(
  p_client_id uuid,
  p_mission_id uuid,
  p_dia date DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ini timestamptz:=(p_dia::timestamp AT TIME ZONE 'America/Cuiaba');
  v_fim timestamptz:=((p_dia+1)::timestamp AT TIME ZONE 'America/Cuiaba');
  v_result jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;

  WITH valid_events AS MATERIALIZED (
    SELECT e.*
    FROM mission_events e
    WHERE e.client_id=p_client_id AND e.mission_id=p_mission_id
      AND e.created_at>=v_ini AND e.created_at<v_fim
      AND NOT coalesce(e.is_bot,false)
  ), participants AS MATERIALIZED (
    SELECT DISTINCT e.participant_id
    FROM valid_events e WHERE e.participant_id IS NOT NULL
  ), linked AS MATERIALIZED (
    SELECT p.participant_id,
      (mp.pessoa_id IS NOT NULL OR mp.funcionario_id IS NOT NULL
        OR mp.contratado_id IS NOT NULL OR mp.crm_pessoa_id IS NOT NULL) vinculado
    FROM participants p JOIN mission_participants mp ON mp.id=p.participant_id
  ), confirmed AS MATERIALIZED (
    SELECT DISTINCT e.participant_id
    FROM valid_events e
    WHERE e.participant_id IS NOT NULL AND e.event_type::text='declared_done'
  ), confirmed_in_audience AS MATERIALIZED (
    SELECT DISTINCT c.participant_id
    FROM confirmed c
    JOIN mission_participants mp ON mp.id=c.participant_id
    WHERE EXISTS(
      SELECT 1 FROM engagement_obrigacoes o
      WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id
        AND o.status<>'dispensada' AND o.origem IN('eleicao','eleicao_pessoas')
        AND (
          o.ref_id=mp.pessoa_id OR
          (public.mission_phone_key(o.telefone) IS NOT NULL AND
           public.mission_phone_key(o.telefone)=public.mission_phone_key(mp.phone_e164))
        )
    )
  ), leader_facts AS MATERIALIZED (
    SELECT DISTINCT ON(f.origem,f.pessoa_id) f.*
    FROM public.engagement_pub_facts_v2(p_client_id,3650,NULL,0,NULL,p_mission_id) f
    ORDER BY f.origem,f.pessoa_id,
      CASE f.status WHEN 'cumpriu' THEN 0 WHEN 'abriu' THEN 1 ELSE 2 END,
      f.cumprido_em DESC NULLS LAST
  ), totals AS (
    SELECT
      (SELECT count(*) FROM valid_events)::integer eventos_brutos,
      (SELECT count(*) FROM participants)::integer pessoas_identificadas,
      (SELECT count(*) FROM linked WHERE vinculado)::integer pessoas_vinculadas,
      (SELECT count(*) FROM linked WHERE NOT vinculado)::integer pessoas_nao_vinculadas,
      count(DISTINCT e.participant_id) FILTER(
        WHERE e.participant_id IS NOT NULL AND e.event_type::text='open'
      )::integer pessoas_abriram,
      count(DISTINCT e.participant_id) FILTER(
        WHERE e.participant_id IS NOT NULL AND e.event_type::text LIKE 'click_%'
      )::integer pessoas_clicaram,
      (SELECT count(*) FROM confirmed)::integer pessoas_confirmaram,
      (SELECT count(*) FROM confirmed_in_audience)::integer confirmados_no_publico,
      ((SELECT count(*) FROM confirmed)-(SELECT count(*) FROM confirmed_in_audience))::integer confirmados_fora_publico,
      count(DISTINCT (e.participant_id,e.event_type,e.mission_link_id)) FILTER(
        WHERE e.participant_id IS NOT NULL
      )::integer acoes_unicas
    FROM valid_events e
  ), leader_totals AS (
    SELECT count(*) FILTER(
      WHERE f.status='cumpriu' AND f.cumprido_em>=v_ini AND f.cumprido_em<v_fim
    )::integer lideres_concluiram,
    count(*) FILTER(
      WHERE f.primeiro_acesso_em>=v_ini AND f.primeiro_acesso_em<v_fim
    )::integer lideres_abriram
    FROM leader_facts f
  ), hourly AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'hora',h.hora,'pessoas',coalesce(x.pessoas,0),
      'pessoas_clicaram',coalesce(x.clicaram,0),
      'confirmacoes',coalesce(x.confirmacoes,0),
      'eventos_brutos',coalesce(x.eventos_brutos,0)
    ) ORDER BY h.hora),'[]'::jsonb) dados
    FROM generate_series(0,23) h(hora)
    LEFT JOIN (
      SELECT extract(hour FROM e.created_at AT TIME ZONE 'America/Cuiaba')::integer hora,
        count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL)::integer pessoas,
        count(DISTINCT e.participant_id) FILTER(
          WHERE e.participant_id IS NOT NULL AND e.event_type::text LIKE 'click_%'
        )::integer clicaram,
        count(DISTINCT e.participant_id) FILTER(
          WHERE e.participant_id IS NOT NULL AND e.event_type::text='declared_done'
        )::integer confirmacoes,
        count(*)::integer eventos_brutos
      FROM valid_events e GROUP BY 1
    ) x ON x.hora=h.hora
  )
  SELECT jsonb_build_object(
    'dia',p_dia,
    'eventos_brutos',t.eventos_brutos,
    'acoes_unicas',t.acoes_unicas,
    'pessoas_identificadas',t.pessoas_identificadas,
    'pessoas_vinculadas',t.pessoas_vinculadas,
    'pessoas_nao_vinculadas',t.pessoas_nao_vinculadas,
    'pessoas_abriram',t.pessoas_abriram,
    'pessoas_clicaram',t.pessoas_clicaram,
    'pessoas_confirmaram',t.pessoas_confirmaram,
    'confirmados_no_publico',t.confirmados_no_publico,
    'confirmados_fora_publico',t.confirmados_fora_publico,
    'lideres_concluiram',l.lideres_concluiram,
    'lideres_abriram',l.lideres_abriram,
    'hourly',h.dados,'updated_at',now()
  ) INTO v_result FROM totals t CROSS JOIN leader_totals l CROSS JOIN hourly h;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.engagement_mission_activity_summary(uuid,uuid,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_mission_activity_summary(uuid,uuid,date) TO authenticated;
NOTIFY pgrst, 'reload schema';
