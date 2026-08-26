CREATE OR REPLACE FUNCTION public.tele_list_contatos(_client_id uuid, _nome text, _senha text, _campanha_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, nome text, telefone text, cidade text, bairro text, ligacao_status text, vota_candidato text, candidato_alternativo text, operador_nome text, ligacao_em timestamp with time zone, tipo text, tabela text, proxima_tentativa_em timestamp with time zone, tentativas_count integer, observacao_tele text, locked_by text, locked_until timestamp with time zone, campanha_id uuid, indicador_nome text, indicador_tipo text, lista_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_op_id uuid;
  v_lista_id uuid;
BEGIN
  v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);

  SELECT op.lista_atual_id INTO v_lista_id
    FROM public.telemarketing_operadores AS op
   WHERE op.id = v_op_id;

  RETURN QUERY
  WITH allowed AS (
    SELECT co.campanha_id FROM public.telemarketing_campanha_operadores co
     WHERE co.client_id = _client_id AND co.operador_id = v_op_id AND co.ativo = true
  )
    SELECT av.id, av.nome, av.telefone, av.cidade, av.bairro,
           av.ligacao_status, av.vota_candidato, av.candidato_alternativo,
           av.operador_nome, av.ligacao_em, 'avulso'::text, 'contatos_avulsos'::text,
           av.proxima_tentativa_em, COALESCE(av.tentativas_count, 0), av.observacao_tele,
           a.operador_nome, a.expires_at, av.campanha_id,
           NULL::text, NULL::text, av.lista_id
      FROM public.telemarketing_contatos_avulsos AS av
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = av.client_id AND a.tabela = 'contatos_avulsos'
       AND a.contato_id = av.id AND a.expires_at > now()
     WHERE av.client_id = _client_id
       AND av.ativo = true
       AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
       AND av.campanha_id IN (SELECT allowed.campanha_id FROM allowed AS allowed)
       AND public.tele_assign_visivel(_client_id, av.campanha_id, av.assigned_operador_id, v_op_id)
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
       AND c.campanha_id IN (SELECT allowed.campanha_id FROM allowed AS allowed)

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
       AND i.campanha_id IN (SELECT allowed.campanha_id FROM allowed AS allowed)

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
       AND ei.campanha_id IN (SELECT allowed.campanha_id FROM allowed AS allowed)
       AND public.tele_assign_visivel(_client_id, ei.campanha_id, ei.assigned_operador_id, v_op_id)

    UNION ALL

    SELECT pe.id, pe.nome, pe.telefone, pe.cidade, pe.bairro,
           pe.ligacao_status, pe.vota_candidato, pe.candidato_alternativo,
           pe.operador_nome, pe.ligacao_em, 'estrutura'::text, 'eleicao_pessoas'::text,
           pe.proxima_tentativa_em, COALESCE(pe.tentativas_count, 0), pe.observacao_tele,
           a.operador_nome, a.expires_at, pe.campanha_id,
           NULL::text, pe.tipo::text, NULL::uuid
      FROM public.eleicao_pessoas AS pe
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = pe.client_id AND a.tabela = 'eleicao_pessoas'
       AND a.contato_id = pe.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND pe.client_id = _client_id
       AND pe.campanha_id IS NOT NULL
       AND pe.telefone IS NOT NULL AND length(btrim(pe.telefone)) >= 8
       AND (_campanha_id IS NULL OR pe.campanha_id = _campanha_id)
       AND pe.campanha_id IN (SELECT allowed.campanha_id FROM allowed AS allowed)
       AND public.tele_assign_visivel(_client_id, pe.campanha_id, pe.assigned_operador_id, v_op_id);
END;
$function$;