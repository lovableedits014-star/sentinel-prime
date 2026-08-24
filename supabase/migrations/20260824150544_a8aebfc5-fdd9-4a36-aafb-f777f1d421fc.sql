CREATE OR REPLACE FUNCTION public.tele_list_contatos(
  _client_id uuid,
  _nome text,
  _senha text,
  _campanha_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid,
  nome text,
  telefone text,
  cidade text,
  bairro text,
  ligacao_status text,
  vota_candidato text,
  candidato_alternativo text,
  operador_nome text,
  ligacao_em timestamptz,
  tipo text,
  tabela text,
  proxima_tentativa_em timestamptz,
  tentativas_count integer,
  observacao_tele text,
  locked_by text,
  locked_until timestamptz,
  campanha_id uuid,
  indicador_nome text,
  indicador_tipo text,
  lista_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_op_id uuid;
  v_lista_id uuid;
BEGIN
  v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);

  SELECT op.lista_atual_id
    INTO v_lista_id
    FROM public.telemarketing_operadores AS op
   WHERE op.id = v_op_id;

  RETURN QUERY
    SELECT av.id, av.nome, av.telefone, av.cidade, av.bairro,
           av.ligacao_status, av.vota_candidato, av.candidato_alternativo,
           av.operador_nome, av.ligacao_em, 'avulso'::text, 'contatos_avulsos'::text,
           av.proxima_tentativa_em, COALESCE(av.tentativas_count, 0), av.observacao_tele,
           a.operador_nome, a.expires_at, av.campanha_id,
           NULL::text, NULL::text, av.lista_id
      FROM public.telemarketing_contatos_avulsos AS av
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = av.client_id
       AND a.tabela = 'contatos_avulsos'
       AND a.contato_id = av.id
       AND a.expires_at > now()
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
        ON a.client_id = c.client_id
       AND a.tabela = 'contratados'
       AND a.contato_id = c.id
       AND a.expires_at > now()
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
        ON a.client_id = i.client_id
       AND a.tabela = 'contratado_indicados'
       AND a.contato_id = i.id
       AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND i.client_id = _client_id
       AND (_campanha_id IS NULL OR i.campanha_id = _campanha_id);
END;
$function$;