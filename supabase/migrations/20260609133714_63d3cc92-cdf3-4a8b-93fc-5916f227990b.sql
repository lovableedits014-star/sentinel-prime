
-- Index for fast lookup of active locks
CREATE INDEX IF NOT EXISTS idx_tele_assign_active
  ON public.telemarketing_call_assignments (client_id, expires_at);

-- ============================================================
-- tele_proximo_contato: pick + claim next available contact atomically
-- ============================================================
CREATE OR REPLACE FUNCTION public.tele_proximo_contato(
  _client_id uuid,
  _nome text,
  _senha text,
  _campanha_id uuid DEFAULT NULL,
  _ttl_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_expires timestamptz;
  v_cand record;
  v_inserted boolean;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);

  -- garbage collect expired locks
  DELETE FROM public.telemarketing_call_assignments WHERE expires_at < now();

  v_expires := now() + make_interval(secs => GREATEST(_ttl_seconds, 60));

  -- Iterate candidates and try to claim the first one that's not locked.
  -- Anti-duplication by phone: skip if same telefone is locked elsewhere.
  FOR v_cand IN
    WITH locked_phones AS (
      SELECT DISTINCT lower(btrim(COALESCE(
        (SELECT telefone FROM public.contratados WHERE id=a.contato_id AND a.tabela='contratados'),
        (SELECT telefone FROM public.contratado_indicados WHERE id=a.contato_id AND a.tabela='contratado_indicados'),
        (SELECT telefone FROM public.telemarketing_contatos_avulsos WHERE id=a.contato_id AND a.tabela='contatos_avulsos'),
        (SELECT telefone FROM public.eleicao_indicados WHERE id=a.contato_id AND a.tabela='eleicao_indicados'),
        (SELECT telefone FROM public.eleicao_pessoas WHERE id=a.contato_id AND a.tabela='eleicao_pessoas')
      ))) AS tel
      FROM public.telemarketing_call_assignments a
      WHERE a.client_id = _client_id
        AND a.expires_at > now()
        AND a.operador_nome <> _nome
    ),
    candidates AS (
      SELECT 'contratados'::text AS tabela, c.id, c.telefone,
             COALESCE(c.tentativas_count, 0) AS tentativas,
             c.created_at, c.ligacao_status, c.proxima_tentativa_em
      FROM public.contratados c
      WHERE c.client_id = _client_id
        AND (_campanha_id IS NULL OR c.campanha_id = _campanha_id)
        AND COALESCE(c.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'contratado_indicados', i.id, i.telefone,
             COALESCE(i.tentativas_count,0), i.created_at, i.ligacao_status, i.proxima_tentativa_em
      FROM public.contratado_indicados i
      WHERE i.client_id = _client_id
        AND (_campanha_id IS NULL OR i.campanha_id = _campanha_id)
        AND COALESCE(i.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'contatos_avulsos', av.id, av.telefone,
             COALESCE(av.tentativas_count,0), av.created_at, av.ligacao_status, av.proxima_tentativa_em
      FROM public.telemarketing_contatos_avulsos av
      WHERE av.client_id = _client_id
        AND av.ativo = true
        AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
        AND COALESCE(av.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'eleicao_indicados', ei.id, ei.telefone,
             COALESCE(ei.total_tentativas,0), ei.created_at, ei.ultimo_status_ligacao, ei.proxima_tentativa_em
      FROM public.eleicao_indicados ei
      WHERE ei.client_id = _client_id
        AND ei.campanha_id IS NOT NULL
        AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
        AND COALESCE(ei.ultimo_status_ligacao,'pendente') IN ('pendente','nao_atendeu','reagendou')
      UNION ALL
      SELECT 'eleicao_pessoas', p.id, p.telefone,
             COALESCE(p.tentativas_count,0), p.created_at, p.ligacao_status, p.proxima_tentativa_em
      FROM public.eleicao_pessoas p
      WHERE p.client_id = _client_id
        AND p.telefone IS NOT NULL
        AND length(btrim(p.telefone)) >= 8
        AND (_campanha_id IS NULL OR p.campanha_id = _campanha_id)
        AND COALESCE(p.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
    )
    SELECT c.tabela, c.id, c.telefone, c.tentativas, c.created_at
    FROM candidates c
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id = _client_id
     AND a.tabela = c.tabela
     AND a.contato_id = c.id
     AND a.expires_at > now()
    WHERE a.id IS NULL
      AND (c.proxima_tentativa_em IS NULL OR c.proxima_tentativa_em <= now())
      AND lower(btrim(COALESCE(c.telefone,''))) NOT IN (SELECT tel FROM locked_phones WHERE tel IS NOT NULL AND tel <> '')
    ORDER BY
      CASE WHEN c.ligacao_status IS NULL OR c.ligacao_status = 'pendente' THEN 0 ELSE 1 END,
      c.tentativas ASC,
      c.created_at ASC
    LIMIT 50
  LOOP
    BEGIN
      INSERT INTO public.telemarketing_call_assignments(
        client_id, tabela, contato_id, operador_nome, expires_at)
      VALUES (_client_id, v_cand.tabela, v_cand.id, _nome, v_expires);
      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      -- someone else claimed it between our SELECT and INSERT; try next
      v_inserted := false;
    END;

    IF v_inserted THEN
      RETURN jsonb_build_object(
        'found', true,
        'tabela', v_cand.tabela,
        'contato_id', v_cand.id,
        'expires_at', v_expires
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('found', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_proximo_contato(uuid, text, text, uuid, integer) TO authenticated, anon;

-- ============================================================
-- tele_heartbeat_contato: renew lock while operator works
-- ============================================================
CREATE OR REPLACE FUNCTION public.tele_heartbeat_contato(
  _client_id uuid,
  _nome text,
  _senha text,
  _tabela text,
  _id uuid,
  _ttl_seconds integer DEFAULT 300
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE v_count integer;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);

  UPDATE public.telemarketing_call_assignments
     SET expires_at = now() + make_interval(secs => GREATEST(_ttl_seconds, 60))
   WHERE client_id = _client_id
     AND tabela = _tabela
     AND contato_id = _id
     AND operador_nome = _nome;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('renewed', v_count > 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_heartbeat_contato(uuid, text, text, text, uuid, integer) TO authenticated, anon;

-- ============================================================
-- tele_registrar_ligacao: reject if active lock belongs to another operator
-- ============================================================
CREATE OR REPLACE FUNCTION public.tele_registrar_ligacao(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid,
  _ligacao_status text, _cidade text, _bairro text,
  _vota_candidato text DEFAULT NULL, _candidato_alternativo text DEFAULT NULL,
  _observacao text DEFAULT NULL, _proxima_tentativa_em timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_count integer := 0;
  v_status text;
  v_lock_owner text;
  v_lock_expires timestamptz;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  IF _ligacao_status NOT IN ('atendeu','nao_atendeu','recusou','pendente','reagendou','invalido') THEN
    RAISE EXCEPTION 'Status inválido'; END IF;

  -- Check lock: if another operator owns an active lock, reject.
  SELECT operador_nome, expires_at INTO v_lock_owner, v_lock_expires
    FROM public.telemarketing_call_assignments
   WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id
     AND expires_at > now()
   LIMIT 1;

  IF v_lock_owner IS NOT NULL AND v_lock_owner <> _nome THEN
    RETURN jsonb_build_object(
      'updated', 0,
      'conflict', true,
      'lock_owner', v_lock_owner,
      'lock_expires', v_lock_expires
    );
  END IF;

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
      ELSE NULL END;
    UPDATE public.eleicao_indicados
    SET ultimo_status_ligacao=_ligacao_status, operador_nome=_nome, ultima_ligacao_em=now(),
        total_tentativas=COALESCE(total_tentativas,0)+1,
        proxima_tentativa_em=_proxima_tentativa_em,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END,
        status=COALESCE(v_status, status)
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='eleicao_pessoas' THEN
    UPDATE public.eleicao_pessoas
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
  ELSE
    RAISE EXCEPTION 'Tabela inválida';
  END IF;

  DELETE FROM public.telemarketing_call_assignments
   WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id;

  INSERT INTO public.telemarketing_call_log(
    client_id, tabela, contato_id, operador_nome, ligacao_status,
    cidade, bairro, vota_candidato, candidato_alternativo, observacao)
  VALUES (_client_id, _tabela, _id, _nome, _ligacao_status,
    NULLIF(_cidade,''), NULLIF(_bairro,''), _vota_candidato, _candidato_alternativo, NULLIF(_observacao,''));

  RETURN jsonb_build_object('updated', v_count);
END;
$$;

-- ============================================================
-- tele_operadores_ao_vivo: admin view of who is calling whom right now
-- ============================================================
CREATE OR REPLACE FUNCTION public.tele_operadores_ao_vivo(_client_id uuid)
RETURNS TABLE(
  operador_nome text,
  tabela text,
  contato_id uuid,
  contato_nome text,
  contato_telefone text,
  started_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM public.clients WHERE id=_client_id AND user_id=auth.uid())
          OR EXISTS (SELECT 1 FROM public.team_members WHERE client_id=_client_id AND user_id=auth.uid() AND status='active')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT a.operador_nome, a.tabela, a.contato_id,
    COALESCE(
      (SELECT nome FROM public.contratados WHERE id=a.contato_id AND a.tabela='contratados'),
      (SELECT nome FROM public.contratado_indicados WHERE id=a.contato_id AND a.tabela='contratado_indicados'),
      (SELECT nome FROM public.telemarketing_contatos_avulsos WHERE id=a.contato_id AND a.tabela='contatos_avulsos'),
      (SELECT nome FROM public.eleicao_indicados WHERE id=a.contato_id AND a.tabela='eleicao_indicados'),
      (SELECT nome FROM public.eleicao_pessoas WHERE id=a.contato_id AND a.tabela='eleicao_pessoas')
    ),
    COALESCE(
      (SELECT telefone FROM public.contratados WHERE id=a.contato_id AND a.tabela='contratados'),
      (SELECT telefone FROM public.contratado_indicados WHERE id=a.contato_id AND a.tabela='contratado_indicados'),
      (SELECT telefone FROM public.telemarketing_contatos_avulsos WHERE id=a.contato_id AND a.tabela='contatos_avulsos'),
      (SELECT telefone FROM public.eleicao_indicados WHERE id=a.contato_id AND a.tabela='eleicao_indicados'),
      (SELECT telefone FROM public.eleicao_pessoas WHERE id=a.contato_id AND a.tabela='eleicao_pessoas')
    ),
    a.created_at, a.expires_at
  FROM public.telemarketing_call_assignments a
  WHERE a.client_id = _client_id AND a.expires_at > now()
  ORDER BY a.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_operadores_ao_vivo(uuid) TO authenticated;
