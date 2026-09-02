-- Regra canonica: o publico obrigatorio do Engajamento e exatamente o mesmo
-- conjunto exibido como "Contratados" na Eleicao: ativo, nao voluntario e com
-- valor_contratacao > 0. Tipo (coordenador/lider/cabo) nao altera a obrigacao.

DROP TRIGGER IF EXISTS zz_trg_engagement_sync_mission_current_leaders ON portal_missions;
DROP TRIGGER IF EXISTS zz_trg_engagement_sync_enabled_mission_leaders ON portal_missions;
DROP TRIGGER IF EXISTS zzz_trg_engagement_ensure_mission_leader_ids ON portal_missions;

CREATE OR REPLACE FUNCTION public.engagement_sync_mission_current_contracts(
  p_client_id uuid,
  p_mission_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_prazo integer:=24; v_total integer:=0;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM portal_missions m
    WHERE m.id=p_mission_id AND m.client_id=p_client_id
      AND m.archived_at IS NULL AND coalesce(m.is_active,true)
      AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))
  ) THEN RETURN 0; END IF;

  SELECT greatest(coalesce(c.prazo_missao_horas,24),1) INTO v_prazo
  FROM engagement_config c WHERE c.client_id=p_client_id;

  -- Remove do funil somente quem nao pertence ao conjunto canonico atual.
  -- Eventos, participantes e check-ins permanecem intactos para auditoria.
  DELETE FROM engagement_obrigacoes o
  WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id
    AND NOT (
      o.origem IN('eleicao','eleicao_pessoas') AND EXISTS(
        SELECT 1 FROM eleicao_pessoas p
        WHERE p.id=o.ref_id AND p.client_id=p_client_id
          AND p.arquivado_em IS NULL
          AND NOT coalesce(p.is_voluntario,false)
          AND coalesce(p.valor_contratacao,0)>0
      )
    );

  INSERT INTO engagement_obrigacoes(
    client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,
    assigned_at,eligible_from,assignment_source,snapshot_version
  )
  SELECT m.client_id,m.id,'eleicao',p.id,p.nome,p.tipo::text,p.telefone,
    coalesce(nullif(p.regiao,''),p.bairro),p.cidade,
    public.normalize_br_phone(p.telefone),'checkin',1,
    coalesce(m.publicado_em,m.created_at)+make_interval(hours=>coalesce(v_prazo,24)),
    1,now(),coalesce(p.confirmado_em,p.created_at),'election_contracted_canonical',8
  FROM portal_missions m
  JOIN eleicao_pessoas p ON p.client_id=m.client_id
  WHERE m.id=p_mission_id AND m.client_id=p_client_id
    AND p.arquivado_em IS NULL
    AND NOT coalesce(p.is_voluntario,false)
    AND coalesce(p.valor_contratacao,0)>0
  ON CONFLICT(mission_id,origem,ref_id) DO UPDATE SET
    nome=EXCLUDED.nome,cargo=EXCLUDED.cargo,telefone=EXCLUDED.telefone,
    regiao=EXCLUDED.regiao,cidade=EXCLUDED.cidade,phone_norm=EXCLUDED.phone_norm,
    assignment_source='election_contracted_canonical',snapshot_version=8,
    updated_at=now();

  -- Reaplica conclusoes ja registradas aos contratos que acabaram de entrar
  -- no funil. Nada e inferido sem check-in concluido da mesma missao.
  UPDATE engagement_obrigacoes o
  SET status='cumprida',cumprida_em=coalesce(o.cumprida_em,c.concluido_em),
    evidencia_nivel=coalesce(o.evidencia_nivel,'E2'),
    pontos=o.pontos_possiveis,updated_at=now()
  FROM mission_checkins c
  JOIN mission_participants mp ON mp.id=c.participant_id
  WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id
    AND c.client_id=o.client_id AND c.mission_id=o.mission_id
    AND c.concluido_em IS NOT NULL AND o.status<>'dispensada'
    AND (
      o.ref_id=coalesce(c.pessoa_id,mp.pessoa_id) OR
      (public.mission_phone_key(o.telefone) IS NOT NULL AND
       public.mission_phone_key(o.telefone)=public.mission_phone_key(mp.phone_e164))
    );

  SELECT count(*)::integer INTO v_total
  FROM engagement_obrigacoes o
  WHERE o.mission_id=p_mission_id AND o.status<>'dispensada';

  UPDATE portal_missions SET eligible_count=v_total,
    audience_snapshotted_at=coalesce(audience_snapshotted_at,now()),
    monitorada=true,tracking_enabled=true,updated_at=now()
  WHERE id=p_mission_id AND client_id=p_client_id;
  RETURN v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.engagement_sync_mission_contracts_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  PERFORM public.engagement_sync_mission_current_contracts(NEW.client_id,NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zzzz_trg_engagement_sync_mission_contracts ON portal_missions;
CREATE TRIGGER zzzz_trg_engagement_sync_mission_contracts
AFTER INSERT ON portal_missions FOR EACH ROW
EXECUTE FUNCTION public.engagement_sync_mission_contracts_trigger();

DROP TRIGGER IF EXISTS zzzz_trg_engagement_sync_enabled_contracts ON portal_missions;
CREATE TRIGGER zzzz_trg_engagement_sync_enabled_contracts
AFTER UPDATE OF tracking_enabled,is_active,archived_at ON portal_missions
FOR EACH ROW WHEN (
  NEW.archived_at IS NULL AND NEW.is_active IS DISTINCT FROM false
  AND NEW.tracking_enabled IS TRUE AND (
    OLD.tracking_enabled IS DISTINCT FROM TRUE
    OR OLD.is_active IS DISTINCT FROM NEW.is_active
    OR OLD.archived_at IS DISTINCT FROM NEW.archived_at
  )
) EXECUTE FUNCTION public.engagement_sync_mission_contracts_trigger();

-- Corrige as missoes operacionais de hoje, incluindo a ja compartilhada.
SELECT public.engagement_sync_mission_current_contracts(m.client_id,m.id)
FROM portal_missions m
WHERE m.archived_at IS NULL AND coalesce(m.is_active,true)
  AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))
  AND (coalesce(m.publicado_em,m.created_at) AT TIME ZONE 'America/Cuiaba')::date
      =(now() AT TIME ZONE 'America/Cuiaba')::date;

REVOKE ALL ON FUNCTION public.engagement_sync_mission_current_contracts(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_sync_mission_current_contracts(uuid,uuid) TO authenticated,service_role;
NOTIFY pgrst, 'reload schema';
