-- Uma obrigacao por lider e por missao. Telefone serve para casar o
-- cumprimento, mas nunca mais elimina um lider da equipe ou da matriz.

INSERT INTO public.engagement_obrigacoes(
  client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
  phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,
  assigned_at,eligible_from,assignment_source,snapshot_version
)
SELECT m.client_id,m.id,'eleicao',p.id,p.nome,'lider',p.telefone,
  coalesce(nullif(p.regiao,''),p.bairro),p.cidade,
  public.normalize_br_phone(p.telefone),'checkin',1,
  coalesce(m.publicado_em,m.created_at)+make_interval(hours=>greatest(coalesce(cfg.prazo_missao_horas,24),1)),
  1,now(),p.created_at,'leader_id_per_mission_repair',7
FROM public.portal_missions m
JOIN public.eleicao_pessoas p ON p.client_id=m.client_id
LEFT JOIN public.engagement_config cfg ON cfg.client_id=m.client_id
WHERE m.archived_at IS NULL
  AND coalesce(m.is_active,true)
  AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))
  AND p.tipo::text='lider'
  AND p.arquivado_em IS NULL
  AND (p.vigencia_inicio IS NULL OR p.vigencia_inicio<=current_date)
  AND (p.vigencia_fim IS NULL OR p.vigencia_fim>=current_date)
ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

UPDATE public.portal_missions m
SET eligible_count=(
  SELECT count(*)::integer FROM public.engagement_obrigacoes o
  WHERE o.mission_id=m.id AND o.status<>'dispensada'
),updated_at=now()
WHERE m.archived_at IS NULL
  AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false));

CREATE OR REPLACE FUNCTION public.engagement_ensure_mission_leader_ids()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_prazo integer:=24;
BEGIN
  IF NEW.archived_at IS NOT NULL OR NOT coalesce(NEW.is_active,true) THEN RETURN NEW; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM portal_missions m WHERE m.id=NEW.id
      AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))
  ) THEN RETURN NEW; END IF;
  SELECT greatest(coalesce(c.prazo_missao_horas,24),1) INTO v_prazo
  FROM engagement_config c WHERE c.client_id=NEW.client_id;
  INSERT INTO engagement_obrigacoes(client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,assigned_at,eligible_from,assignment_source,snapshot_version)
  SELECT NEW.client_id,NEW.id,'eleicao',p.id,p.nome,'lider',p.telefone,coalesce(nullif(p.regiao,''),p.bairro),p.cidade,
    public.normalize_br_phone(p.telefone),'checkin',1,
    coalesce(NEW.publicado_em,NEW.created_at,now())+make_interval(hours=>coalesce(v_prazo,24)),
    1,now(),p.created_at,'leader_id_per_mission_auto',7
  FROM eleicao_pessoas p
  WHERE p.client_id=NEW.client_id AND p.tipo::text='lider' AND p.arquivado_em IS NULL
    AND (p.vigencia_inicio IS NULL OR p.vigencia_inicio<=current_date)
    AND (p.vigencia_fim IS NULL OR p.vigencia_fim>=current_date)
  ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zzz_trg_engagement_ensure_mission_leader_ids ON portal_missions;
CREATE TRIGGER zzz_trg_engagement_ensure_mission_leader_ids
AFTER INSERT ON portal_missions FOR EACH ROW
EXECUTE FUNCTION public.engagement_ensure_mission_leader_ids();

-- Relatorio canonico: quando existe a obrigacao de eleicao do lider, ignora a
-- copia da base legada com o mesmo telefone. Nao colapsa lideres diferentes que
-- por acaso compartilham telefone.
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
  ), frozen AS (
    SELECT m.id mission_id,o.ref_id pessoa_id,o.origem,o.nome,o.telefone,o.cargo,o.regiao,o.cidade,
      o.status obrig_status,o.evidencia_nivel,o.evidencia_validada,o.cumprida_em,
      (o.cargo='voluntario') voluntario,
      coalesce((SELECT coalesce(ep.valor_contratacao,0)>0 FROM eleicao_pessoas ep
        WHERE o.origem IN('eleicao','eleicao_pessoas') AND ep.id=o.ref_id),
        o.cargo IN('contratado','funcionario')) contrato
    FROM miss m JOIN engagement_obrigacoes o ON o.mission_id=m.id AND o.client_id=p_client_id
    WHERE m.audience_snapshotted_at IS NOT NULL AND o.status<>'dispensada'
      AND NOT (
        o.origem NOT IN('eleicao','eleicao_pessoas')
        AND public.mission_phone_key(o.telefone) IS NOT NULL
        AND EXISTS(
          SELECT 1 FROM engagement_obrigacoes canon
          WHERE canon.mission_id=o.mission_id
            AND canon.status<>'dispensada'
            AND canon.origem IN('eleicao','eleicao_pessoas')
            AND public.mission_phone_key(canon.telefone)=public.mission_phone_key(o.telefone)
        )
      )
  ), legacy AS (
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
  ), base AS (
    SELECT m.*,r.pessoa_id,r.origem,r.nome,r.telefone,r.cargo,r.regiao,r.cidade,
      r.obrig_status,r.evidencia_nivel,r.evidencia_validada,r.cumprida_em,r.voluntario,r.contrato
    FROM miss m JOIN (SELECT * FROM frozen UNION ALL SELECT * FROM legacy) r ON r.mission_id=m.id
    WHERE p_root_id IS NULL
      OR r.pessoa_id IN(SELECT t.id FROM team t)
      OR (public.mission_phone_key(r.telefone) IS NOT NULL AND public.mission_phone_key(r.telefone) IN(
        SELECT t.phone_key FROM team t WHERE t.phone_key IS NOT NULL
      ))
  ), paired AS (
    SELECT b.*,ck.primeiro,ck.concluido,coalesce(ck.clicou,false) clicou
    FROM base b
    LEFT JOIN LATERAL (
      SELECT min(c.primeiro_acesso_em) primeiro,max(c.concluido_em) concluido,
        EXISTS(
          SELECT 1
          FROM mission_checkins c2
          JOIN mission_participants mp2 ON mp2.id=c2.participant_id
          JOIN mission_events e ON e.mission_id=c2.mission_id AND e.participant_id=c2.participant_id
          WHERE c2.client_id=p_client_id AND c2.mission_id=b.id
            AND NOT coalesce(e.is_bot,false) AND e.event_type::text LIKE 'click_%'
            AND (
              (b.origem IN('eleicao','eleicao_pessoas') AND c2.pessoa_id=b.pessoa_id)
              OR (b.origem='funcionario' AND c2.funcionario_id=b.pessoa_id)
              OR (public.mission_phone_key(b.telefone) IS NOT NULL
                AND public.mission_phone_key(mp2.phone_e164)=public.mission_phone_key(b.telefone))
            )
        ) clicou
      FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
      WHERE c.client_id=p_client_id AND c.mission_id=b.id AND (
        (b.origem IN('eleicao','eleicao_pessoas') AND c.pessoa_id=b.pessoa_id)
        OR (b.origem='funcionario' AND c.funcionario_id=b.pessoa_id)
        OR (public.mission_phone_key(b.telefone) IS NOT NULL
          AND public.mission_phone_key(mp.phone_e164)=public.mission_phone_key(b.telefone))
      )
    ) ck ON true
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
