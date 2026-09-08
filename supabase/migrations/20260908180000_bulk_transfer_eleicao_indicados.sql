-- Transfere vários indicados de uma vez, mantendo os contadores dos links corretos.
CREATE OR REPLACE FUNCTION public.eleicao_transferir_indicados_lote(
  _client_id uuid,_ids uuid[],_novo_indicador_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_new_token uuid; v_count integer; v_old record;
BEGIN
  IF NOT public.user_can_access_client(_client_id) THEN RAISE EXCEPTION 'Sem permissao' USING ERRCODE='42501'; END IF;
  IF coalesce(array_length(_ids,1),0)=0 THEN RETURN jsonb_build_object('ok',false,'motivo','selecao_vazia'); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.eleicao_pessoas WHERE id=_novo_indicador_id AND client_id=_client_id) THEN
    RETURN jsonb_build_object('ok',false,'motivo','indicador_invalido');
  END IF;
  SELECT id INTO v_new_token FROM public.eleicao_indicacao_tokens
   WHERE indicador_id=_novo_indicador_id AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1;
  FOR v_old IN SELECT token_id,count(*) qtd FROM public.eleicao_indicados
    WHERE client_id=_client_id AND id=ANY(_ids) AND indicador_id<>_novo_indicador_id GROUP BY token_id
  LOOP
    IF v_old.token_id IS NOT NULL THEN UPDATE public.eleicao_indicacao_tokens
      SET total_indicacoes=greatest(total_indicacoes-v_old.qtd::integer,0) WHERE id=v_old.token_id; END IF;
  END LOOP;
  UPDATE public.eleicao_indicados SET indicador_id=_novo_indicador_id,
    indicador_tipo=(SELECT tipo FROM public.eleicao_pessoas WHERE id=_novo_indicador_id),token_id=v_new_token
  WHERE client_id=_client_id AND id=ANY(_ids) AND indicador_id<>_novo_indicador_id;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_new_token IS NOT NULL THEN UPDATE public.eleicao_indicacao_tokens
    SET total_indicacoes=total_indicacoes+v_count WHERE id=v_new_token; END IF;
  RETURN jsonb_build_object('ok',true,'transferidos',v_count);
END $$;
REVOKE ALL ON FUNCTION public.eleicao_transferir_indicados_lote(uuid,uuid[],uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eleicao_transferir_indicados_lote(uuid,uuid[],uuid) TO authenticated;
