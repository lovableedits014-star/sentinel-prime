CREATE OR REPLACE FUNCTION public.tele_resetar_fila(_client_id uuid, _campanha_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_total integer := 0; v_n integer := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  UPDATE public.contratados
     SET ligacao_status='pendente', proxima_tentativa_em=NULL
   WHERE client_id=_client_id AND campanha_id=_campanha_id
     AND ligacao_status IN ('nao_atendeu','reagendou');
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total := v_total + v_n;

  UPDATE public.contratado_indicados
     SET ligacao_status='pendente', proxima_tentativa_em=NULL
   WHERE client_id=_client_id AND campanha_id=_campanha_id
     AND ligacao_status IN ('nao_atendeu','reagendou');
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total := v_total + v_n;

  UPDATE public.telemarketing_contatos_avulsos
     SET ligacao_status='pendente', proxima_tentativa_em=NULL
   WHERE client_id=_client_id AND campanha_id=_campanha_id
     AND ligacao_status IN ('nao_atendeu','reagendou');
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total := v_total + v_n;

  UPDATE public.eleicao_indicados
     SET ultimo_status_ligacao='pendente', proxima_tentativa_em=NULL,
         status_telemarketing='pendente'
   WHERE client_id=_client_id AND campanha_id=_campanha_id
     AND ultimo_status_ligacao IN ('nao_atendeu','reagendou');
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total := v_total + v_n;

  UPDATE public.eleicao_pessoas
     SET ligacao_status='pendente', proxima_tentativa_em=NULL
   WHERE client_id=_client_id AND campanha_id=_campanha_id
     AND ligacao_status IN ('nao_atendeu','reagendou');
  GET DIAGNOSTICS v_n=ROW_COUNT; v_total := v_total + v_n;

  DELETE FROM public.telemarketing_call_assignments
   WHERE client_id=_client_id
     AND expires_at <= now();

  RETURN jsonb_build_object('reabertos', v_total);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tele_resetar_fila(uuid, uuid) TO authenticated;