-- Remove os operadores de teste solicitados e desfaz somente os atendimentos
-- cujo ultimo registro ainda pertence a um deles. Contatos reais sao preservados
-- e voltam para a fila como pendentes.
DO $cleanup$
DECLARE
  v_client_id constant uuid := '6879803f-fd2e-4a43-8d0d-4417e1b1fe15';
  v_operator_ids uuid[];
BEGIN
  SELECT COALESCE(array_agg(o.id), ARRAY[]::uuid[])
    INTO v_operator_ids
    FROM public.telemarketing_operadores o
   WHERE o.client_id = v_client_id
     AND lower(btrim(o.nome)) = ANY (ARRAY['operador1', 'teste admin']);

  -- Remove historicos e travas registrados pelos dois operadores de teste.
  DELETE FROM public.telemarketing_call_log
   WHERE client_id = v_client_id
     AND lower(btrim(operador_nome)) = ANY (ARRAY['operador1', 'teste admin']);

  DELETE FROM public.telemarketing_call_assignments
   WHERE client_id = v_client_id
     AND lower(btrim(operador_nome)) = ANY (ARRAY['operador1', 'teste admin']);

  DELETE FROM public.telemarketing_operador_audit
   WHERE client_id = v_client_id
     AND lower(btrim(operador_nome)) = ANY (ARRAY['operador1', 'teste admin']);

  DELETE FROM public.telemarketing_assignment_log
   WHERE client_id = v_client_id
     AND operador_id = ANY (v_operator_ids);

  -- Limpa resultados somente quando o ultimo atendimento do contato foi feito
  -- por um operador de teste. Dados cadastrais do contato nao sao apagados.
  UPDATE public.contratados
     SET ligacao_status = 'pendente', operador_nome = NULL, ligacao_em = NULL,
         tentativas_count = 0, proxima_tentativa_em = NULL, observacao_tele = NULL,
         vota_candidato = NULL, candidato_alternativo = NULL,
         candidato_federal = NULL, federal_status = NULL,
         candidato_senador = NULL, senador_status = NULL,
         candidato_governador = NULL, governador_status = NULL
   WHERE client_id = v_client_id
     AND lower(btrim(operador_nome)) = ANY (ARRAY['operador1', 'teste admin']);

  UPDATE public.contratado_indicados
     SET status = 'pendente', ligacao_status = 'pendente', operador_nome = NULL, ligacao_em = NULL,
         tentativas_count = 0, proxima_tentativa_em = NULL, observacao_tele = NULL,
         vota_candidato = NULL, candidato_alternativo = NULL,
         candidato_federal = NULL, federal_status = NULL,
         candidato_senador = NULL, senador_status = NULL,
         candidato_governador = NULL, governador_status = NULL
   WHERE client_id = v_client_id
     AND lower(btrim(operador_nome)) = ANY (ARRAY['operador1', 'teste admin']);

  UPDATE public.telemarketing_contatos_avulsos
     SET ligacao_status = 'pendente', operador_nome = NULL, ligacao_em = NULL,
         tentativas_count = 0, proxima_tentativa_em = NULL, observacao_tele = NULL,
         vota_candidato = NULL, candidato_alternativo = NULL,
         candidato_federal = NULL, federal_status = NULL,
         candidato_senador = NULL, senador_status = NULL,
         candidato_governador = NULL, governador_status = NULL
   WHERE client_id = v_client_id
     AND lower(btrim(operador_nome)) = ANY (ARRAY['operador1', 'teste admin']);

  UPDATE public.eleicao_indicados
     SET status_telemarketing = 'pendente', ultimo_status_ligacao = 'pendente',
         operador_nome = NULL, ultima_ligacao_em = NULL, total_tentativas = 0,
         proxima_tentativa_em = NULL, observacao_tele = NULL,
         vota_candidato = NULL, candidato_alternativo = NULL,
         candidato_federal = NULL, federal_status = NULL,
         candidato_senador = NULL, senador_status = NULL,
         candidato_governador = NULL, governador_status = NULL
   WHERE client_id = v_client_id
     AND lower(btrim(operador_nome)) = ANY (ARRAY['operador1', 'teste admin']);

  UPDATE public.eleicao_pessoas
     SET ligacao_status = 'pendente', operador_nome = NULL, ligacao_em = NULL,
         tentativas_count = 0, proxima_tentativa_em = NULL, observacao_tele = NULL,
         vota_candidato = NULL, candidato_alternativo = NULL,
         candidato_federal = NULL, federal_status = NULL,
         candidato_senador = NULL, senador_status = NULL,
         candidato_governador = NULL, governador_status = NULL
   WHERE client_id = v_client_id
     AND lower(btrim(operador_nome)) = ANY (ARRAY['operador1', 'teste admin']);

  -- FKs de designacao usam ON DELETE SET NULL e vinculos de campanha usam CASCADE.
  DELETE FROM public.telemarketing_operadores
   WHERE client_id = v_client_id
     AND lower(btrim(nome)) = ANY (ARRAY['operador1', 'teste admin']);
END
$cleanup$;
