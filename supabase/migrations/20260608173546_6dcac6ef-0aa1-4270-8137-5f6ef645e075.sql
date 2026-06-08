
-- 1. Add telemarketing-tracking columns to eleicao_indicados
ALTER TABLE public.eleicao_indicados
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.telemarketing_campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vota_candidato text,
  ADD COLUMN IF NOT EXISTS candidato_alternativo text,
  ADD COLUMN IF NOT EXISTS operador_nome text,
  ADD COLUMN IF NOT EXISTS observacao_tele text,
  ADD COLUMN IF NOT EXISTS proxima_tentativa_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_eleicao_indicados_campanha
  ON public.eleicao_indicados(client_id, campanha_id)
  WHERE campanha_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eleicao_indicados_indicador
  ON public.eleicao_indicados(client_id, indicador_id, indicador_tipo);

CREATE INDEX IF NOT EXISTS idx_eleicao_indicados_status_tele
  ON public.eleicao_indicados(client_id, status_telemarketing);

-- 2. Preview filter — count of indicados matching the filter set
CREATE OR REPLACE FUNCTION public.tele_preview_eleicao_indicados(
  _client_id uuid,
  _filtros jsonb
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE v_total int; v_pendentes int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  WITH base AS (
    SELECT id, status_telemarketing
    FROM public.eleicao_indicados ei
    WHERE ei.client_id = _client_id
      AND (COALESCE(_filtros->>'cidade','')='' OR lower(ei.cidade) = lower(_filtros->>'cidade'))
      AND (COALESCE(_filtros->>'bairro','')='' OR lower(ei.bairro) = lower(_filtros->>'bairro'))
      AND (COALESCE(_filtros->>'indicador_tipo','')='' OR ei.indicador_tipo::text = _filtros->>'indicador_tipo')
      AND (COALESCE(_filtros->>'indicador_id','')='' OR ei.indicador_id::text = _filtros->>'indicador_id')
      AND (COALESCE(_filtros->>'status','')='' OR COALESCE(ei.status_telemarketing,'pendente') = _filtros->>'status')
      AND (
        COALESCE((_filtros->>'apenas_nao_ligados')::boolean, false) = false
        OR ei.ultima_ligacao_em IS NULL
      )
  )
  SELECT count(*),
         count(*) FILTER (WHERE COALESCE(status_telemarketing,'pendente')='pendente')
    INTO v_total, v_pendentes
    FROM base;

  RETURN jsonb_build_object('total', v_total, 'pendentes', v_pendentes);
END;
$$;

-- 3. Designar lista filtrada de indicados a uma campanha
CREATE OR REPLACE FUNCTION public.tele_designar_eleicao_indicados(
  _client_id uuid,
  _campanha_id uuid,
  _filtros jsonb,
  _substituir boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE v_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.telemarketing_campanhas WHERE id=_campanha_id AND client_id=_client_id) THEN
    RAISE EXCEPTION 'Campanha inválida';
  END IF;

  UPDATE public.eleicao_indicados ei
     SET campanha_id = _campanha_id
   WHERE ei.client_id = _client_id
     AND (_substituir OR ei.campanha_id IS NULL OR ei.campanha_id = _campanha_id)
     AND (COALESCE(_filtros->>'cidade','')='' OR lower(ei.cidade) = lower(_filtros->>'cidade'))
     AND (COALESCE(_filtros->>'bairro','')='' OR lower(ei.bairro) = lower(_filtros->>'bairro'))
     AND (COALESCE(_filtros->>'indicador_tipo','')='' OR ei.indicador_tipo::text = _filtros->>'indicador_tipo')
     AND (COALESCE(_filtros->>'indicador_id','')='' OR ei.indicador_id::text = _filtros->>'indicador_id')
     AND (COALESCE(_filtros->>'status','')='' OR COALESCE(ei.status_telemarketing,'pendente') = _filtros->>'status')
     AND (
       COALESCE((_filtros->>'apenas_nao_ligados')::boolean, false) = false
       OR ei.ultima_ligacao_em IS NULL
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Persiste o filtro na campanha (info para histórico)
  UPDATE public.telemarketing_campanhas
     SET filtros = COALESCE(filtros,'{}'::jsonb) || jsonb_build_object('fonte','eleicao_indicados','eleicao_filtros',_filtros)
   WHERE id = _campanha_id AND client_id = _client_id;

  RETURN jsonb_build_object('atribuidos', v_count);
END;
$$;

-- 4. Remover designação (limpa campanha_id)
CREATE OR REPLACE FUNCTION public.tele_limpar_eleicao_campanha(
  _client_id uuid,
  _campanha_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE v_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  UPDATE public.eleicao_indicados SET campanha_id = NULL
   WHERE client_id = _client_id AND campanha_id = _campanha_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('removidos', v_count);
END;
$$;

-- 5. Substitui tele_list_contatos para incluir eleicao_indicados designados (novas colunas indicador_*)
DROP FUNCTION IF EXISTS public.tele_list_contatos(uuid, text, text);
CREATE OR REPLACE FUNCTION public.tele_list_contatos(
  _client_id uuid, _nome text, _senha text
) RETURNS TABLE(
  id uuid, nome text, telefone text, cidade text, bairro text,
  ligacao_status text, vota_candidato text, candidato_alternativo text,
  operador_nome text, ligacao_em timestamptz, tipo text, tabela text,
  proxima_tentativa_em timestamptz, tentativas_count integer, observacao_tele text,
  locked_by text, locked_until timestamptz, campanha_id uuid,
  indicador_nome text, indicador_tipo text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);

  RETURN QUERY
    SELECT c.id, c.nome, c.telefone, c.cidade, c.bairro,
           c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
           c.operador_nome, c.ligacao_em,
           CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END, 'contratados'::text,
           c.proxima_tentativa_em, COALESCE(c.tentativas_count,0), c.observacao_tele,
           a.operador_nome, a.expires_at, NULL::uuid,
           NULL::text, NULL::text
    FROM public.contratados c
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=c.client_id AND a.tabela='contratados' AND a.contato_id=c.id AND a.expires_at>now()
    WHERE c.client_id=_client_id
    UNION ALL
    SELECT i.id, i.nome, i.telefone, i.cidade, i.bairro,
           i.ligacao_status, i.vota_candidato, i.candidato_alternativo,
           i.operador_nome, i.ligacao_em,
           'indicado'::text, 'contratado_indicados'::text,
           i.proxima_tentativa_em, COALESCE(i.tentativas_count,0), i.observacao_tele,
           a.operador_nome, a.expires_at, NULL::uuid,
           NULL::text, NULL::text
    FROM public.contratado_indicados i
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=i.client_id AND a.tabela='contratado_indicados' AND a.contato_id=i.id AND a.expires_at>now()
    WHERE i.client_id=_client_id
    UNION ALL
    SELECT av.id, av.nome, av.telefone, av.cidade, av.bairro,
           av.ligacao_status, av.vota_candidato, av.candidato_alternativo,
           av.operador_nome, av.ligacao_em,
           'avulso'::text, 'contatos_avulsos'::text,
           av.proxima_tentativa_em, COALESCE(av.tentativas_count,0), av.observacao_tele,
           a.operador_nome, a.expires_at, av.campanha_id,
           NULL::text, NULL::text
    FROM public.telemarketing_contatos_avulsos av
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=av.client_id AND a.tabela='contatos_avulsos' AND a.contato_id=av.id AND a.expires_at>now()
    WHERE av.client_id=_client_id AND av.ativo=true
    UNION ALL
    SELECT ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
           ei.ultimo_status_ligacao, ei.vota_candidato, ei.candidato_alternativo,
           ei.operador_nome, ei.ultima_ligacao_em,
           'eleicao_indicado'::text, 'eleicao_indicados'::text,
           ei.proxima_tentativa_em, COALESCE(ei.total_tentativas,0), ei.observacao_tele,
           a.operador_nome, a.expires_at, ei.campanha_id,
           ep.nome, ei.indicador_tipo::text
    FROM public.eleicao_indicados ei
    LEFT JOIN public.eleicao_pessoas ep ON ep.id = ei.indicador_id
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=ei.client_id AND a.tabela='eleicao_indicados' AND a.contato_id=ei.id AND a.expires_at>now()
    WHERE ei.client_id=_client_id AND ei.campanha_id IS NOT NULL;
END;
$$;

-- 6. Aceitar eleicao_indicados em tele_claim_contato
CREATE OR REPLACE FUNCTION public.tele_claim_contato(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid,
  _ttl_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE v_row record; v_expires timestamptz;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  IF _tabela NOT IN ('contratados','contratado_indicados','contatos_avulsos','eleicao_indicados') THEN
    RAISE EXCEPTION 'Tabela inválida'; END IF;

  DELETE FROM public.telemarketing_call_assignments WHERE expires_at < now();
  v_expires := now() + make_interval(secs => GREATEST(_ttl_seconds,60));

  INSERT INTO public.telemarketing_call_assignments(client_id, tabela, contato_id, operador_nome, expires_at)
  VALUES (_client_id, _tabela, _id, _nome, v_expires)
  ON CONFLICT (client_id, tabela, contato_id) DO UPDATE
    SET operador_nome=EXCLUDED.operador_nome, expires_at=EXCLUDED.expires_at
    WHERE public.telemarketing_call_assignments.operador_nome=EXCLUDED.operador_nome
       OR public.telemarketing_call_assignments.expires_at<now()
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.telemarketing_call_assignments
    WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id;
    RETURN jsonb_build_object('claimed', false, 'operador_nome', v_row.operador_nome, 'expires_at', v_row.expires_at);
  END IF;
  RETURN jsonb_build_object('claimed', true, 'expires_at', v_row.expires_at);
END;
$$;

-- 7. Aceitar eleicao_indicados em tele_registrar_ligacao
CREATE OR REPLACE FUNCTION public.tele_registrar_ligacao(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid,
  _ligacao_status text, _cidade text, _bairro text,
  _vota_candidato text DEFAULT NULL, _candidato_alternativo text DEFAULT NULL,
  _observacao text DEFAULT NULL, _proxima_tentativa_em timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE v_count integer := 0; v_status text;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  IF _ligacao_status NOT IN ('atendeu','nao_atendeu','recusou','pendente','reagendou','invalido') THEN
    RAISE EXCEPTION 'Status inválido'; END IF;

  IF _tabela='contratados' THEN
    UPDATE public.contratados
    SET ligacao_status=_ligacao_status, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=_proxima_tentativa_em,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='contratado_indicados' THEN
    v_status := CASE WHEN _ligacao_status='atendeu' AND _vota_candidato='sim' THEN 'confirmado'
                     WHEN _ligacao_status='atendeu' AND _vota_candidato='nao' THEN 'rejeitado'
                     ELSE NULL END;
    UPDATE public.contratado_indicados
    SET ligacao_status=_ligacao_status, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=_proxima_tentativa_em,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END,
        status=COALESCE(v_status, status)
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='contatos_avulsos' THEN
    UPDATE public.telemarketing_contatos_avulsos
    SET ligacao_status=_ligacao_status, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=_proxima_tentativa_em,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='eleicao_indicados' THEN
    v_status := CASE
      WHEN _ligacao_status='atendeu' AND _vota_candidato='sim' THEN 'confirmado'
      WHEN _ligacao_status='atendeu' AND _vota_candidato='nao' THEN 'rejeitado'
      WHEN _ligacao_status='atendeu' AND _vota_candidato='indeciso' THEN 'indeciso'
      WHEN _ligacao_status='recusou' THEN 'recusou'
      WHEN _ligacao_status='invalido' THEN 'invalido'
      WHEN _ligacao_status='nao_atendeu' THEN 'nao_atendeu'
      ELSE 'pendente' END;
    UPDATE public.eleicao_indicados
    SET ultimo_status_ligacao=_ligacao_status, operador_nome=_nome, ultima_ligacao_em=now(),
        total_tentativas=COALESCE(total_tentativas,0)+1,
        proxima_tentativa_em=_proxima_tentativa_em,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END,
        status_telemarketing=v_status
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSE RAISE EXCEPTION 'Tabela inválida'; END IF;

  INSERT INTO public.telemarketing_call_log(
    client_id, tabela, contato_id, operador_nome, ligacao_status,
    vota_candidato, candidato_alternativo, cidade, bairro, observacao, proxima_tentativa_em
  ) VALUES (_client_id, _tabela, _id, _nome, _ligacao_status,
            _vota_candidato, _candidato_alternativo, _cidade, _bairro, _observacao, _proxima_tentativa_em);

  DELETE FROM public.telemarketing_call_assignments
  WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id AND operador_nome=_nome;

  RETURN jsonb_build_object('updated', v_count, 'logged', true);
END;
$$;

-- 8. Scorecard de qualidade por indicador (coordenador/líder/cabo)
CREATE OR REPLACE FUNCTION public.tele_indicador_scorecard(
  _client_id uuid,
  _campanha_id uuid DEFAULT NULL,
  _indicador_tipo text DEFAULT NULL
) RETURNS TABLE(
  indicador_id uuid,
  indicador_nome text,
  indicador_tipo text,
  total_indicados bigint,
  ligados bigint,
  confirmados bigint,
  rejeitados bigint,
  indecisos bigint,
  recusou bigint,
  nao_atendeu bigint,
  invalidos bigint,
  taxa_confirmacao numeric,
  taxa_voto_efetivo numeric,
  score_qualidade numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      ei.indicador_id,
      ei.indicador_tipo::text AS itipo,
      count(*) AS total_indicados,
      count(*) FILTER (WHERE ei.ultima_ligacao_em IS NOT NULL) AS ligados,
      count(*) FILTER (WHERE ei.status_telemarketing = 'confirmado') AS confirmados,
      count(*) FILTER (WHERE ei.status_telemarketing = 'rejeitado') AS rejeitados,
      count(*) FILTER (WHERE ei.status_telemarketing = 'indeciso') AS indecisos,
      count(*) FILTER (WHERE ei.status_telemarketing = 'recusou') AS recusou,
      count(*) FILTER (WHERE ei.status_telemarketing = 'nao_atendeu') AS nao_atendeu,
      count(*) FILTER (WHERE ei.status_telemarketing = 'invalido') AS invalidos
    FROM public.eleicao_indicados ei
    WHERE ei.client_id = _client_id
      AND ei.indicador_id IS NOT NULL
      AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
      AND (_indicador_tipo IS NULL OR ei.indicador_tipo::text = _indicador_tipo)
    GROUP BY ei.indicador_id, ei.indicador_tipo
  )
  SELECT
    a.indicador_id,
    ep.nome,
    a.itipo,
    a.total_indicados,
    a.ligados,
    a.confirmados,
    a.rejeitados,
    a.indecisos,
    a.recusou,
    a.nao_atendeu,
    a.invalidos,
    CASE WHEN a.ligados > 0 THEN round((a.confirmados::numeric / a.ligados) * 100, 2) ELSE 0 END,
    CASE WHEN a.total_indicados > 0 THEN round((a.confirmados::numeric / a.total_indicados) * 100, 2) ELSE 0 END,
    CASE WHEN a.total_indicados > 0
      THEN round(((a.confirmados::numeric - a.rejeitados - (a.invalidos * 0.5)) / a.total_indicados) * 100, 2)
      ELSE 0 END
  FROM agg a
  LEFT JOIN public.eleicao_pessoas ep ON ep.id = a.indicador_id
  ORDER BY a.confirmados DESC, a.total_indicados DESC;
END;
$$;

-- 9. Drill-down: indicados de um indicador específico
CREATE OR REPLACE FUNCTION public.tele_indicador_drill(
  _client_id uuid,
  _indicador_id uuid,
  _campanha_id uuid DEFAULT NULL
) RETURNS TABLE(
  id uuid, nome text, telefone text, cidade text, bairro text,
  status_telemarketing text, ultimo_status_ligacao text,
  vota_candidato text, ultima_ligacao_em timestamptz, total_tentativas integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY
    SELECT ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
           ei.status_telemarketing, ei.ultimo_status_ligacao,
           ei.vota_candidato, ei.ultima_ligacao_em, COALESCE(ei.total_tentativas,0)
      FROM public.eleicao_indicados ei
     WHERE ei.client_id = _client_id
       AND ei.indicador_id = _indicador_id
       AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
     ORDER BY ei.created_at DESC;
END;
$$;

-- 10. Lista de indicadores (coordenador/líder/cabo) para o seletor do filtro
CREATE OR REPLACE FUNCTION public.tele_list_indicadores(
  _client_id uuid
) RETURNS TABLE(id uuid, nome text, tipo text, cidade text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id=_client_id AND c.user_id=auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  RETURN QUERY
    SELECT ep.id, ep.nome, ep.tipo::text, ep.cidade
      FROM public.eleicao_pessoas ep
     WHERE ep.client_id = _client_id
     ORDER BY ep.tipo, ep.nome;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_preview_eleicao_indicados(uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tele_designar_eleicao_indicados(uuid, uuid, jsonb, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tele_limpar_eleicao_campanha(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tele_indicador_scorecard(uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tele_indicador_drill(uuid, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tele_list_indicadores(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tele_list_contatos(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tele_claim_contato(uuid, text, text, text, uuid, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tele_registrar_ligacao(uuid, text, text, text, uuid, text, text, text, text, text, text, timestamptz) TO anon, authenticated, service_role;
