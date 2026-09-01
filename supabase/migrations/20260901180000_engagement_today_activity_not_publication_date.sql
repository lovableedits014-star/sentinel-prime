-- "Hoje" significa atividade ocorrida hoje, nao publicacao criada hoje.
-- Mantem a missao rastreada mais recente na operacao e inclui qualquer outra
-- missao que tenha recebido evento, acesso ou conclusao durante o dia.

CREATE OR REPLACE FUNCTION public.engagement_daily_missions(
  p_client_id uuid,
  p_dia date DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date
)
RETURNS TABLE(
  mission_id uuid,titulo text,plataforma text,publicado_em timestamptz,
  publico_congelado integer,publico_valido integer,concluiram integer,
  abriram_sem_concluir integer,nao_abriram integer,dispensados integer,taxa numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_ini timestamptz:=(p_dia::timestamp AT TIME ZONE 'America/Cuiaba');
  v_fim timestamptz:=((p_dia+1)::timestamp AT TIME ZONE 'America/Cuiaba');
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY WITH operational AS MATERIALIZED (
    SELECT m.id FROM portal_missions m
    WHERE m.id=(
      SELECT x.id FROM portal_missions x
      WHERE x.client_id=p_client_id AND x.archived_at IS NULL
        AND coalesce(x.is_active,true)
        AND (coalesce(x.tracking_enabled,false) OR coalesce(x.monitorada,false))
        AND coalesce(x.publicado_em,x.created_at)<v_fim
      ORDER BY coalesce(x.publicado_em,x.created_at) DESC,x.id DESC LIMIT 1
    )
    UNION
    SELECT e.mission_id FROM mission_events e
      WHERE e.client_id=p_client_id AND e.created_at>=v_ini AND e.created_at<v_fim
        AND NOT coalesce(e.is_bot,false)
    UNION
    SELECT c.mission_id FROM mission_checkins c
      WHERE c.client_id=p_client_id AND (
        (c.primeiro_acesso_em>=v_ini AND c.primeiro_acesso_em<v_fim)
        OR (c.ultimo_acesso_em>=v_ini AND c.ultimo_acesso_em<v_fim)
        OR (c.concluido_em>=v_ini AND c.concluido_em<v_fim)
      )
  ), fatos AS MATERIALIZED (
    SELECT o.mission_id,o.status,
      (
        (o.cumprida_em>=v_ini AND o.cumprida_em<v_fim)
        OR EXISTS(
          SELECT 1 FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
          WHERE c.client_id=p_client_id AND c.mission_id=o.mission_id
            AND c.concluido_em>=v_ini AND c.concluido_em<v_fim AND (
              c.pessoa_id=o.ref_id OR mp.pessoa_id=o.ref_id OR
              public.mission_phone_key(mp.phone_e164)=public.mission_phone_key(o.telefone)
            )
        )
      ) concluiu_hoje,
      EXISTS(
        SELECT 1 FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
        WHERE c.client_id=p_client_id AND c.mission_id=o.mission_id
          AND (
            (c.primeiro_acesso_em>=v_ini AND c.primeiro_acesso_em<v_fim)
            OR (c.ultimo_acesso_em>=v_ini AND c.ultimo_acesso_em<v_fim)
          ) AND (
            c.pessoa_id=o.ref_id OR mp.pessoa_id=o.ref_id OR
            public.mission_phone_key(mp.phone_e164)=public.mission_phone_key(o.telefone)
          )
      ) acessou_hoje
    FROM engagement_obrigacoes o
    JOIN eleicao_pessoas ep ON ep.id=o.ref_id AND ep.client_id=o.client_id
      AND o.origem IN('eleicao','eleicao_pessoas') AND ep.tipo::text='lider'
    WHERE o.client_id=p_client_id AND o.mission_id IN(SELECT x.id FROM operational x)
  ), ob AS (
    SELECT f.mission_id,
      count(*) FILTER(WHERE f.status<>'dispensada')::int validos,
      count(*) FILTER(WHERE f.status<>'dispensada' AND f.concluiu_hoje)::int feitos,
      count(*) FILTER(WHERE f.status<>'dispensada' AND f.acessou_hoje AND NOT f.concluiu_hoje)::int abriu,
      count(*) FILTER(WHERE f.status='dispensada')::int disp
    FROM fatos f GROUP BY f.mission_id
  )
  SELECT m.id,coalesce(m.title,m.post_url,'Missao'),m.platform,coalesce(m.publicado_em,m.created_at),
    coalesce(m.eligible_count,o.validos,0),coalesce(o.validos,0),coalesce(o.feitos,0),
    coalesce(o.abriu,0),greatest(coalesce(o.validos,0)-coalesce(o.feitos,0)-coalesce(o.abriu,0),0),
    coalesce(o.disp,0),
    CASE WHEN coalesce(o.validos,0)>0 THEN round(100.0*coalesce(o.feitos,0)/o.validos,1) ELSE 0 END
  FROM operational x JOIN portal_missions m ON m.id=x.id LEFT JOIN ob o ON o.mission_id=m.id
  WHERE m.client_id=p_client_id AND m.archived_at IS NULL
  ORDER BY coalesce(m.publicado_em,m.created_at) DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_daily_reach(
  p_client_id uuid,
  p_dia date DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date
)
RETURNS TABLE(mission_id uuid,eventos bigint,pessoas_identificadas bigint,grupos_alcancados bigint,
  aberturas bigint,cliques bigint,confirmacoes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_ini timestamptz:=(p_dia::timestamp AT TIME ZONE 'America/Cuiaba');
  v_fim timestamptz:=((p_dia+1)::timestamp AT TIME ZONE 'America/Cuiaba');
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  SELECT e.mission_id,count(e.id),
    count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL),
    count(DISTINCT e.distribution_id) FILTER(WHERE e.distribution_id IS NOT NULL),
    count(e.id) FILTER(WHERE e.event_type::text='open'),
    count(e.id) FILTER(WHERE e.event_type::text LIKE 'click_%'),
    count(DISTINCT e.participant_id) FILTER(
      WHERE e.event_type::text='declared_done' AND e.participant_id IS NOT NULL
    )
  FROM mission_events e
  WHERE e.client_id=p_client_id AND e.created_at>=v_ini AND e.created_at<v_fim
    AND NOT coalesce(e.is_bot,false)
  GROUP BY e.mission_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_campaign_team(p_client_id uuid,p_dias integer DEFAULT 30)
RETURNS TABLE(pessoa_id uuid,nome text,telefone text,cargo text,regiao text,coordenador_id uuid,
  coordenador_nome text,coordenador_telefone text,contratado boolean,voluntario boolean,missoes integer,
  concluidas integer,pendentes integer,taxa numeric,ultima_atividade timestamptz,status_hoje text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_dia date:=(now() AT TIME ZONE 'America/Cuiaba')::date;
  v_ini timestamptz:=(v_dia::timestamp AT TIME ZONE 'America/Cuiaba');
  v_fim timestamptz:=((v_dia+1)::timestamp AT TIME ZONE 'America/Cuiaba');
  v_mission uuid;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT m.id INTO v_mission FROM portal_missions m
  WHERE m.client_id=p_client_id AND m.archived_at IS NULL AND coalesce(m.is_active,true)
    AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))
    AND coalesce(m.publicado_em,m.created_at)<v_fim
  ORDER BY coalesce(m.publicado_em,m.created_at) DESC,m.id DESC LIMIT 1;

  RETURN QUERY WITH RECURSIVE pessoas AS MATERIALIZED (
    SELECT e.* FROM eleicao_pessoas e WHERE e.client_id=p_client_id AND e.arquivado_em IS NULL
      AND ((NOT e.is_voluntario AND coalesce(e.valor_contratacao,0)>0) OR e.is_voluntario OR e.tipo::text='lider')
  ), anc AS (
    SELECT p.id pessoa_id,p.id ancestral,p.parent_id,p.nome,p.telefone,0 nivel FROM pessoas p
    UNION ALL SELECT a.pessoa_id,e.id,e.parent_id,e.nome,e.telefone,a.nivel+1 FROM anc a
      JOIN eleicao_pessoas e ON e.id=a.parent_id AND e.client_id=p_client_id WHERE a.nivel<20
  ), raiz AS (
    SELECT DISTINCT ON(a.pessoa_id) a.pessoa_id,a.ancestral,a.nome,a.telefone
    FROM anc a ORDER BY a.pessoa_id,a.nivel DESC
  ), hist AS (
    SELECT o.ref_id,count(DISTINCT o.mission_id)::int total,
      count(DISTINCT o.mission_id) FILTER(WHERE o.status='cumprida')::int feitas,
      max(coalesce(o.cumprida_em,o.updated_at)) ultima,
      bool_or(o.mission_id=v_mission AND (
        (o.cumprida_em>=v_ini AND o.cumprida_em<v_fim)
        OR EXISTS(SELECT 1 FROM mission_checkins c WHERE c.client_id=p_client_id
          AND c.mission_id=o.mission_id AND c.pessoa_id=o.ref_id
          AND c.concluido_em>=v_ini AND c.concluido_em<v_fim)
      )) fez_hoje,
      bool_or(o.mission_id=v_mission AND o.status NOT IN('cumprida','dispensada')) falta_hoje
    FROM engagement_obrigacoes o
    WHERE o.client_id=p_client_id AND o.origem IN('eleicao','eleicao_pessoas')
      AND o.created_at>=now()-make_interval(days=>greatest(coalesce(p_dias,30),1))
    GROUP BY o.ref_id
  )
  SELECT p.id,p.nome,p.telefone,CASE WHEN p.is_voluntario THEN 'voluntario' ELSE p.tipo::text END,
    coalesce(nullif(p.regiao,''),p.bairro),r.ancestral,r.nome,r.telefone,
    NOT p.is_voluntario AND coalesce(p.valor_contratacao,0)>0,p.is_voluntario,
    coalesce(h.total,0),coalesce(h.feitas,0),greatest(coalesce(h.total,0)-coalesce(h.feitas,0),0),
    CASE WHEN coalesce(h.total,0)>0 THEN round(100.0*h.feitas/h.total,1) ELSE 0 END,h.ultima,
    CASE WHEN h.fez_hoje THEN 'concluiu' WHEN h.falta_hoje THEN 'pendente' ELSE 'sem_missao' END
  FROM pessoas p LEFT JOIN raiz r ON r.pessoa_id=p.id LEFT JOIN hist h ON h.ref_id=p.id
  ORDER BY CASE WHEN h.falta_hoje THEN 0 WHEN NOT h.fez_hoje THEN 1 ELSE 2 END,r.nome,p.nome;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.engagement_daily_missions(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_daily_reach(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_campaign_team(uuid,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
