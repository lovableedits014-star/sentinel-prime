CREATE OR REPLACE FUNCTION public.tele_registrar_ligacao_sessao(
  _client_id uuid, _nome text, _senha text, _tabela text, _id uuid,
  _ligacao_status text, _cidade text, _bairro text,
  _vota_candidato text DEFAULT NULL, _candidato_alternativo text DEFAULT NULL,
  _observacao text DEFAULT NULL, _proxima_tentativa_em timestamptz DEFAULT NULL,
  _candidato_federal text DEFAULT NULL, _federal_status text DEFAULT NULL,
  _candidato_senador text DEFAULT NULL, _senador_status text DEFAULT NULL,
  _candidato_governador text DEFAULT NULL, _governador_status text DEFAULT NULL,
  _session_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_lock record; v_result jsonb;
BEGIN
  PERFORM public._tele_assert_operador(_client_id,_nome,_senha);
  SELECT operador_nome,session_id,expires_at INTO v_lock
    FROM public.telemarketing_call_assignments
   WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id AND expires_at>now()
   LIMIT 1;
  IF v_lock.operador_nome IS NOT NULL AND
     (v_lock.operador_nome<>_nome OR v_lock.session_id IS DISTINCT FROM NULLIF(btrim(_session_id),'')) THEN
    RETURN jsonb_build_object('updated',0,'conflict',true,'lock_owner',v_lock.operador_nome,'lock_expires',v_lock.expires_at);
  END IF;
  SELECT public.tele_registrar_ligacao(
    _client_id,_nome,_senha,_tabela,_id,_ligacao_status,_cidade,_bairro,
    _vota_candidato,_candidato_alternativo,_observacao,_proxima_tentativa_em,
    _candidato_federal,_federal_status,_candidato_senador,_senador_status,
    _candidato_governador,_governador_status
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.tele_registrar_ligacao_sessao(uuid,text,text,text,uuid,text,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_registrar_ligacao_sessao(uuid,text,text,text,uuid,text,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text) TO anon, authenticated;