-- Relatorios de engajamento: uma pessoa por missao, auditoria do publico congelado
-- e eliminacao das subconsultas por pessoa que causavam timeout.

CREATE OR REPLACE FUNCTION public.engagement_pub_facts_v2(
  p_client_id uuid,p_dias integer DEFAULT 30,p_audience_id uuid DEFAULT NULL,
  p_offset_dias integer DEFAULT 0,p_root_id uuid DEFAULT NULL,p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(mission_id uuid,titulo text,plataforma text,publicado_em timestamptz,
  pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,
  is_voluntario boolean,tem_contrato boolean,status text,prova text,cumprido_em timestamptz,primeiro_acesso_em timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_ini timestamptz:=now()-make_interval(days=>coalesce(p_dias,30)+coalesce(p_offset_dias,0));
  v_fim timestamptz:=now()-make_interval(days=>coalesce(p_offset_dias,0));
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY WITH RECURSIVE team AS (
    SELECT p.id FROM eleicao_pessoas p WHERE p.id=p_root_id AND p.client_id=p_client_id
    UNION ALL SELECT p.id FROM eleicao_pessoas p JOIN team t ON p.parent_id=t.id WHERE p.client_id=p_client_id
  ), miss AS (
    SELECT m.id,m.title,m.platform,coalesce(m.publicado_em,m.created_at) pub_em,m.audience_id,m.audience_snapshotted_at
    FROM portal_missions m WHERE m.client_id=p_client_id AND m.archived_at IS NULL
      AND (p_mission_id IS NULL OR m.id=p_mission_id)
      AND (p_audience_id IS NULL OR m.audience_id IS NULL OR m.audience_id=p_audience_id)
      AND coalesce(m.publicado_em,m.created_at) BETWEEN v_ini AND v_fim
  ), frozen_raw AS (
    SELECT m.id mission_id,o.ref_id pessoa_id,o.origem,o.nome,o.telefone,o.cargo,o.regiao,o.cidade,
      o.status obrig_status,o.evidencia_nivel,o.evidencia_validada,o.cumprida_em,
      coalesce(public.normalize_br_phone(o.telefone),'id:'||o.origem||':'||o.ref_id::text) identidade,
      (o.cargo='voluntario') voluntario,
      coalesce((SELECT coalesce(ep.valor_contratacao,0)>0 FROM eleicao_pessoas ep
        WHERE o.origem IN('eleicao','eleicao_pessoas') AND ep.id=o.ref_id),o.cargo IN('contratado','funcionario')) contrato
    FROM miss m JOIN engagement_obrigacoes o ON o.mission_id=m.id AND o.client_id=p_client_id
    WHERE m.audience_snapshotted_at IS NOT NULL AND o.status<>'dispensada'
  ), frozen AS (
    SELECT DISTINCT ON (f.mission_id,f.identidade) f.* FROM frozen_raw f
    ORDER BY f.mission_id,f.identidade,(f.obrig_status='cumprida') DESC,f.cumprida_em DESC NULLS LAST,f.pessoa_id
  ), legacy AS (
    SELECT DISTINCT ON(c.mission_id,coalesce(public.normalize_br_phone(mp.phone_e164),'id:'||c.participant_id::text))
      c.mission_id,coalesce(c.pessoa_id,c.funcionario_id,c.participant_id),
      CASE WHEN c.pessoa_id IS NOT NULL THEN 'eleicao' WHEN c.funcionario_id IS NOT NULL THEN 'funcionario' ELSE 'participant' END,
      coalesce(ep.nome,fu.nome,mp.nome,'Participante'),coalesce(ep.telefone,fu.telefone,mp.phone_e164),
      coalesce(CASE WHEN ep.is_voluntario THEN 'voluntario' ELSE ep.tipo::text END,CASE WHEN fu.id IS NOT NULL THEN 'funcionario' END,mp.cargo_snapshot),
      coalesce(ep.regiao::text,ep.cidade,fu.cidade,mp.regiao_snapshot),coalesce(ep.cidade,fu.cidade),
      CASE WHEN c.concluido_em IS NOT NULL THEN 'cumprida' ELSE 'pendente' END,'E2',false,c.concluido_em,
      coalesce(public.normalize_br_phone(mp.phone_e164),'id:'||c.participant_id::text),coalesce(ep.is_voluntario,false),
      coalesce(coalesce(ep.valor_contratacao,0)>0,fu.id IS NOT NULL,false)
    FROM miss m JOIN mission_checkins c ON c.mission_id=m.id AND c.client_id=p_client_id
    JOIN mission_participants mp ON mp.id=c.participant_id LEFT JOIN eleicao_pessoas ep ON ep.id=c.pessoa_id
    LEFT JOIN funcionarios fu ON fu.id=c.funcionario_id WHERE m.audience_snapshotted_at IS NULL
    ORDER BY c.mission_id,coalesce(public.normalize_br_phone(mp.phone_e164),'id:'||c.participant_id::text),c.concluido_em DESC NULLS LAST
  ), base AS (
    SELECT m.*,r.pessoa_id,r.origem,r.nome,r.telefone,r.cargo,r.regiao,r.cidade,r.obrig_status,
      r.evidencia_nivel,r.evidencia_validada,r.cumprida_em,r.identidade,r.voluntario,r.contrato
    FROM miss m JOIN (SELECT * FROM frozen UNION ALL SELECT * FROM legacy) r ON r.mission_id=m.id
    WHERE p_root_id IS NULL OR (r.origem IN('eleicao','eleicao_pessoas') AND r.pessoa_id IN(SELECT id FROM team))
  ), ck AS (
    SELECT c.mission_id,coalesce(public.normalize_br_phone(mp.phone_e164),'id:'||c.participant_id::text) identidade,
      min(c.primeiro_acesso_em) primeiro,max(c.concluido_em) concluido,bool_or(coalesce(x.clicou,false)) clicou
    FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
    LEFT JOIN (SELECT e.mission_id,e.participant_id,true clicou FROM mission_events e
      WHERE e.client_id=p_client_id AND NOT coalesce(e.is_bot,false) AND e.event_type::text LIKE 'click_%'
      GROUP BY e.mission_id,e.participant_id) x ON x.mission_id=c.mission_id AND x.participant_id=c.participant_id
    WHERE c.client_id=p_client_id AND c.mission_id IN(SELECT id FROM miss) GROUP BY c.mission_id,2
  )
  SELECT b.id,b.title,b.platform,b.pub_em,b.pessoa_id,b.origem,b.nome,b.telefone,b.cargo,b.regiao,b.cidade,
    b.voluntario,b.contrato,
    CASE WHEN c.concluido IS NOT NULL OR b.obrig_status='cumprida' THEN 'cumpriu'
      WHEN c.primeiro IS NOT NULL OR c.clicou THEN 'abriu' ELSE 'nao_abriu' END,
    CASE WHEN b.evidencia_nivel='E1' AND b.evidencia_validada THEN 'E1'
      WHEN b.evidencia_nivel='E3' AND b.evidencia_validada THEN 'E3'
      WHEN c.concluido IS NOT NULL OR b.obrig_status='cumprida' THEN 'E2' END,
    coalesce(c.concluido,b.cumprida_em),c.primeiro FROM base b LEFT JOIN ck c ON c.mission_id=b.id AND c.identidade=b.identidade;
END $$;

CREATE OR REPLACE FUNCTION public.engagement_publicacoes_audit(
  p_client_id uuid,p_dias integer DEFAULT 30,p_audience_id uuid DEFAULT NULL,p_root_id uuid DEFAULT NULL,p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(mission_id uuid,publico_congelado integer,registros_ativos integer,pessoas_unicas integer,dispensados integer,duplicados integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY WITH RECURSIVE team AS (
    SELECT e.id FROM eleicao_pessoas e WHERE e.client_id=p_client_id AND e.id=p_root_id
    UNION ALL SELECT e.id FROM eleicao_pessoas e JOIN team t ON e.parent_id=t.id WHERE e.client_id=p_client_id
  )
  SELECT m.id,(CASE WHEN p_root_id IS NULL THEN coalesce(m.eligible_count,count(o.id) FILTER(WHERE o.status<>'dispensada'))
    ELSE count(o.id) FILTER(WHERE o.status<>'dispensada') END)::int,
    count(o.id) FILTER(WHERE o.status<>'dispensada')::int,
    count(DISTINCT coalesce(public.normalize_br_phone(o.telefone),'id:'||o.origem||':'||o.ref_id::text)) FILTER(WHERE o.status<>'dispensada')::int,
    count(o.id) FILTER(WHERE o.status='dispensada')::int,
    greatest(0,count(o.id) FILTER(WHERE o.status<>'dispensada')-count(DISTINCT coalesce(public.normalize_br_phone(o.telefone),'id:'||o.origem||':'||o.ref_id::text)) FILTER(WHERE o.status<>'dispensada'))::int
  FROM portal_missions m LEFT JOIN engagement_obrigacoes o ON o.mission_id=m.id AND o.client_id=p_client_id
    AND (p_root_id IS NULL OR (o.origem IN('eleicao','eleicao_pessoas') AND o.ref_id IN(SELECT id FROM team)))
  WHERE m.client_id=p_client_id AND m.archived_at IS NULL AND (p_mission_id IS NULL OR m.id=p_mission_id)
    AND (p_audience_id IS NULL OR m.audience_id IS NULL OR m.audience_id=p_audience_id)
    AND coalesce(m.publicado_em,m.created_at)>=now()-make_interval(days=>coalesce(p_dias,30))
  GROUP BY m.id,m.eligible_count;
END $$;

CREATE OR REPLACE FUNCTION public.engagement_cobranca_overview(p_client_id uuid,p_days integer DEFAULT 30)
RETURNS TABLE(ref_id uuid,origem text,cargo text,nome text,telefone text,regiao text,cidade text,
  instagram_handle text,facebook_key text,interacoes bigint,instagram_comments bigint,facebook_comments bigint,
  missoes_abertas bigint,missoes_concluidas bigint,last_interaction timestamptz,dias_sem_interagir integer,
  min_interacoes integer,min_missoes integer,situacao text,missoes_disponiveis bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_since timestamptz:=now()-make_interval(days=>greatest(coalesce(p_days,30),1)); v_total bigint;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT count(*) INTO v_total FROM portal_missions m WHERE m.client_id=p_client_id AND m.archived_at IS NULL AND coalesce(m.is_active,true);
  RETURN QUERY WITH ent AS (SELECT * FROM engagement_entidades_leves(p_client_id)),
  cm AS (SELECT lower(c.platform_user_id) chave,c.platform,count(*) qtd,max(c.created_at) ultima FROM comments c
    WHERE c.client_id=p_client_id AND NOT c.is_page_owner AND c.created_at>=v_since GROUP BY 1,2),
  ac AS (SELECT a.supporter_id,count(*) qtd,max(a.created_at) ultima FROM engagement_actions a
    WHERE a.client_id=p_client_id AND a.action_type<>'comment' AND a.created_at>=v_since GROUP BY a.supporter_id),
  ev AS (SELECT public.normalize_br_phone(mp.phone_e164) phone,count(DISTINCT c.mission_id) abertas,
    count(DISTINCT c.mission_id) FILTER(WHERE c.concluido_em IS NOT NULL) concluidas,max(c.ultimo_acesso_em) ultima
    FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id WHERE c.client_id=p_client_id AND c.ultimo_acesso_em>=v_since GROUP BY 1),
  base AS (SELECT e.*,coalesce(ig.qtd,0)::bigint iq,coalesce(fb.qtd,0)::bigint fq,coalesce(ac.qtd,0)::bigint aq,coalesce(ev.abertas,0)::bigint abertas,
    coalesce(ev.concluidas,0)::bigint concluidas,greatest(ig.ultima,fb.ultima,ac.ultima,ev.ultima) ultima,
    coalesce(mt.min_interacoes,0) mi,coalesce(mt.min_missoes,0) mm FROM ent e
    LEFT JOIN cm ig ON ig.platform='instagram' AND ig.chave=lower(e.instagram_handle)
    LEFT JOIN cm fb ON coalesce(fb.platform,'facebook')='facebook' AND fb.chave=lower(e.facebook_key)
    LEFT JOIN ac ON ac.supporter_id=e.supporter_id LEFT JOIN ev ON ev.phone=public.normalize_br_phone(e.telefone)
    LEFT JOIN engagement_metas mt ON mt.client_id=p_client_id AND mt.cargo=e.cargo)
  SELECT b.ref_id,b.origem,b.cargo,b.nome,b.telefone,b.regiao,b.cidade,b.instagram_handle,b.facebook_key,
    b.iq+b.fq+b.aq,b.iq,b.fq,b.abertas,b.concluidas,b.ultima,
    CASE WHEN b.ultima IS NULL THEN NULL ELSE greatest(0,extract(epoch FROM(now()-b.ultima))/86400)::int END,b.mi,b.mm,
    CASE WHEN coalesce(b.instagram_handle,'')='' AND coalesce(b.facebook_key,'')='' THEN 'sem_cadastro'
      WHEN b.iq+b.fq+b.aq=0 AND b.concluidas=0 THEN 'zerado' WHEN b.iq+b.fq+b.aq>=b.mi AND b.concluidas>=b.mm THEN 'em_dia' ELSE 'abaixo' END,v_total
  FROM base b WHERE b.mi>0 OR b.mm>0 ORDER BY b.cargo,coalesce(b.regiao,b.cidade,'zzz'),b.nome;
END $$;

GRANT EXECUTE ON FUNCTION engagement_pub_facts_v2(uuid,integer,uuid,integer,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION engagement_publicacoes_audit(uuid,integer,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION engagement_cobranca_overview(uuid,integer) TO authenticated;
CREATE INDEX IF NOT EXISTS idx_engagement_obrigacoes_mission_status ON engagement_obrigacoes(mission_id,status);
CREATE INDEX IF NOT EXISTS idx_mission_events_client_mission_participant ON mission_events(client_id,mission_id,participant_id) WHERE is_bot=false;
