-- Uma nova aba/aparelho do mesmo operador nao pode deixar contatos presos na
-- sessao anterior. Isso substitui a necessidade de remover e recolocar o
-- operador na fila apenas para limpar suas reservas.
CREATE OR REPLACE FUNCTION public.tele_reconcile_operator_session(
  _client_id uuid,
  _nome text,
  _senha text,
  _session_id text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_op_id uuid;
  v_nome_canonico text;
  v_session text;
  v_liberadas integer := 0;
BEGIN
  v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);
  v_session := NULLIF(btrim(_session_id), '');

  IF v_session IS NULL THEN
    RAISE EXCEPTION 'Sessao do operador nao informada';
  END IF;

  SELECT o.nome INTO v_nome_canonico
    FROM public.telemarketing_operadores o
   WHERE o.id = v_op_id AND o.client_id = _client_id;

  -- Serializa a troca de sessao deste operador. Uma identidade de operador
  -- representa um unico posto de atendimento ativo por vez.
  PERFORM pg_advisory_xact_lock(hashtextextended(_client_id::text || ':' || v_op_id::text, 0));

  DELETE FROM public.telemarketing_call_assignments a
   WHERE a.client_id = _client_id
     AND a.operador_nome = v_nome_canonico
     AND a.session_id IS DISTINCT FROM v_session;
  GET DIAGNOSTICS v_liberadas = ROW_COUNT;

  DELETE FROM public.telemarketing_call_assignments WHERE expires_at <= now();

  RETURN jsonb_build_object(
    'ok', true,
    'operador_id', v_op_id,
    'reservas_sessoes_anteriores_liberadas', v_liberadas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.tele_reconcile_operator_session(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_reconcile_operator_session(uuid,text,text,text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
