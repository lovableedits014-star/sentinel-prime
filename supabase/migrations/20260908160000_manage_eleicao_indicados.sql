-- Gerenciamento seguro de indicados: editar/reativar, transferir e excluir.

CREATE OR REPLACE FUNCTION public.eleicao_editar_indicado(
  _client_id uuid,_id uuid,_nome text,_telefone text,_bairro text,_cidade text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tel text; v_old_tel text;
BEGIN
  IF NOT public.user_can_access_client(_client_id) THEN RAISE EXCEPTION 'Sem permissao' USING ERRCODE='42501'; END IF;
  v_tel:=regexp_replace(coalesce(_telefone,''),'\D','','g');
  IF length(trim(coalesce(_nome,'')))<2 OR length(v_tel) NOT IN (10,11) THEN RETURN jsonb_build_object('ok',false,'motivo','dados_invalidos'); END IF;
  SELECT telefone_norm INTO v_old_tel FROM public.eleicao_indicados WHERE id=_id AND client_id=_client_id FOR UPDATE;
  IF v_old_tel IS NULL THEN RETURN jsonb_build_object('ok',false,'motivo','nao_encontrado'); END IF;
  IF EXISTS(SELECT 1 FROM public.eleicao_indicados WHERE client_id=_client_id AND telefone_norm=v_tel AND id<>_id) THEN
    RETURN jsonb_build_object('ok',false,'motivo','telefone_duplicado');
  END IF;
  UPDATE public.eleicao_indicados SET nome=trim(_nome),telefone=v_tel,telefone_norm=v_tel,bairro=nullif(trim(coalesce(_bairro,'')),''),
    cidade=coalesce(nullif(trim(coalesce(_cidade,'')),''),cidade),status_telemarketing='pendente',ultimo_status_ligacao=NULL,
    ultima_ligacao_em=NULL,total_tentativas=0,proxima_tentativa_em=NULL,operador_nome=NULL,vota_candidato=NULL,
    candidato_alternativo=NULL,observacao_tele=NULL,assigned_operador_id=NULL
  WHERE id=_id AND client_id=_client_id;
  DELETE FROM public.telemarketing_call_assignments WHERE client_id=_client_id AND tabela='eleicao_indicados' AND contato_id=_id;
  UPDATE public.telemarketing_inactive_contacts SET reativado_em=now(),reativado_por='edicao_cadastro'
    WHERE client_id=_client_id AND tabela='eleicao_indicados' AND contato_id=_id AND reativado_em IS NULL;
  DELETE FROM public.telemarketing_phone_outcomes WHERE client_id=_client_id AND telefone_key IN (v_old_tel,v_tel);
  RETURN jsonb_build_object('ok',true,'voltou_para_fila',true);
END $$;
REVOKE ALL ON FUNCTION public.eleicao_editar_indicado(uuid,uuid,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eleicao_editar_indicado(uuid,uuid,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_transferir_indicado(_client_id uuid,_id uuid,_novo_indicador_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_old_token uuid; v_new_token uuid;
BEGIN
  IF NOT public.user_can_access_client(_client_id) THEN RAISE EXCEPTION 'Sem permissao' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.eleicao_pessoas WHERE id=_novo_indicador_id AND client_id=_client_id) THEN RETURN jsonb_build_object('ok',false,'motivo','indicador_invalido'); END IF;
  SELECT token_id INTO v_old_token FROM public.eleicao_indicados WHERE id=_id AND client_id=_client_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'motivo','nao_encontrado'); END IF;
  SELECT id INTO v_new_token FROM public.eleicao_indicacao_tokens WHERE indicador_id=_novo_indicador_id AND revoked_at IS NULL ORDER BY created_at DESC LIMIT 1;
  UPDATE public.eleicao_indicados SET indicador_id=_novo_indicador_id,
    indicador_tipo=(SELECT tipo FROM public.eleicao_pessoas WHERE id=_novo_indicador_id),token_id=v_new_token
  WHERE id=_id AND client_id=_client_id;
  IF v_old_token IS NOT NULL THEN UPDATE public.eleicao_indicacao_tokens SET total_indicacoes=greatest(total_indicacoes-1,0) WHERE id=v_old_token; END IF;
  IF v_new_token IS NOT NULL THEN UPDATE public.eleicao_indicacao_tokens SET total_indicacoes=total_indicacoes+1 WHERE id=v_new_token; END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.eleicao_transferir_indicado(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eleicao_transferir_indicado(uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_excluir_indicado(_client_id uuid,_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tel text;
BEGIN
  IF NOT public.user_can_access_client(_client_id) THEN RAISE EXCEPTION 'Sem permissao' USING ERRCODE='42501'; END IF;
  SELECT telefone_norm INTO v_tel FROM public.eleicao_indicados WHERE id=_id AND client_id=_client_id;
  DELETE FROM public.telemarketing_call_assignments WHERE client_id=_client_id AND tabela='eleicao_indicados' AND contato_id=_id;
  DELETE FROM public.telemarketing_inactive_contacts WHERE client_id=_client_id AND tabela='eleicao_indicados' AND contato_id=_id;
  DELETE FROM public.telemarketing_phone_outcomes WHERE client_id=_client_id AND telefone_key=v_tel;
  DELETE FROM public.eleicao_indicados WHERE id=_id AND client_id=_client_id;
  RETURN jsonb_build_object('ok',FOUND);
END $$;
REVOKE ALL ON FUNCTION public.eleicao_excluir_indicado(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eleicao_excluir_indicado(uuid,uuid) TO authenticated;
