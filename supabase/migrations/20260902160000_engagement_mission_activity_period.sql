-- Alterna a leitura operacional entre hoje e todo o periodo da missao.
-- Pessoas continuam unicas dentro do periodo escolhido; eventos repetidos nao
-- inflam os indicadores principais.

CREATE OR REPLACE FUNCTION public.engagement_mission_activity_period(
  p_client_id uuid,
  p_mission_id uuid,
  p_periodo text DEFAULT 'hoje'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_inicio_missao timestamptz;
  v_ini timestamptz;
  v_fim timestamptz := now() + interval '1 millisecond';
  v_result jsonb;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  IF p_periodo NOT IN ('hoje','todo') THEN RAISE EXCEPTION 'Periodo invalido'; END IF;

  SELECT coalesce(m.publicado_em,m.created_at) INTO v_inicio_missao
  FROM portal_missions m WHERE m.id=p_mission_id AND m.client_id=p_client_id;
  IF v_inicio_missao IS NULL THEN RAISE EXCEPTION 'Missao nao encontrada'; END IF;

  v_ini := CASE WHEN p_periodo='hoje'
    THEN (v_hoje::timestamp AT TIME ZONE 'America/Cuiaba')
    ELSE v_inicio_missao END;
  IF p_periodo='hoje' THEN
    v_fim := ((v_hoje+1)::timestamp AT TIME ZONE 'America/Cuiaba');
  END IF;

  WITH valid_events AS MATERIALIZED (
    SELECT e.* FROM mission_events e
    WHERE e.client_id=p_client_id AND e.mission_id=p_mission_id
      AND e.created_at>=v_ini AND e.created_at<v_fim
      AND NOT coalesce(e.is_bot,false)
  ), participants AS MATERIALIZED (
    SELECT DISTINCT e.participant_id FROM valid_events e WHERE e.participant_id IS NOT NULL
  ), linked AS MATERIALIZED (
    SELECT p.participant_id,
      (mp.pessoa_id IS NOT NULL OR mp.funcionario_id IS NOT NULL
        OR mp.contratado_id IS NOT NULL OR mp.crm_pessoa_id IS NOT NULL) vinculado
    FROM participants p JOIN mission_participants mp ON mp.id=p.participant_id
  ), confirmed AS MATERIALIZED (
    SELECT DISTINCT e.participant_id FROM valid_events e
    WHERE e.participant_id IS NOT NULL AND e.event_type::text='declared_done'
  ), confirmed_in_audience AS MATERIALIZED (
    SELECT DISTINCT c.participant_id FROM confirmed c
    JOIN mission_participants mp ON mp.id=c.participant_id
    WHERE EXISTS(
      SELECT 1 FROM engagement_obrigacoes o
      WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id
        AND o.status<>'dispensada' AND o.origem IN('eleicao','eleicao_pessoas')
        AND (o.ref_id=mp.pessoa_id OR
          (public.mission_phone_key(o.telefone) IS NOT NULL AND
           public.mission_phone_key(o.telefone)=public.mission_phone_key(mp.phone_e164)))
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
      count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL AND e.event_type::text='open')::integer pessoas_abriram,
      count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL AND e.event_type::text LIKE 'click_%')::integer pessoas_clicaram,
      (SELECT count(*) FROM confirmed)::integer pessoas_confirmaram,
      (SELECT count(*) FROM confirmed_in_audience)::integer confirmados_no_publico,
      ((SELECT count(*) FROM confirmed)-(SELECT count(*) FROM confirmed_in_audience))::integer confirmados_fora_publico,
      count(DISTINCT (e.participant_id,e.event_type,e.mission_link_id)) FILTER(WHERE e.participant_id IS NOT NULL)::integer acoes_unicas
    FROM valid_events e
  ), leader_totals AS (
    SELECT
      count(*) FILTER(WHERE f.status='cumpriu' AND f.cumprido_em>=v_ini AND f.cumprido_em<v_fim)::integer lideres_concluiram,
      count(*) FILTER(WHERE f.primeiro_acesso_em>=v_ini AND f.primeiro_acesso_em<v_fim)::integer lideres_abriram
    FROM leader_facts f
  ), timeline AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'chave',g.chave,'rotulo',g.rotulo,'pessoas',coalesce(x.pessoas,0),
      'pessoas_clicaram',coalesce(x.clicaram,0),'confirmacoes',coalesce(x.confirmacoes,0),
      'eventos_brutos',coalesce(x.eventos_brutos,0)
    ) ORDER BY g.ordem),'[]'::jsonb) dados
    FROM (
      SELECT h::text chave,lpad(h::text,2,'0')||'h' rotulo,h ordem
      FROM generate_series(0,23) h WHERE p_periodo='hoje'
      UNION ALL
      SELECT d::date::text,to_char(d::date,'DD/MM') rotulo,(d::date-v_ini::date)::integer ordem
      FROM generate_series(v_ini::date,v_hoje,interval '1 day') s(d) WHERE p_periodo='todo'
    ) g
    LEFT JOIN (
      SELECT
        CASE WHEN p_periodo='hoje'
          THEN extract(hour FROM e.created_at AT TIME ZONE 'America/Cuiaba')::integer::text
          ELSE (e.created_at AT TIME ZONE 'America/Cuiaba')::date::text END chave,
        count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL)::integer pessoas,
        count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL AND e.event_type::text LIKE 'click_%')::integer clicaram,
        count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL AND e.event_type::text='declared_done')::integer confirmacoes,
        count(*)::integer eventos_brutos
      FROM valid_events e GROUP BY 1
    ) x ON x.chave=g.chave
  )
  SELECT jsonb_build_object(
    'periodo',p_periodo,'inicio',v_ini,'fim',v_fim,
    'eventos_brutos',t.eventos_brutos,'acoes_unicas',t.acoes_unicas,
    'pessoas_identificadas',t.pessoas_identificadas,'pessoas_vinculadas',t.pessoas_vinculadas,
    'pessoas_nao_vinculadas',t.pessoas_nao_vinculadas,'pessoas_abriram',t.pessoas_abriram,
    'pessoas_clicaram',t.pessoas_clicaram,'pessoas_confirmaram',t.pessoas_confirmaram,
    'confirmados_no_publico',t.confirmados_no_publico,'confirmados_fora_publico',t.confirmados_fora_publico,
    'lideres_concluiram',l.lideres_concluiram,'lideres_abriram',l.lideres_abriram,
    'timeline',tl.dados,'updated_at',now()
  ) INTO v_result FROM totals t CROSS JOIN leader_totals l CROSS JOIN timeline tl;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.engagement_mission_activity_period(uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_mission_activity_period(uuid,uuid,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
