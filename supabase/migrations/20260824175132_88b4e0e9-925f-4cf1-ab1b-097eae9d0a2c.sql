CREATE OR REPLACE FUNCTION public.tele_registrar_ligacao(_client_id uuid, _nome text, _senha text, _tabela text, _id uuid, _ligacao_status text, _cidade text, _bairro text, _vota_candidato text DEFAULT NULL::text, _candidato_alternativo text DEFAULT NULL::text, _observacao text DEFAULT NULL::text, _proxima_tentativa_em timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count integer := 0;
  v_status text;
  v_tele_status text;
  v_lock_owner text;
  v_lock_expires timestamptz;
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
  IF _ligacao_status NOT IN ('atendeu','nao_atendeu','recusou','pendente','reagendou','invalido') THEN
    RAISE EXCEPTION 'Status inválido'; END IF;

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
    v_tele_status := CASE
      WHEN _ligacao_status IN ('atendeu','recusou') THEN 'concluido'
      WHEN _ligacao_status='invalido' THEN 'descartado'
      WHEN _proxima_tentativa_em IS NOT NULL THEN 'agendado'
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
        status_telemarketing=v_tele_status
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
    cidade, bairro, vota_candidato, candidato_alternativo, observacao, proxima_tentativa_em)
  VALUES (_client_id, _tabela, _id, _nome, _ligacao_status,
    NULLIF(_cidade,''), NULLIF(_bairro,''), _vota_candidato, _candidato_alternativo, NULLIF(_observacao,''), _proxima_tentativa_em);

  RETURN jsonb_build_object('updated', v_count);
END;
$function$;