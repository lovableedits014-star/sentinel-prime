CREATE OR REPLACE FUNCTION public.tele_registrar_ligacao(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid,
  _ligacao_status text, _cidade text, _bairro text,
  _vota_candidato text DEFAULT NULL::text,
  _candidato_alternativo text DEFAULT NULL::text,
  _observacao text DEFAULT NULL::text,
  _proxima_tentativa_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count integer := 0;
  v_status text;
  v_tele_status text;
  v_lock_owner text;
  v_lock_expires timestamptz;
  v_prox timestamptz;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  IF _ligacao_status NOT IN ('atendeu','nao_atendeu','recusou','pendente','reagendou','invalido') THEN
    RAISE EXCEPTION 'Status inválido'; END IF;

  IF _ligacao_status = 'atendeu' AND _vota_candidato = 'nao'
     AND COALESCE(btrim(_candidato_alternativo), '') = '' THEN
    RAISE EXCEPTION 'Informe em quem a pessoa vota quando o resultado for "não vota".';
  END IF;

  v_prox := _proxima_tentativa_em;
  IF _ligacao_status = 'nao_atendeu' AND v_prox IS NULL THEN
    v_prox := now() + interval '6 hours';
  END IF;

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
        proxima_tentativa_em=v_prox,
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
        proxima_tentativa_em=v_prox,
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
        proxima_tentativa_em=v_prox,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='eleicao_indicados' THEN
    v_tele_status := CASE
      WHEN _ligacao_status IN ('atendeu','recusou') THEN 'concluido'
      WHEN _ligacao_status='invalido' THEN 'descartado'
      WHEN v_prox IS NOT NULL THEN 'agendado'
      ELSE 'pendente' END;
    UPDATE public.eleicao_indicados
    SET ultimo_status_ligacao=_ligacao_status, operador_nome=_nome, ultima_ligacao_em=now(),
        total_tentativas=COALESCE(total_tentativas,0)+1,
        proxima_tentativa_em=v_prox,
        observacao_tele=COALESCE(NULLIF(_observacao,''), observacao_tele),
        cidade=COALESCE(NULLIF(_cidade,''), cidade),
        bairro=COALESCE(NULLIF(_bairro,''), bairro),
        vota_candidato=CASE WHEN _ligacao_status='atendeu' THEN _vota_candidato ELSE vota_candidato END,
        candidato_alternativo=CASE WHEN _ligacao_status='atendeu' THEN _candidato_alternativo ELSE candidato_alternativo END,
        status_telemarketing=v_tele_status
    WHERE id=_id AND client_id=_client_id;
    GET DIAGNOSTICS v_count=ROW_COUNT;
  ELSIF _tabela='eleicao_pessoas' THEN
    UPDATE public.eleicao_pessoas
    SET ligacao_status=_ligacao_status, operador_nome=_nome, ligacao_em=now(),
        tentativas_count=COALESCE(tentativas_count,0)+1,
        proxima_tentativa_em=v_prox,
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
    cidade, bairro, vota_candidato, candidato_alternativo, observacao, proxima_tentativa_em)
  VALUES (_client_id, _tabela, _id, _nome, _ligacao_status,
    NULLIF(_cidade,''), NULLIF(_bairro,''), _vota_candidato, _candidato_alternativo, NULLIF(_observacao,''), v_prox);

  RETURN jsonb_build_object('updated', v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tele_buscar_contato(
  _client_id uuid, _nome text, _senha text, _termo text,
  _campanha_id uuid DEFAULT NULL::uuid, _limite integer DEFAULT 30)
RETURNS TABLE(
  id uuid, nome text, telefone text, cidade text, bairro text,
  ligacao_status text, vota_candidato text, candidato_alternativo text,
  operador_nome text, ligacao_em timestamp with time zone,
  tipo text, tabela text, proxima_tentativa_em timestamp with time zone,
  tentativas_count integer, observacao_tele text,
  locked_by text, locked_until timestamp with time zone,
  campanha_id uuid, indicador_nome text, indicador_tipo text, lista_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_op_id uuid;
  v_lista_id uuid;
  v_termo text;
  v_digits text;
  v_like text;
  v_lim integer;
BEGIN
  v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);

  SELECT op.lista_atual_id INTO v_lista_id
    FROM public.telemarketing_operadores AS op
   WHERE op.id = v_op_id;

  v_termo := btrim(COALESCE(_termo, ''));
  IF length(v_termo) < 3 THEN
    RETURN;
  END IF;
  v_like := '%' || lower(v_termo) || '%';
  v_digits := regexp_replace(v_termo, '\D', '', 'g');
  -- normaliza para os últimos 8 dígitos (ignora DDI/DDD/zeros à esquerda)
  IF length(v_digits) > 8 THEN
    v_digits := right(v_digits, 8);
  END IF;
  v_lim := LEAST(GREATEST(COALESCE(_limite, 30), 1), 100);

  RETURN QUERY
  WITH base AS (
    SELECT av.id, av.nome, av.telefone, av.cidade, av.bairro,
           av.ligacao_status, av.vota_candidato, av.candidato_alternativo,
           av.operador_nome, av.ligacao_em, 'avulso'::text AS tipo, 'contatos_avulsos'::text AS tabela,
           av.proxima_tentativa_em, COALESCE(av.tentativas_count, 0) AS tentativas_count, av.observacao_tele,
           a.operador_nome AS locked_by, a.expires_at AS locked_until, av.campanha_id,
           NULL::text AS indicador_nome, NULL::text AS indicador_tipo, av.lista_id
      FROM public.telemarketing_contatos_avulsos AS av
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = av.client_id AND a.tabela = 'contatos_avulsos'
       AND a.contato_id = av.id AND a.expires_at > now()
     WHERE av.client_id = _client_id
       AND av.ativo = true
       AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
       AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id = v_op_id)
       AND (v_lista_id IS NULL OR av.lista_id = v_lista_id)

    UNION ALL

    SELECT c.id, c.nome, c.telefone, c.cidade, c.bairro,
           c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
           c.operador_nome, c.ligacao_em,
           CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END, 'contratados'::text,
           c.proxima_tentativa_em, COALESCE(c.tentativas_count, 0), c.observacao_tele,
           a.operador_nome, a.expires_at, c.campanha_id,
           NULL::text, NULL::text, NULL::uuid
      FROM public.contratados AS c
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = c.client_id AND a.tabela = 'contratados'
       AND a.contato_id = c.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND c.client_id = _client_id
       AND (_campanha_id IS NULL OR c.campanha_id = _campanha_id)

    UNION ALL

    SELECT i.id, i.nome, i.telefone, i.cidade, i.bairro,
           i.ligacao_status, i.vota_candidato, i.candidato_alternativo,
           i.operador_nome, i.ligacao_em, 'indicado'::text, 'contratado_indicados'::text,
           i.proxima_tentativa_em, COALESCE(i.tentativas_count, 0), i.observacao_tele,
           a.operador_nome, a.expires_at, i.campanha_id,
           NULL::text, NULL::text, NULL::uuid
      FROM public.contratado_indicados AS i
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = i.client_id AND a.tabela = 'contratado_indicados'
       AND a.contato_id = i.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND i.client_id = _client_id
       AND (_campanha_id IS NULL OR i.campanha_id = _campanha_id)

    UNION ALL

    SELECT ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
           ei.ultimo_status_ligacao, ei.vota_candidato, ei.candidato_alternativo,
           ei.operador_nome, ei.ultima_ligacao_em, 'indicado_eleicao'::text, 'eleicao_indicados'::text,
           ei.proxima_tentativa_em, COALESCE(ei.total_tentativas, 0), ei.observacao_tele,
           a.operador_nome, a.expires_at, ei.campanha_id,
           p.nome, ei.indicador_tipo::text, NULL::uuid
      FROM public.eleicao_indicados AS ei
      LEFT JOIN public.eleicao_pessoas AS p ON p.id = ei.indicador_id
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = ei.client_id AND a.tabela = 'eleicao_indicados'
       AND a.contato_id = ei.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND ei.client_id = _client_id
       AND ei.campanha_id IS NOT NULL
       AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
       AND (ei.assigned_operador_id IS NULL OR ei.assigned_operador_id = v_op_id)

    UNION ALL

    SELECT ep.id, ep.nome, ep.telefone, ep.cidade, ep.bairro,
           ep.ligacao_status, ep.vota_candidato, ep.candidato_alternativo,
           ep.operador_nome, ep.ligacao_em, ep.tipo::text, 'eleicao_pessoas'::text,
           ep.proxima_tentativa_em, COALESCE(ep.tentativas_count, 0), ep.observacao_tele,
           a.operador_nome, a.expires_at, ep.campanha_id,
           NULL::text, NULL::text, NULL::uuid
      FROM public.eleicao_pessoas AS ep
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = ep.client_id AND a.tabela = 'eleicao_pessoas'
       AND a.contato_id = ep.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND ep.client_id = _client_id
       AND ep.campanha_id IS NOT NULL
       AND ep.telefone IS NOT NULL
       AND (_campanha_id IS NULL OR ep.campanha_id = _campanha_id)
       AND (ep.assigned_operador_id IS NULL OR ep.assigned_operador_id = v_op_id)
  )
  SELECT b.*
    FROM base AS b
   WHERE lower(COALESCE(b.nome, '')) LIKE v_like
      OR (
        length(v_digits) >= 6
        AND regexp_replace(COALESCE(b.telefone, ''), '\D', '', 'g') LIKE '%' || v_digits
      )
   ORDER BY b.nome
   LIMIT v_lim;
END;
$function$;

REVOKE ALL ON FUNCTION public.tele_buscar_contato(uuid, text, text, text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_buscar_contato(uuid, text, text, text, uuid, integer) TO anon, authenticated, service_role;