-- Novo contrato operacional do engajamento:
-- cada publicacao rastreada cobra todos os lideres atuais.
-- A data em que o lider entrou no banco nao limita mais o relatorio.

CREATE OR REPLACE FUNCTION public.engagement_sync_current_leaders_per_mission(
  p_client_id uuid DEFAULT NULL,
  p_mission_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE v_inserted integer:=0;
BEGIN
  INSERT INTO engagement_obrigacoes(
    client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,
    assigned_at,eligible_from,assignment_source,snapshot_version
  )
  SELECT m.client_id,m.id,'eleicao',p.id,p.nome,'lider',p.telefone,
    coalesce(nullif(p.regiao,''),p.bairro),p.cidade,
    public.normalize_br_phone(p.telefone),'checkin',1,
    coalesce(m.publicado_em,m.created_at)+make_interval(
      hours=>greatest(coalesce(cfg.prazo_missao_horas,24),1)
    ),
    1,now(),p.created_at,'current_leaders_per_mission',6
  FROM portal_missions m
  JOIN eleicao_pessoas p ON p.client_id=m.client_id
  LEFT JOIN engagement_config cfg ON cfg.client_id=m.client_id
  WHERE m.archived_at IS NULL
    AND coalesce(m.is_active,true)
    AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))
    AND (p_client_id IS NULL OR m.client_id=p_client_id)
    AND (p_mission_id IS NULL OR m.id=p_mission_id)
    AND p.tipo::text='lider'
    AND p.arquivado_em IS NULL
    AND (p.vigencia_inicio IS NULL OR p.vigencia_inicio<=current_date)
    AND (p.vigencia_fim IS NULL OR p.vigencia_fim>=current_date)
    AND NOT EXISTS(
      SELECT 1 FROM engagement_obrigacoes o
      WHERE o.mission_id=m.id
        AND o.origem IN('eleicao','eleicao_pessoas')
        AND o.ref_id=p.id
    )
  ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted=ROW_COUNT;

  UPDATE portal_missions m
  SET eligible_count=(
      SELECT count(*)::integer
      FROM engagement_obrigacoes o
      WHERE o.mission_id=m.id AND o.status<>'dispensada'
    ),
    audience_snapshotted_at=coalesce(m.audience_snapshotted_at,now()),
    monitorada=true,
    updated_at=now()
  WHERE m.archived_at IS NULL
    AND coalesce(m.is_active,true)
    AND (coalesce(m.tracking_enabled,false) OR coalesce(m.monitorada,false))
    AND (p_client_id IS NULL OR m.client_id=p_client_id)
    AND (p_mission_id IS NULL OR m.id=p_mission_id);

  RETURN v_inserted;
END;
$function$;

-- Reconstroi agora a base de todas as publicacoes rastreadas, inclusive a
-- publicacao mais recente que ficou vazia para a equipe do Birajara.
SELECT public.engagement_sync_current_leaders_per_mission(NULL,NULL);

-- Toda publicacao rastreada nova recebe os lideres atuais depois que os demais
-- gatilhos de criacao terminarem.
CREATE OR REPLACE FUNCTION public.engagement_sync_mission_current_leaders_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
BEGIN
  -- Consulta a linha novamente dentro da funcao de sincronizacao. Isso e
  -- necessario porque um gatilho anterior pode ter ligado tracking_enabled
  -- depois do INSERT, enquanto NEW ainda contem o valor original.
  PERFORM public.engagement_sync_current_leaders_per_mission(NEW.client_id,NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zz_trg_engagement_sync_mission_current_leaders ON portal_missions;
CREATE TRIGGER zz_trg_engagement_sync_mission_current_leaders
AFTER INSERT ON portal_missions
FOR EACH ROW EXECUTE FUNCTION public.engagement_sync_mission_current_leaders_trigger();

-- Se uma publicacao existente for ligada ao rastreamento depois da criacao,
-- cria sua base de cobranca nesse momento.
DROP TRIGGER IF EXISTS zz_trg_engagement_sync_enabled_mission_leaders ON portal_missions;
CREATE TRIGGER zz_trg_engagement_sync_enabled_mission_leaders
AFTER UPDATE OF tracking_enabled,is_active,archived_at ON portal_missions
FOR EACH ROW
WHEN (
  NEW.archived_at IS NULL
  AND NEW.is_active IS DISTINCT FROM false
  AND NEW.tracking_enabled IS TRUE
  AND (
    OLD.tracking_enabled IS DISTINCT FROM TRUE
    OR OLD.is_active IS DISTINCT FROM NEW.is_active
    OR OLD.archived_at IS DISTINCT FROM NEW.archived_at
  )
)
EXECUTE FUNCTION public.engagement_sync_mission_current_leaders_trigger();

REVOKE ALL ON FUNCTION public.engagement_sync_current_leaders_per_mission(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_sync_current_leaders_per_mission(uuid,uuid) TO authenticated,service_role;

NOTIFY pgrst, 'reload schema';
