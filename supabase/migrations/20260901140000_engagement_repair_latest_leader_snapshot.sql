-- Repara a fotografia incompleta da publicacao rastreada mais recente.
-- Inclui somente lideres que ja existiam no banco na data da publicacao.
-- Pessoas cadastradas depois continuam fora das missoes anteriores.

WITH latest_tracked AS (
  SELECT DISTINCT ON (m.client_id)
    m.id,
    m.client_id,
    coalesce(m.publicado_em,m.created_at) publicado_em,
    greatest(coalesce(cfg.prazo_missao_horas,24),1) prazo_horas
  FROM public.portal_missions m
  LEFT JOIN public.engagement_config cfg ON cfg.client_id=m.client_id
  WHERE m.archived_at IS NULL
    AND coalesce(m.is_active,true)
    AND coalesce(m.monitorada,false)
    AND coalesce(m.tracking_enabled,false)
  ORDER BY m.client_id,coalesce(m.publicado_em,m.created_at) DESC,m.id DESC
), missing_leaders AS (
  SELECT DISTINCT ON (
    l.id,
    coalesce(public.mission_phone_key(p.telefone),'id:'||p.id::text)
  )
    l.id mission_id,l.client_id,p.id pessoa_id,p.nome,p.telefone,
    coalesce(nullif(p.regiao,''),p.bairro) regiao,p.cidade,p.created_at elegivel_desde,
    l.publicado_em,l.prazo_horas
  FROM latest_tracked l
  JOIN public.eleicao_pessoas p ON p.client_id=l.client_id
  WHERE p.tipo::text='lider'
    AND p.arquivado_em IS NULL
    AND p.created_at<=l.publicado_em
    AND (p.vigencia_inicio IS NULL OR p.vigencia_inicio<=(l.publicado_em AT TIME ZONE 'America/Cuiaba')::date)
    AND (p.vigencia_fim IS NULL OR p.vigencia_fim>=(l.publicado_em AT TIME ZONE 'America/Cuiaba')::date)
    AND NOT EXISTS (
      SELECT 1 FROM public.engagement_obrigacoes o
      WHERE o.mission_id=l.id
        AND (
          (public.mission_phone_key(p.telefone) IS NOT NULL
            AND public.mission_phone_key(o.telefone)=public.mission_phone_key(p.telefone))
          OR (public.mission_phone_key(p.telefone) IS NULL
            AND o.origem IN('eleicao','eleicao_pessoas') AND o.ref_id=p.id)
        )
    )
  ORDER BY l.id,coalesce(public.mission_phone_key(p.telefone),'id:'||p.id::text),p.created_at,p.id
)
INSERT INTO public.engagement_obrigacoes(
  client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
  phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,
  assigned_at,eligible_from,assignment_source,snapshot_version
)
SELECT m.client_id,m.mission_id,'eleicao',m.pessoa_id,m.nome,'lider',m.telefone,m.regiao,m.cidade,
  public.normalize_br_phone(m.telefone),'checkin',1,
  m.publicado_em+make_interval(hours=>m.prazo_horas),1,now(),m.elegivel_desde,
  'latest_leader_snapshot_repair',5
FROM missing_leaders m
ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

-- Atualiza o contador congelado depois do reparo.
UPDATE public.portal_missions m
SET eligible_count=(
    SELECT count(*)::integer FROM public.engagement_obrigacoes o
    WHERE o.mission_id=m.id AND o.status<>'dispensada'
  ),
  audience_snapshotted_at=coalesce(m.audience_snapshotted_at,now()),
  updated_at=now()
WHERE m.id IN (
  SELECT DISTINCT ON (x.client_id) x.id
  FROM public.portal_missions x
  WHERE x.archived_at IS NULL
    AND coalesce(x.is_active,true)
    AND coalesce(x.monitorada,false)
    AND coalesce(x.tracking_enabled,false)
  ORDER BY x.client_id,coalesce(x.publicado_em,x.created_at) DESC,x.id DESC
);

-- Para as proximas publicacoes, complementa automaticamente a fotografia com
-- todos os lideres ja cadastrados quando a missao entrar no ar.
CREATE OR REPLACE FUNCTION public.engagement_snapshot_registered_leaders()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_publicado timestamptz; v_prazo integer:=24; v_total integer;
BEGIN
  IF NEW.archived_at IS NOT NULL OR NOT coalesce(NEW.is_active,true) THEN RETURN NEW; END IF;
  v_publicado:=coalesce(NEW.publicado_em,NEW.created_at,now());
  SELECT greatest(coalesce(c.prazo_missao_horas,24),1) INTO v_prazo
  FROM engagement_config c WHERE c.client_id=NEW.client_id;

  INSERT INTO engagement_obrigacoes(
    client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,
    assigned_at,eligible_from,assignment_source,snapshot_version
  )
  SELECT NEW.client_id,NEW.id,'eleicao',x.id,x.nome,'lider',x.telefone,x.regiao,x.cidade,
    public.normalize_br_phone(x.telefone),'checkin',1,
    v_publicado+make_interval(hours=>coalesce(v_prazo,24)),1,now(),x.created_at,
    'registered_leader_auto',5
  FROM (
    SELECT DISTINCT ON(coalesce(public.mission_phone_key(p.telefone),'id:'||p.id::text))
      p.id,p.nome,p.telefone,coalesce(nullif(p.regiao,''),p.bairro) regiao,p.cidade,p.created_at
    FROM eleicao_pessoas p
    WHERE p.client_id=NEW.client_id
      AND p.tipo::text='lider'
      AND p.arquivado_em IS NULL
      AND p.created_at<=v_publicado
      AND (p.vigencia_inicio IS NULL OR p.vigencia_inicio<=(v_publicado AT TIME ZONE 'America/Cuiaba')::date)
      AND (p.vigencia_fim IS NULL OR p.vigencia_fim>=(v_publicado AT TIME ZONE 'America/Cuiaba')::date)
    ORDER BY coalesce(public.mission_phone_key(p.telefone),'id:'||p.id::text),p.created_at,p.id
  ) x
  WHERE NOT EXISTS (
    SELECT 1 FROM engagement_obrigacoes o
    WHERE o.mission_id=NEW.id
      AND (
        (public.mission_phone_key(x.telefone) IS NOT NULL
          AND public.mission_phone_key(o.telefone)=public.mission_phone_key(x.telefone))
        OR (public.mission_phone_key(x.telefone) IS NULL
          AND o.origem IN('eleicao','eleicao_pessoas') AND o.ref_id=x.id)
      )
  )
  ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

  SELECT count(*)::integer INTO v_total FROM engagement_obrigacoes o
  WHERE o.mission_id=NEW.id AND o.status<>'dispensada';
  UPDATE portal_missions SET eligible_count=v_total,
    audience_snapshotted_at=coalesce(audience_snapshotted_at,now()),updated_at=now()
  WHERE id=NEW.id;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_engagement_snapshot_registered_leaders ON public.portal_missions;
CREATE TRIGGER trg_engagement_snapshot_registered_leaders
AFTER INSERT ON public.portal_missions
FOR EACH ROW EXECUTE FUNCTION public.engagement_snapshot_registered_leaders();

NOTIFY pgrst, 'reload schema';
