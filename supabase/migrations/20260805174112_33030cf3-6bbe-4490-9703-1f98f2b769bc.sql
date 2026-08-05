
-- 7. Atualizar tele_proximo_contato para respeitar a lista_atual_id do operador
DROP FUNCTION IF EXISTS public.tele_proximo_contato(uuid, text, text, uuid, integer);

CREATE OR REPLACE FUNCTION public.tele_proximo_contato(
  _client_id uuid,
  _nome text,
  _senha text,
  _campanha_id uuid DEFAULT NULL::uuid,
  _ttl_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_expires timestamptz;
  v_cand record;
  v_inserted boolean;
  v_op_id uuid;
  v_lista_id uuid;
BEGIN
  -- Tentar pegar o ID do operador (compatibilidade com ambas as versões do assert)
  BEGIN
    v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._tele_assert_operador(_client_id, _nome, _senha);
    SELECT id INTO v_op_id FROM public.telemarketing_operadores
      WHERE client_id = _client_id AND nome = _nome AND ativo = true LIMIT 1;
  END;
  
  -- Verificar se o operador tem uma lista específica designada
  SELECT lista_atual_id INTO v_lista_id FROM public.telemarketing_operadores WHERE id = v_op_id;

  DELETE FROM public.telemarketing_call_assignments WHERE expires_at < now();
  v_expires := now() + make_interval(secs => GREATEST(_ttl_seconds, 60));

  FOR v_cand IN
    WITH locked_phones AS (
      SELECT DISTINCT lower(btrim(COALESCE(
        (SELECT telefone FROM public.contratados WHERE id=a.contato_id AND a.tabela='contratados'),
        (SELECT telefone FROM public.contratado_indicados WHERE id=a.contato_id AND a.tabela='contratado_indicados'),
        (SELECT telefone FROM public.telemarketing_contatos_avulsos WHERE id=a.contato_id AND a.tabela='contatos_avulsos'),
        (SELECT telefone FROM public.eleicao_indicados WHERE id=a.contato_id AND a.tabela='eleicao_indicados'),
        (SELECT telefone FROM public.eleicao_pessoas WHERE id=a.contato_id AND a.tabela='eleicao_pessoas')
      ))) AS tel
      FROM public.telemarketing_call_assignments a
      WHERE a.client_id = _client_id
        AND a.expires_at > now()
        AND a.operador_nome <> _nome
    ),
    candidates AS (
      -- Se tiver lista_id, PRIORIZAR contatos dessa lista
      SELECT 'contatos_avulsos'::text as tabela, av.id, av.telefone,
             COALESCE(av.tentativas_count,0) AS tentativas, av.created_at, av.ligacao_status, av.proxima_tentativa_em,
             CASE WHEN av.lista_id = v_lista_id THEN 0 ELSE 1 END as priority
      FROM public.telemarketing_contatos_avulsos av
      WHERE av.client_id = _client_id
        AND av.ativo = true
        AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
        AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id = v_op_id)
        AND (v_lista_id IS NULL OR av.lista_id = v_lista_id)
        AND COALESCE(av.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      
      UNION ALL
      
      -- Outras origens (apenas se não estiver travado em uma lista)
      SELECT 'contratados'::text AS tabela, c.id, c.telefone,
             COALESCE(c.tentativas_count, 0) AS tentativas,
             c.created_at, c.ligacao_status, c.proxima_tentativa_em, 2 as priority
      FROM public.contratados c
      WHERE v_lista_id IS NULL AND c.client_id = _client_id
        AND (_campanha_id IS NULL OR c.campanha_id = _campanha_id)
        AND COALESCE(c.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      
      UNION ALL
      
      SELECT 'contratado_indicados'::text as tabela, i.id, i.telefone,
             COALESCE(i.tentativas_count,0) as tentativas, i.created_at, i.ligacao_status, i.proxima_tentativa_em, 2 as priority
      FROM public.contratado_indicados i
      WHERE v_lista_id IS NULL AND i.client_id = _client_id
        AND (_campanha_id IS NULL OR i.campanha_id = _campanha_id)
        AND COALESCE(i.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
        
      UNION ALL
      
      SELECT 'eleicao_indicados'::text as tabela, ei.id, ei.telefone,
             COALESCE(ei.total_tentativas,0) as tentativas, ei.created_at, ei.ultimo_status_ligacao as ligacao_status, ei.proxima_tentativa_em, 2 as priority
      FROM public.eleicao_indicados ei
      WHERE v_lista_id IS NULL AND ei.client_id = _client_id
        AND ei.campanha_id IS NOT NULL
        AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
        AND COALESCE(ei.ultimo_status_ligacao,'pendente') IN ('pendente','nao_atendeu','reagendou')
      
      UNION ALL
      
      SELECT 'eleicao_pessoas'::text as tabela, p.id, p.telefone,
             COALESCE(p.tentativas_count,0) as tentativas, p.created_at, p.ligacao_status, p.proxima_tentativa_em, 2 as priority
      FROM public.eleicao_pessoas p
      WHERE v_lista_id IS NULL AND p.client_id = _client_id
        AND p.telefone IS NOT NULL
        AND length(btrim(p.telefone)) >= 8
        AND (_campanha_id IS NULL OR p.campanha_id = _campanha_id)
        AND COALESCE(p.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
    )
    SELECT c.tabela, c.id, c.telefone, c.tentativas, c.created_at
    FROM candidates c
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id = _client_id
     AND a.tabela = c.tabela
     AND a.contato_id = c.id
     AND a.expires_at > now()
    WHERE a.id IS NULL
      AND (c.proxima_tentativa_em IS NULL OR c.proxima_tentativa_em <= now())
      AND lower(btrim(COALESCE(c.telefone,''))) NOT IN (SELECT tel FROM locked_phones WHERE tel IS NOT NULL AND tel <> '')
    ORDER BY
      c.priority ASC,
      CASE WHEN c.ligacao_status IS NULL OR c.ligacao_status = 'pendente' THEN 0 ELSE 1 END,
      c.tentativas ASC,
      c.created_at ASC
    LIMIT 50
  LOOP
    BEGIN
      INSERT INTO public.telemarketing_call_assignments(
        client_id, tabela, contato_id, operador_nome, expires_at)
      VALUES (_client_id, v_cand.tabela, v_cand.id, _nome, v_expires);
      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      v_inserted := false;
    END;

    IF v_inserted THEN
      RETURN jsonb_build_object(
        'found', true,
        'tabela', v_cand.tabela,
        'contato_id', v_cand.id,
        'expires_at', v_expires
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('found', false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tele_proximo_contato(uuid, text, text, uuid, integer) TO anon, authenticated;
