-- Corrige os dois vazios observados nos relatorios de engajamento:
-- 1. "Hoje" deve usar o dia civil de Cuiaba, nao o timezone da sessao SQL;
-- 2. o filtro de equipe deve reconhecer a mesma pessoa tambem pelo telefone,
--    pois a fotografia pode ter origem em eleicao_pessoas ou contratados.

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
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY WITH fatos AS (
    SELECT o.mission_id,o.status,
      (o.status='cumprida' OR EXISTS(
        SELECT 1 FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
        WHERE c.client_id=p_client_id AND c.mission_id=o.mission_id AND c.concluido_em IS NOT NULL AND (
          c.pessoa_id=o.ref_id OR mp.pessoa_id=o.ref_id OR
          public.mission_phone_key(mp.phone_e164)=public.mission_phone_key(o.telefone)
        )
      )) concluiu,
      EXISTS(
        SELECT 1 FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
        WHERE c.client_id=p_client_id AND c.mission_id=o.mission_id AND (
          c.pessoa_id=o.ref_id OR mp.pessoa_id=o.ref_id OR
          public.mission_phone_key(mp.phone_e164)=public.mission_phone_key(o.telefone)
        )
      ) acessou
    FROM engagement_obrigacoes o WHERE o.client_id=p_client_id
  ), ob AS (
    SELECT f.mission_id,
      count(*) FILTER(WHERE f.status<>'dispensada')::int validos,
      count(*) FILTER(WHERE f.status<>'dispensada' AND f.concluiu)::int feitos,
      count(*) FILTER(WHERE f.status<>'dispensada' AND f.acessou AND NOT f.concluiu)::int abriu,
      count(*) FILTER(WHERE f.status='dispensada')::int disp
    FROM fatos f GROUP BY f.mission_id
  )
  SELECT m.id,coalesce(m.title,m.post_url,'Missao'),m.platform,coalesce(m.publicado_em,m.created_at),
    coalesce(m.eligible_count,o.validos,0),coalesce(o.validos,0),coalesce(o.feitos,0),
    coalesce(o.abriu,0),greatest(coalesce(o.validos,0)-coalesce(o.feitos,0)-coalesce(o.abriu,0),0),
    coalesce(o.disp,0),
    CASE WHEN coalesce(o.validos,0)>0 THEN round(100.0*coalesce(o.feitos,0)/o.validos,1) ELSE 0 END
  FROM portal_missions m LEFT JOIN ob o ON o.mission_id=m.id
  WHERE m.client_id=p_client_id AND m.archived_at IS NULL
    AND (coalesce(m.publicado_em,m.created_at) AT TIME ZONE 'America/Cuiaba')::date=p_dia
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
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  SELECT m.id,count(e.id),count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL),
    count(DISTINCT e.distribution_id) FILTER(WHERE e.distribution_id IS NOT NULL),
    count(e.id) FILTER(WHERE e.event_type::text='open'),
    count(e.id) FILTER(WHERE e.event_type::text LIKE 'click_%'),
    count(DISTINCT e.participant_id) FILTER(
      WHERE e.event_type::text='declared_done' AND e.participant_id IS NOT NULL
    )
  FROM portal_missions m
  LEFT JOIN mission_events e ON e.mission_id=m.id AND e.client_id=p_client_id AND NOT coalesce(e.is_bot,false)
  WHERE m.client_id=p_client_id AND m.archived_at IS NULL
    AND (coalesce(m.publicado_em,m.created_at) AT TIME ZONE 'America/Cuiaba')::date=p_dia
  GROUP BY m.id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_pub_facts_v2(
  p_client_id uuid,p_dias integer DEFAULT 30,p_audience_id uuid DEFAULT NULL,
  p_offset_dias integer DEFAULT 0,p_root_id uuid DEFAULT NULL,p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(
  mission_id uuid,titulo text,plataforma text,publicado_em timestamptz,
  pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,
  is_voluntario boolean,tem_contrato boolean,status text,prova text,
  cumprido_em timestamptz,primeiro_acesso_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_ini timestamptz:=now()-make_interval(days=>coalesce(p_dias,30)+coalesce(p_offset_dias,0));
  v_fim timestamptz:=now()-make_interval(days=>coalesce(p_offset_dias,0));
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY WITH RECURSIVE team AS (
    SELECT p.id,public.mission_phone_key(p.telefone) phone_key
    FROM eleicao_pessoas p WHERE p.id=p_root_id AND p.client_id=p_client_id
    UNION ALL
    SELECT p.id,public.mission_phone_key(p.telefone)
    FROM eleicao_pessoas p JOIN team t ON p.parent_id=t.id
    WHERE p.client_id=p_client_id
  ), miss AS (
    SELECT m.id,m.title,m.platform,coalesce(m.publicado_em,m.created_at) pub_em,
      m.audience_id,m.audience_snapshotted_at
    FROM portal_missions m
    WHERE m.client_id=p_client_id AND m.archived_at IS NULL
      AND (p_mission_id IS NULL OR m.id=p_mission_id)
      AND (p_audience_id IS NULL OR m.audience_id IS NULL OR m.audience_id=p_audience_id)
      AND coalesce(m.publicado_em,m.created_at) BETWEEN v_ini AND v_fim
  ), frozen_raw AS (
    SELECT m.id mission_id,o.ref_id pessoa_id,o.origem,o.nome,o.telefone,o.cargo,o.regiao,o.cidade,
      o.status obrig_status,o.evidencia_nivel,o.evidencia_validada,o.cumprida_em,
      coalesce(public.normalize_br_phone(o.telefone),'id:'||o.origem||':'||o.ref_id::text) identidade,
      (o.cargo='voluntario') voluntario,
      coalesce((SELECT coalesce(ep.valor_contratacao,0)>0 FROM eleicao_pessoas ep
        WHERE o.origem IN('eleicao','eleicao_pessoas') AND ep.id=o.ref_id),
        o.cargo IN('contratado','funcionario')) contrato
    FROM miss m JOIN engagement_obrigacoes o ON o.mission_id=m.id AND o.client_id=p_client_id
    WHERE m.audience_snapshotted_at IS NOT NULL AND o.status<>'dispensada'
  ), frozen AS (
    SELECT DISTINCT ON(f.mission_id,f.identidade) f.* FROM frozen_raw f
    ORDER BY f.mission_id,f.identidade,(f.obrig_status='cumprida') DESC,
      f.cumprida_em DESC NULLS LAST,f.pessoa_id
  ), legacy AS (
    SELECT DISTINCT ON(c.mission_id,coalesce(public.normalize_br_phone(mp.phone_e164),'id:'||c.participant_id::text))
      c.mission_id,coalesce(c.pessoa_id,c.funcionario_id,c.participant_id),
      CASE WHEN c.pessoa_id IS NOT NULL THEN 'eleicao' WHEN c.funcionario_id IS NOT NULL THEN 'funcionario' ELSE 'participant' END,
      coalesce(ep.nome,fu.nome,mp.nome,'Participante'),coalesce(ep.telefone,fu.telefone,mp.phone_e164),
      coalesce(CASE WHEN ep.is_voluntario THEN 'voluntario' ELSE ep.tipo::text END,
        CASE WHEN fu.id IS NOT NULL THEN 'funcionario' END,mp.cargo_snapshot),
      coalesce(ep.regiao::text,ep.cidade,fu.cidade,mp.regiao_snapshot),coalesce(ep.cidade,fu.cidade),
      CASE WHEN c.concluido_em IS NOT NULL THEN 'cumprida' ELSE 'pendente' END,
      'E2',false,c.concluido_em,
      coalesce(public.normalize_br_phone(mp.phone_e164),'id:'||c.participant_id::text),
      coalesce(ep.is_voluntario,false),coalesce(coalesce(ep.valor_contratacao,0)>0,fu.id IS NOT NULL,false)
    FROM miss m JOIN mission_checkins c ON c.mission_id=m.id AND c.client_id=p_client_id
    JOIN mission_participants mp ON mp.id=c.participant_id
    LEFT JOIN eleicao_pessoas ep ON ep.id=c.pessoa_id
    LEFT JOIN funcionarios fu ON fu.id=c.funcionario_id
    WHERE m.audience_snapshotted_at IS NULL
    ORDER BY c.mission_id,coalesce(public.normalize_br_phone(mp.phone_e164),'id:'||c.participant_id::text),
      c.concluido_em DESC NULLS LAST
  ), base AS (
    SELECT m.*,r.pessoa_id,r.origem,r.nome,r.telefone,r.cargo,r.regiao,r.cidade,r.obrig_status,
      r.evidencia_nivel,r.evidencia_validada,r.cumprida_em,r.identidade,r.voluntario,r.contrato
    FROM miss m JOIN (SELECT * FROM frozen UNION ALL SELECT * FROM legacy) r ON r.mission_id=m.id
    WHERE p_root_id IS NULL
      OR r.pessoa_id IN(SELECT t.id FROM team t)
      OR (
        public.mission_phone_key(r.telefone) IS NOT NULL
        AND public.mission_phone_key(r.telefone) IN(
          SELECT t.phone_key FROM team t WHERE t.phone_key IS NOT NULL
        )
      )
  ), ck AS (
    SELECT c.mission_id,
      coalesce(public.normalize_br_phone(mp.phone_e164),'id:'||c.participant_id::text) identidade,
      min(c.primeiro_acesso_em) primeiro,max(c.concluido_em) concluido,
      bool_or(coalesce(x.clicou,false)) clicou
    FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
    LEFT JOIN (
      SELECT e.mission_id,e.participant_id,true clicou FROM mission_events e
      WHERE e.client_id=p_client_id AND NOT coalesce(e.is_bot,false)
        AND e.event_type::text LIKE 'click_%' GROUP BY e.mission_id,e.participant_id
    ) x ON x.mission_id=c.mission_id AND x.participant_id=c.participant_id
    WHERE c.client_id=p_client_id AND c.mission_id IN(SELECT id FROM miss)
    GROUP BY c.mission_id,2
  )
  SELECT b.id,b.title,b.platform,b.pub_em,b.pessoa_id,b.origem,b.nome,b.telefone,b.cargo,b.regiao,b.cidade,
    b.voluntario,b.contrato,
    CASE WHEN c.concluido IS NOT NULL OR b.obrig_status='cumprida' THEN 'cumpriu'
      WHEN c.primeiro IS NOT NULL OR c.clicou THEN 'abriu' ELSE 'nao_abriu' END,
    CASE WHEN b.evidencia_nivel='E1' AND b.evidencia_validada THEN 'E1'
      WHEN b.evidencia_nivel='E3' AND b.evidencia_validada THEN 'E3'
      WHEN c.concluido IS NOT NULL OR b.obrig_status='cumprida' THEN 'E2' END,
    coalesce(c.concluido,b.cumprida_em),c.primeiro
  FROM base b LEFT JOIN ck c ON c.mission_id=b.id AND c.identidade=b.identidade;
END;
$function$;

-- Regra temporal, sem inversao: so entra na fotografia quem ja existia no
-- banco quando a missao foi publicada. O created_at e a fonte adequada para
-- esta decisao; confirmado_em/contrato_aceito_em podem ser preenchidos depois.
CREATE OR REPLACE FUNCTION public.engagement_auto_snapshot_daily_mission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_vol boolean:=false; v_prazo integer:=24; v_total integer:=0; v_publicado timestamptz;
BEGIN
  IF NEW.archived_at IS NOT NULL OR NOT coalesce(NEW.is_active,true) THEN RETURN NEW; END IF;
  v_publicado:=coalesce(NEW.publicado_em,NEW.created_at,now());
  SELECT coalesce(c.incluir_voluntarios_missao,false),greatest(coalesce(c.prazo_missao_horas,24),1)
    INTO v_vol,v_prazo FROM engagement_config c WHERE c.client_id=NEW.client_id;

  INSERT INTO engagement_obrigacoes(client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,assigned_at,eligible_from,assignment_source,snapshot_version)
  SELECT NEW.client_id,NEW.id,'eleicao',x.id,x.nome,x.cargo,x.telefone,x.regiao,x.cidade,
    public.normalize_br_phone(x.telefone),'checkin',1,v_publicado+make_interval(hours=>v_prazo),
    1,now(),x.created_at,'daily_contract_auto',4
  FROM (
    SELECT DISTINCT ON(coalesce(public.normalize_br_phone(e.telefone),'id:'||e.id::text))
      e.id,e.nome,CASE WHEN e.is_voluntario THEN 'voluntario' ELSE e.tipo::text END cargo,
      e.telefone,coalesce(nullif(e.regiao,''),e.bairro) regiao,e.cidade,e.created_at
    FROM eleicao_pessoas e
    WHERE e.client_id=NEW.client_id AND e.arquivado_em IS NULL
      AND e.created_at<=v_publicado
      AND ((NOT e.is_voluntario AND coalesce(e.valor_contratacao,0)>0) OR (v_vol AND e.is_voluntario))
      AND (e.vigencia_inicio IS NULL OR e.vigencia_inicio<=(v_publicado AT TIME ZONE 'America/Cuiaba')::date)
      AND (e.vigencia_fim IS NULL OR e.vigencia_fim>=(v_publicado AT TIME ZONE 'America/Cuiaba')::date)
    ORDER BY coalesce(public.normalize_br_phone(e.telefone),'id:'||e.id::text),e.created_at,e.id
  ) x ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

  INSERT INTO engagement_obrigacoes(client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,assigned_at,eligible_from,assignment_source,snapshot_version)
  SELECT NEW.client_id,NEW.id,'contratados',c.id,c.nome,
    CASE WHEN coalesce(c.is_lider,false) THEN 'lider' ELSE 'contratado' END,c.telefone,c.bairro,c.cidade,
    public.normalize_br_phone(c.telefone),'checkin',1,v_publicado+make_interval(hours=>v_prazo),
    1,now(),c.created_at,'daily_contract_legacy_auto',4
  FROM contratados c
  WHERE c.client_id=NEW.client_id AND c.status='ativo' AND c.created_at<=v_publicado
    AND NOT EXISTS(
      SELECT 1 FROM engagement_obrigacoes o
      WHERE o.mission_id=NEW.id
        AND public.mission_phone_key(o.telefone)=public.mission_phone_key(c.telefone)
    )
  ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

  SELECT count(*)::int INTO v_total FROM engagement_obrigacoes o
    WHERE o.mission_id=NEW.id AND o.status<>'dispensada';
  UPDATE portal_missions SET monitorada=true,tracking_enabled=true,publicado_em=v_publicado,
    audience_snapshotted_at=coalesce(audience_snapshotted_at,now()),eligible_count=v_total
  WHERE id=NEW.id;
  RETURN NEW;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.engagement_daily_missions(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_daily_reach(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_pub_facts_v2(uuid,integer,uuid,integer,uuid,uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
