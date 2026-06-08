
-- 1. Colunas de acompanhamento em eleicao_pessoas
ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS ligacao_status text,
  ADD COLUMN IF NOT EXISTS vota_candidato text,
  ADD COLUMN IF NOT EXISTS candidato_alternativo text,
  ADD COLUMN IF NOT EXISTS operador_nome text,
  ADD COLUMN IF NOT EXISTS ligacao_em timestamptz,
  ADD COLUMN IF NOT EXISTS observacao_tele text,
  ADD COLUMN IF NOT EXISTS proxima_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS tentativas_count integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_tele_status
  ON public.eleicao_pessoas(client_id, ligacao_status)
  WHERE telefone IS NOT NULL;

-- 2. tele_list_contatos: adiciona 5ª branch (estrutura: coordenador/lider/cabo)
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
    WHERE ei.client_id=_client_id AND ei.campanha_id IS NOT NULL
    UNION ALL
    SELECT p.id, p.nome, p.telefone, p.cidade, p.bairro,
           p.ligacao_status, p.vota_candidato, p.candidato_alternativo,
           p.operador_nome, p.ligacao_em,
           'estrutura'::text, 'eleicao_pessoas'::text,
           p.proxima_tentativa_em, COALESCE(p.tentativas_count,0), p.observacao_tele,
           a.operador_nome, a.expires_at, NULL::uuid,
           NULL::text, p.tipo::text
    FROM public.eleicao_pessoas p
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=p.client_id AND a.tabela='eleicao_pessoas' AND a.contato_id=p.id AND a.expires_at>now()
    WHERE p.client_id=_client_id
      AND p.telefone IS NOT NULL
      AND length(btrim(p.telefone)) >= 8;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_list_contatos(uuid, text, text) TO anon, authenticated, service_role;

-- 3. Aceitar 'eleicao_pessoas' em tele_claim_contato
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
  IF _tabela NOT IN ('contratados','contratado_indicados','contatos_avulsos','eleicao_indicados','eleicao_pessoas') THEN
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

-- 4. Registrar ligação em eleicao_pessoas
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
