-- Restaura publicacoes e ranking legados que possuem check-in, mas nunca tiveram
-- uma fotografia de obrigacoes. O fallback e conservador: considera apenas quem
-- realmente participou, sem criar faltas retroativas para o publico atual.

CREATE OR REPLACE FUNCTION public.engagement_pub_facts_v2(
  p_client_id uuid,p_dias integer DEFAULT 30,p_audience_id uuid DEFAULT NULL,
  p_offset_dias integer DEFAULT 0,p_root_id uuid DEFAULT NULL,p_mission_id uuid DEFAULT NULL
) RETURNS TABLE(
  mission_id uuid,titulo text,plataforma text,publicado_em timestamptz,
  pessoa_id uuid,origem text,nome text,telefone text,cargo text,regiao text,cidade text,
  is_voluntario boolean,tem_contrato boolean,status text,prova text,
  cumprido_em timestamptz,primeiro_acesso_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO public AS $$
DECLARE
  v_ini timestamptz := now()-make_interval(days=>coalesce(p_dias,30)+coalesce(p_offset_dias,0));
  v_fim timestamptz := now()-make_interval(days=>coalesce(p_offset_dias,0));
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  WITH RECURSIVE team AS (
    SELECT p.id FROM eleicao_pessoas p WHERE p.id=p_root_id AND p.client_id=p_client_id
    UNION ALL SELECT p.id FROM eleicao_pessoas p JOIN team t ON p.parent_id=t.id WHERE p.client_id=p_client_id
  ), miss AS (
    SELECT m.id,m.title,m.platform,coalesce(m.publicado_em,m.created_at) pub_em,
      m.audience_id,m.audience_snapshotted_at
    FROM portal_missions m
    WHERE m.client_id=p_client_id AND m.archived_at IS NULL
      AND (p_mission_id IS NULL OR m.id=p_mission_id)
      AND (p_audience_id IS NULL OR m.audience_id IS NULL OR m.audience_id=p_audience_id)
      AND coalesce(m.publicado_em,m.created_at) BETWEEN v_ini AND v_fim
  ), frozen AS (
    SELECT m.id mission_id,o.ref_id pessoa_id,o.origem,o.nome,o.telefone,o.cargo,o.regiao,o.cidade,
      (o.cargo='voluntario') is_voluntario,
      coalesce((SELECT coalesce(ep.valor_contratacao,0)>0 FROM eleicao_pessoas ep
        WHERE o.origem='eleicao' AND ep.id=o.ref_id),o.cargo IN('contratado','funcionario')) tem_contrato
    FROM miss m JOIN engagement_obrigacoes o ON o.mission_id=m.id AND o.client_id=p_client_id
    WHERE m.audience_snapshotted_at IS NOT NULL AND o.status<>'dispensada'
  ), legacy AS (
    SELECT DISTINCT ON (c.mission_id,coalesce(c.pessoa_id,c.funcionario_id,c.participant_id))
      c.mission_id,coalesce(c.pessoa_id,c.funcionario_id,c.participant_id) pessoa_id,
      CASE WHEN c.pessoa_id IS NOT NULL THEN 'eleicao'
           WHEN c.funcionario_id IS NOT NULL THEN 'funcionario' ELSE 'participant' END origem,
      coalesce(ep.nome,fu.nome,mp.nome,'Participante') nome,
      coalesce(ep.telefone,fu.telefone,mp.phone_e164) telefone,
      coalesce(CASE WHEN ep.is_voluntario THEN 'voluntario' ELSE ep.tipo::text END,
        CASE WHEN fu.id IS NOT NULL THEN 'funcionario' END,mp.cargo_snapshot) cargo,
      coalesce(ep.regiao::text,ep.cidade,fu.cidade,mp.regiao_snapshot) regiao,
      coalesce(ep.cidade,fu.cidade) cidade,coalesce(ep.is_voluntario,false) is_voluntario,
      coalesce(coalesce(ep.valor_contratacao,0)>0,fu.id IS NOT NULL,false) tem_contrato
    FROM miss m JOIN mission_checkins c ON c.mission_id=m.id AND c.client_id=p_client_id
    LEFT JOIN eleicao_pessoas ep ON ep.id=c.pessoa_id
    LEFT JOIN funcionarios fu ON fu.id=c.funcionario_id
    LEFT JOIN mission_participants mp ON mp.id=c.participant_id
    WHERE m.audience_snapshotted_at IS NULL
      AND coalesce(c.pessoa_id,c.funcionario_id,c.participant_id) IS NOT NULL
    ORDER BY c.mission_id,coalesce(c.pessoa_id,c.funcionario_id,c.participant_id),c.primeiro_acesso_em
  ), base AS (
    SELECT m.*,r.pessoa_id,r.origem,r.nome,r.telefone,r.cargo,r.regiao,r.cidade,r.is_voluntario,r.tem_contrato
    FROM miss m JOIN (SELECT * FROM frozen UNION ALL SELECT * FROM legacy) r ON r.mission_id=m.id
    WHERE p_root_id IS NULL OR (r.origem='eleicao' AND r.pessoa_id IN(SELECT id FROM team))
  ), ck AS (
    SELECT c.* FROM mission_checkins c WHERE c.client_id=p_client_id AND c.mission_id IN(SELECT id FROM miss)
  ), ob AS (
    SELECT o.mission_id,o.origem,o.ref_id,
      bool_or(o.status='cumprida' AND (o.evidencia_nivel='E2' OR
        (o.evidencia_nivel IN('E1','E3') AND o.evidencia_validada))) cumprida,
      bool_or(o.evidencia_nivel='E1' AND o.evidencia_validada) e1,
      bool_or(o.evidencia_nivel='E3' AND o.evidencia_validada) e3,max(o.cumprida_em) cumprida_em
    FROM engagement_obrigacoes o
    WHERE o.client_id=p_client_id AND o.mission_id IN(SELECT id FROM miss) AND o.status<>'dispensada'
    GROUP BY 1,2,3
  ), paired AS (
    SELECT b.*,c.primeiro_acesso_em,c.concluido_em,c.participant_id,
      coalesce(o.cumprida,false) ob_cumprida,coalesce(o.e1,false) ob_e1,
      coalesce(o.e3,false) ob_e3,o.cumprida_em ob_em,
      EXISTS(SELECT 1 FROM mission_events e WHERE e.mission_id=b.id AND e.participant_id=c.participant_id
        AND coalesce(e.is_bot,false)=false AND e.event_type::text LIKE 'click_%') clicou
    FROM base b LEFT JOIN ck c ON c.mission_id=b.id AND (
      (b.origem='eleicao' AND c.pessoa_id=b.pessoa_id) OR
      (b.origem='funcionario' AND c.funcionario_id=b.pessoa_id) OR
      (b.origem='participant' AND c.participant_id=b.pessoa_id))
    LEFT JOIN ob o ON o.mission_id=b.id AND o.origem=b.origem AND o.ref_id=b.pessoa_id
  )
  SELECT p.id,p.title,p.platform,p.pub_em,p.pessoa_id,p.origem,p.nome,p.telefone,p.cargo,p.regiao,p.cidade,
    p.is_voluntario,p.tem_contrato,
    CASE WHEN p.concluido_em IS NOT NULL OR p.ob_cumprida OR p.ob_e1 OR p.ob_e3 THEN 'cumpriu'
      WHEN p.primeiro_acesso_em IS NOT NULL OR p.clicou THEN 'abriu' ELSE 'nao_abriu' END,
    CASE WHEN p.ob_e1 THEN 'E1' WHEN p.ob_e3 THEN 'E3'
      WHEN p.concluido_em IS NOT NULL OR p.ob_cumprida THEN 'E2' ELSE NULL END,
    coalesce(p.concluido_em,p.ob_em),p.primeiro_acesso_em FROM paired p;
END $$;

REVOKE ALL ON FUNCTION public.engagement_pub_facts_v2(uuid,integer,uuid,integer,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_pub_facts_v2(uuid,integer,uuid,integer,uuid,uuid) TO authenticated;
