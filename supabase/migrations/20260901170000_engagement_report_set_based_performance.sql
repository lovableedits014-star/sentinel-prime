-- Otimiza o relatorio por missao/equipe. A versao anterior executava buscas
-- laterais de check-in para cada obrigacao e estourava statement_timeout.

CREATE INDEX IF NOT EXISTS idx_mission_checkins_client_mission_pessoa
  ON public.mission_checkins(client_id,mission_id,pessoa_id);
CREATE INDEX IF NOT EXISTS idx_mission_checkins_client_mission_funcionario
  ON public.mission_checkins(client_id,mission_id,funcionario_id);
CREATE INDEX IF NOT EXISTS idx_engagement_obrigacoes_client_mission_ref
  ON public.engagement_obrigacoes(client_id,mission_id,origem,ref_id);

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
  RETURN QUERY WITH RECURSIVE team AS MATERIALIZED (
    SELECT p.id,public.mission_phone_key(p.telefone) phone_key
    FROM eleicao_pessoas p WHERE p.id=p_root_id AND p.client_id=p_client_id
    UNION ALL
    SELECT p.id,public.mission_phone_key(p.telefone)
    FROM eleicao_pessoas p JOIN team t ON p.parent_id=t.id
    WHERE p.client_id=p_client_id
  ), miss AS MATERIALIZED (
    SELECT m.id,m.title,m.platform,coalesce(m.publicado_em,m.created_at) pub_em,
      m.audience_id,m.audience_snapshotted_at
    FROM portal_missions m
    WHERE m.client_id=p_client_id AND m.archived_at IS NULL
      AND (p_mission_id IS NULL OR m.id=p_mission_id)
      AND (p_audience_id IS NULL OR m.audience_id IS NULL OR m.audience_id=p_audience_id)
      AND coalesce(m.publicado_em,m.created_at) BETWEEN v_ini AND v_fim
  ), canonical_phones AS MATERIALIZED (
    SELECT DISTINCT o.mission_id,public.mission_phone_key(o.telefone) phone_key
    FROM engagement_obrigacoes o
    WHERE o.client_id=p_client_id AND o.mission_id IN(SELECT x.id FROM miss x)
      AND o.status<>'dispensada' AND o.origem IN('eleicao','eleicao_pessoas')
      AND public.mission_phone_key(o.telefone) IS NOT NULL
  ), frozen AS MATERIALIZED (
    SELECT m.id mission_id,o.ref_id pessoa_id,o.origem,o.nome,o.telefone,o.cargo,o.regiao,o.cidade,
      o.status obrig_status,o.evidencia_nivel,o.evidencia_validada,o.cumprida_em,
      (o.cargo='voluntario') voluntario,
      coalesce(coalesce(ep.valor_contratacao,0)>0,o.cargo IN('contratado','funcionario'),false) contrato
    FROM miss m JOIN engagement_obrigacoes o ON o.mission_id=m.id AND o.client_id=p_client_id
    LEFT JOIN eleicao_pessoas ep ON o.origem IN('eleicao','eleicao_pessoas') AND ep.id=o.ref_id
    LEFT JOIN canonical_phones cp ON cp.mission_id=o.mission_id
      AND cp.phone_key=public.mission_phone_key(o.telefone)
    WHERE m.audience_snapshotted_at IS NOT NULL AND o.status<>'dispensada'
      AND (o.origem IN('eleicao','eleicao_pessoas') OR cp.phone_key IS NULL)
  ), legacy AS MATERIALIZED (
    SELECT c.mission_id,coalesce(c.pessoa_id,c.funcionario_id,c.participant_id) pessoa_id,
      CASE WHEN c.pessoa_id IS NOT NULL THEN 'eleicao' WHEN c.funcionario_id IS NOT NULL THEN 'funcionario' ELSE 'participant' END origem,
      coalesce(ep.nome,fu.nome,mp.nome,'Participante') nome,coalesce(ep.telefone,fu.telefone,mp.phone_e164) telefone,
      coalesce(CASE WHEN ep.is_voluntario THEN 'voluntario' ELSE ep.tipo::text END,
        CASE WHEN fu.id IS NOT NULL THEN 'funcionario' END,mp.cargo_snapshot) cargo,
      coalesce(ep.regiao::text,ep.cidade,fu.cidade,mp.regiao_snapshot) regiao,
      coalesce(ep.cidade,fu.cidade) cidade,
      CASE WHEN c.concluido_em IS NOT NULL THEN 'cumprida' ELSE 'pendente' END obrig_status,
      'E2'::text evidencia_nivel,false evidencia_validada,c.concluido_em cumprida_em,
      coalesce(ep.is_voluntario,false) voluntario,
      coalesce(coalesce(ep.valor_contratacao,0)>0,fu.id IS NOT NULL,false) contrato
    FROM miss m JOIN mission_checkins c ON c.mission_id=m.id AND c.client_id=p_client_id
    JOIN mission_participants mp ON mp.id=c.participant_id
    LEFT JOIN eleicao_pessoas ep ON ep.id=c.pessoa_id
    LEFT JOIN funcionarios fu ON fu.id=c.funcionario_id
    WHERE m.audience_snapshotted_at IS NULL
  ), base AS MATERIALIZED (
    SELECT m.id,m.title,m.platform,m.pub_em,r.pessoa_id,r.origem,r.nome,r.telefone,r.cargo,
      r.regiao,r.cidade,r.obrig_status,r.evidencia_nivel,r.evidencia_validada,
      r.cumprida_em,r.voluntario,r.contrato
    FROM miss m JOIN (SELECT * FROM frozen UNION ALL SELECT * FROM legacy) r ON r.mission_id=m.id
    WHERE p_root_id IS NULL
      OR r.pessoa_id IN(SELECT t.id FROM team t)
      OR (public.mission_phone_key(r.telefone) IS NOT NULL AND public.mission_phone_key(r.telefone) IN(
        SELECT t.phone_key FROM team t WHERE t.phone_key IS NOT NULL
      ))
  ), participant_click AS MATERIALIZED (
    SELECT e.mission_id,e.participant_id,true clicou
    FROM mission_events e
    WHERE e.client_id=p_client_id AND e.mission_id IN(SELECT x.id FROM miss x)
      AND NOT coalesce(e.is_bot,false) AND e.event_type::text LIKE 'click_%'
    GROUP BY e.mission_id,e.participant_id
  ), checkin_rows AS MATERIALIZED (
    SELECT c.mission_id,c.pessoa_id,c.funcionario_id,
      public.mission_phone_key(mp.phone_e164) phone_key,
      c.primeiro_acesso_em,c.concluido_em,coalesce(pc.clicou,false) clicou
    FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
    LEFT JOIN participant_click pc ON pc.mission_id=c.mission_id AND pc.participant_id=c.participant_id
    WHERE c.client_id=p_client_id AND c.mission_id IN(SELECT x.id FROM miss x)
  ), checkin_person AS MATERIALIZED (
    SELECT c.mission_id,coalesce(c.pessoa_id,c.funcionario_id) pessoa_id,
      min(c.primeiro_acesso_em) primeiro,max(c.concluido_em) concluido,bool_or(c.clicou) clicou
    FROM checkin_rows c WHERE coalesce(c.pessoa_id,c.funcionario_id) IS NOT NULL
    GROUP BY c.mission_id,coalesce(c.pessoa_id,c.funcionario_id)
  ), checkin_phone AS MATERIALIZED (
    SELECT c.mission_id,c.phone_key,min(c.primeiro_acesso_em) primeiro,
      max(c.concluido_em) concluido,bool_or(c.clicou) clicou
    FROM checkin_rows c WHERE c.phone_key IS NOT NULL GROUP BY c.mission_id,c.phone_key
  ), paired AS (
    SELECT b.*,
      coalesce(cp.primeiro,cf.primeiro) primeiro,
      coalesce(cp.concluido,cf.concluido) concluido,
      coalesce(cp.clicou,false) OR coalesce(cf.clicou,false) clicou
    FROM base b
    LEFT JOIN checkin_person cp ON cp.mission_id=b.id AND cp.pessoa_id=b.pessoa_id
    LEFT JOIN checkin_phone cf ON cf.mission_id=b.id
      AND cf.phone_key=public.mission_phone_key(b.telefone)
  )
  SELECT p.id,p.title,p.platform,p.pub_em,p.pessoa_id,p.origem,p.nome,p.telefone,p.cargo,p.regiao,p.cidade,
    p.voluntario,p.contrato,
    CASE WHEN p.concluido IS NOT NULL OR p.obrig_status='cumprida' THEN 'cumpriu'
      WHEN p.primeiro IS NOT NULL OR p.clicou THEN 'abriu' ELSE 'nao_abriu' END,
    CASE WHEN p.evidencia_nivel='E1' AND p.evidencia_validada THEN 'E1'
      WHEN p.evidencia_nivel='E3' AND p.evidencia_validada THEN 'E3'
      WHEN p.concluido IS NOT NULL OR p.obrig_status='cumprida' THEN 'E2' END,
    coalesce(p.concluido,p.cumprida_em),p.primeiro
  FROM paired p;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.engagement_pub_facts_v2(uuid,integer,uuid,integer,uuid,uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
