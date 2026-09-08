-- Devolve para uma fila todos os telefones marcados como inválidos.
-- O histórico e o número de tentativas são preservados.
CREATE OR REPLACE FUNCTION public.tele_retrabalhar_invalidos_fila(
  _client_id uuid, _campanha_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_total integer := 0; v_n integer := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);
  IF NOT EXISTS (SELECT 1 FROM public.telemarketing_campanhas WHERE id=_campanha_id AND client_id=_client_id) THEN
    RAISE EXCEPTION 'Fila não encontrada';
  END IF;

  -- Sem esta limpeza, o bloqueio definitivo por telefone impediria uma nova ligação.
  DELETE FROM public.telemarketing_phone_outcomes o
   WHERE o.client_id=_client_id AND o.ligacao_status='invalido' AND o.telefone_key IN (
    SELECT public.tele_phone_key(c.telefone) FROM public.contratados c WHERE c.client_id=_client_id AND c.campanha_id=_campanha_id AND c.ligacao_status='invalido'
    UNION SELECT public.tele_phone_key(i.telefone) FROM public.contratado_indicados i WHERE i.client_id=_client_id AND i.campanha_id=_campanha_id AND i.ligacao_status='invalido'
    UNION SELECT public.tele_phone_key(a.telefone) FROM public.telemarketing_contatos_avulsos a WHERE a.client_id=_client_id AND a.campanha_id=_campanha_id AND a.ligacao_status='invalido'
    UNION SELECT public.tele_phone_key(i.telefone) FROM public.eleicao_indicados i WHERE i.client_id=_client_id AND i.campanha_id=_campanha_id AND (i.ultimo_status_ligacao='invalido' OR i.status_telemarketing='descartado')
    UNION SELECT public.tele_phone_key(p.telefone) FROM public.eleicao_pessoas p WHERE p.client_id=_client_id AND p.campanha_id=_campanha_id AND p.ligacao_status='invalido'
  );

  -- Elimina eventual reserva antiga desses contatos antes de reabri-los.
  DELETE FROM public.telemarketing_call_assignments a WHERE a.client_id=_client_id AND (
    (a.tabela='contratados' AND EXISTS (SELECT 1 FROM public.contratados c WHERE c.id=a.contato_id AND c.client_id=_client_id AND c.campanha_id=_campanha_id AND c.ligacao_status='invalido')) OR
    (a.tabela='contratado_indicados' AND EXISTS (SELECT 1 FROM public.contratado_indicados i WHERE i.id=a.contato_id AND i.client_id=_client_id AND i.campanha_id=_campanha_id AND i.ligacao_status='invalido')) OR
    (a.tabela='contatos_avulsos' AND EXISTS (SELECT 1 FROM public.telemarketing_contatos_avulsos av WHERE av.id=a.contato_id AND av.client_id=_client_id AND av.campanha_id=_campanha_id AND av.ligacao_status='invalido')) OR
    (a.tabela='eleicao_indicados' AND EXISTS (SELECT 1 FROM public.eleicao_indicados i WHERE i.id=a.contato_id AND i.client_id=_client_id AND i.campanha_id=_campanha_id AND (i.ultimo_status_ligacao='invalido' OR i.status_telemarketing='descartado'))) OR
    (a.tabela='eleicao_pessoas' AND EXISTS (SELECT 1 FROM public.eleicao_pessoas p WHERE p.id=a.contato_id AND p.client_id=_client_id AND p.campanha_id=_campanha_id AND p.ligacao_status='invalido'))
  );

  UPDATE public.contratados SET ligacao_status='pendente',proxima_tentativa_em=NULL WHERE client_id=_client_id AND campanha_id=_campanha_id AND ligacao_status='invalido';
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;
  UPDATE public.contratado_indicados SET ligacao_status='pendente',proxima_tentativa_em=NULL WHERE client_id=_client_id AND campanha_id=_campanha_id AND ligacao_status='invalido';
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;
  UPDATE public.telemarketing_contatos_avulsos SET ligacao_status='pendente',proxima_tentativa_em=NULL WHERE client_id=_client_id AND campanha_id=_campanha_id AND ligacao_status='invalido';
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;
  UPDATE public.eleicao_indicados SET ultimo_status_ligacao='pendente',status_telemarketing='pendente',proxima_tentativa_em=NULL WHERE client_id=_client_id AND campanha_id=_campanha_id AND (ultimo_status_ligacao='invalido' OR status_telemarketing='descartado');
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;
  UPDATE public.eleicao_pessoas SET ligacao_status='pendente',proxima_tentativa_em=NULL WHERE client_id=_client_id AND campanha_id=_campanha_id AND ligacao_status='invalido';
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total:=v_total+v_n;

  RETURN jsonb_build_object('ok',true,'reabertos',v_total);
END;
$function$;
REVOKE ALL ON FUNCTION public.tele_retrabalhar_invalidos_fila(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tele_retrabalhar_invalidos_fila(uuid,uuid) TO authenticated;
