-- A matriz de missoes deve acompanhar exatamente o conjunto canonico exibido
-- como contratado na Eleicao: pessoa ativa, nao voluntaria e com valor > 0.
-- A versao anterior tambem incluia todos os coordenadores, mesmo sem contrato,
-- e nao era reexecutada quando um contrato era cadastrado depois da missao.

CREATE OR REPLACE FUNCTION public.engagement_sync_mission_current_contracts(
  p_client_id uuid,
  p_mission_id uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prazo integer := 24;
  v_total integer := 0;
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL
    AND NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.portal_missions m
    WHERE m.id = p_mission_id
      AND m.client_id = p_client_id
      AND m.archived_at IS NULL
      AND coalesce(m.is_active, true)
      AND (coalesce(m.tracking_enabled, false) OR coalesce(m.monitorada, false))
  ) THEN
    RETURN 0;
  END IF;

  SELECT greatest(coalesce(c.prazo_missao_horas, 24), 1)
  INTO v_prazo
  FROM public.engagement_config c
  WHERE c.client_id = p_client_id;
  v_prazo := coalesce(v_prazo, 24);

  -- Primeiro garante uma linha canonica para cada contrato ativo, inclusive
  -- cadastros sem telefone autorizados pela importacao.
  INSERT INTO public.engagement_obrigacoes AS current_obligation(
    client_id, mission_id, origem, ref_id, nome, cargo, telefone, regiao, cidade,
    phone_norm, tipo_obrigacao, esperado, prazo_em, pontos_possiveis,
    assigned_at, eligible_from, assignment_source, snapshot_version
  )
  SELECT
    m.client_id, m.id, 'eleicao', p.id, p.nome, p.tipo::text, p.telefone,
    coalesce(nullif(p.regiao, ''), p.bairro), p.cidade,
    public.normalize_br_phone(p.telefone), 'checkin', 1,
    coalesce(m.publicado_em, m.created_at) + pg_catalog.make_interval(hours => v_prazo),
    1, now(), coalesce(p.confirmado_em, p.created_at),
    'election_active_contracts', 10
  FROM public.portal_missions m
  JOIN public.eleicao_pessoas p ON p.client_id = m.client_id
  WHERE m.id = p_mission_id
    AND m.client_id = p_client_id
    AND p.arquivado_em IS NULL
    AND NOT coalesce(p.is_voluntario, false)
    AND coalesce(p.valor_contratacao, 0) > 0
  ON CONFLICT (mission_id, origem, ref_id) DO UPDATE SET
    nome = EXCLUDED.nome,
    cargo = EXCLUDED.cargo,
    telefone = EXCLUDED.telefone,
    regiao = EXCLUDED.regiao,
    cidade = EXCLUDED.cidade,
    phone_norm = EXCLUDED.phone_norm,
    assignment_source = EXCLUDED.assignment_source,
    snapshot_version = EXCLUDED.snapshot_version,
    status = CASE
      WHEN current_obligation.status = 'cumprida'
        OR current_obligation.cumprida_em IS NOT NULL THEN 'cumprida'
      ELSE 'pendente'
    END,
    dispensa_motivo = NULL,
    updated_at = now();

  -- Consolida a origem legada antes de removê-la, preservando cumprimento.
  UPDATE public.engagement_obrigacoes canonical
  SET status = CASE
        WHEN legacy.status = 'cumprida' OR canonical.status = 'cumprida'
          THEN 'cumprida'
        ELSE canonical.status
      END,
      cumprida_em = coalesce(canonical.cumprida_em, legacy.cumprida_em),
      evidencia_nivel = coalesce(canonical.evidencia_nivel, legacy.evidencia_nivel),
      evidencia_validada = coalesce(canonical.evidencia_validada, false)
        OR coalesce(legacy.evidencia_validada, false),
      pontos = greatest(coalesce(canonical.pontos, 0), coalesce(legacy.pontos, 0)),
      updated_at = now()
  FROM public.engagement_obrigacoes legacy
  WHERE canonical.client_id = p_client_id
    AND canonical.mission_id = p_mission_id
    AND canonical.origem = 'eleicao'
    AND legacy.client_id = canonical.client_id
    AND legacy.mission_id = canonical.mission_id
    AND legacy.origem = 'eleicao_pessoas'
    AND legacy.ref_id = canonical.ref_id;

  DELETE FROM public.engagement_obrigacoes legacy
  USING public.engagement_obrigacoes canonical
  WHERE legacy.client_id = p_client_id
    AND legacy.mission_id = p_mission_id
    AND legacy.origem = 'eleicao_pessoas'
    AND canonical.client_id = legacy.client_id
    AND canonical.mission_id = legacy.mission_id
    AND canonical.origem = 'eleicao'
    AND canonical.ref_id = legacy.ref_id;

  -- Retira somente da matriz operacional quem nao e contrato ativo atual.
  -- Check-ins, eventos e participantes continuam preservados para auditoria.
  UPDATE public.engagement_obrigacoes o
  SET status = 'dispensada',
      dispensa_motivo = 'sem_contrato_ativo_atual',
      justificativa = coalesce(o.justificativa, 'Fora da lista atual de contratados'),
      updated_at = now()
  WHERE o.client_id = p_client_id
    AND o.mission_id = p_mission_id
    AND o.origem IN ('eleicao', 'eleicao_pessoas')
    AND NOT EXISTS (
      SELECT 1
      FROM public.eleicao_pessoas p
      WHERE p.id = o.ref_id
        AND p.client_id = p_client_id
        AND p.arquivado_em IS NULL
        AND NOT coalesce(p.is_voluntario, false)
        AND coalesce(p.valor_contratacao, 0) > 0
    );

  PERFORM public.mission_apply_completed_checkins(p_client_id, p_mission_id, NULL);

  SELECT count(*)::integer
  INTO v_total
  FROM public.engagement_obrigacoes o
  WHERE o.client_id = p_client_id
    AND o.mission_id = p_mission_id
    AND o.status <> 'dispensada'
    AND o.origem = 'eleicao';

  UPDATE public.portal_missions
  SET eligible_count = v_total,
      audience_snapshotted_at = coalesce(audience_snapshotted_at, now()),
      monitorada = true,
      tracking_enabled = true,
      updated_at = now()
  WHERE id = p_mission_id
    AND client_id = p_client_id;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.engagement_sync_mission_current_contracts(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engagement_sync_mission_current_contracts(uuid, uuid)
  TO authenticated, service_role;

-- O backfill nao roda automaticamente nesta migration. Executar todas as
-- missoes em uma unica transacao excede o timeout do SQL Editor. Esta RPC
-- processa lotes pequenos e pode ser chamada novamente ate retornar zero.
CREATE OR REPLACE FUNCTION public.engagement_resync_contract_matrices_batch(
  p_client_id uuid,
  p_limit integer DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mission record;
  v_processadas integer := 0;
  v_restantes integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 20 THEN
    RAISE EXCEPTION 'O limite deve ficar entre 1 e 20';
  END IF;
  IF (SELECT auth.uid()) IS NOT NULL
    AND NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;

  FOR v_mission IN
    SELECT m.id
    FROM public.portal_missions m
    WHERE m.client_id = p_client_id
      AND m.archived_at IS NULL
      AND coalesce(m.is_active, true)
      AND (coalesce(m.tracking_enabled, false) OR coalesce(m.monitorada, false))
      AND EXISTS (
        SELECT 1
        FROM public.engagement_obrigacoes o
        WHERE o.mission_id = m.id
          AND o.client_id = p_client_id
          AND o.status <> 'dispensada'
          AND o.origem IN ('eleicao', 'eleicao_pessoas')
          AND (
            o.snapshot_version < 10
            OR o.assignment_source IS DISTINCT FROM 'election_active_contracts'
          )
      )
    ORDER BY coalesce(m.publicado_em, m.created_at) DESC, m.id
    LIMIT p_limit
  LOOP
    PERFORM public.engagement_sync_mission_current_contracts(
      p_client_id,
      v_mission.id
    );
    v_processadas := v_processadas + 1;
  END LOOP;

  SELECT count(*)::integer
  INTO v_restantes
  FROM public.portal_missions m
  WHERE m.client_id = p_client_id
    AND m.archived_at IS NULL
    AND coalesce(m.is_active, true)
    AND (coalesce(m.tracking_enabled, false) OR coalesce(m.monitorada, false))
    AND EXISTS (
      SELECT 1
      FROM public.engagement_obrigacoes o
      WHERE o.mission_id = m.id
        AND o.client_id = p_client_id
        AND o.status <> 'dispensada'
        AND o.origem IN ('eleicao', 'eleicao_pessoas')
        AND (
          o.snapshot_version < 10
          OR o.assignment_source IS DISTINCT FROM 'election_active_contracts'
        )
    );

  RETURN jsonb_build_object(
    'processadas', v_processadas,
    'restantes', v_restantes
  );
END;
$$;

REVOKE ALL ON FUNCTION public.engagement_resync_contract_matrices_batch(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engagement_resync_contract_matrices_batch(uuid, integer)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
