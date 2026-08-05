-- Migração para isolar operadores em suas listas designadas e evitar escape para lista geral

-- Primeiro, remover a função para poder mudar o tipo de retorno
DROP FUNCTION IF EXISTS public.tele_list_contatos(uuid, text, text, uuid);

-- 1. Atualizar tele_proximo_contato para ser restrito quando houver lista_atual_id
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
  -- Tentar pegar o ID do operador
  BEGIN
    v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);
  EXCEPTION WHEN OTHERS THEN
    SELECT id INTO v_op_id FROM public.telemarketing_operadores
      WHERE client_id = _client_id AND nome = _nome AND ativo = true LIMIT 1;
    IF v_op_id IS NULL THEN
       RAISE EXCEPTION 'Operador inválido';
    END IF;
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
      -- Se tiver lista_id, buscar APENAS contatos dessa lista
      SELECT 'contatos_avulsos'::text as tabela, av.id, av.telefone,
             COALESCE(av.tentativas_count,0) AS tentativas, av.created_at, av.ligacao_status, av.proxima_tentativa_em,
             0 as priority
      FROM public.telemarketing_contatos_avulsos av
      WHERE av.client_id = _client_id
        AND av.ativo = true
        AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
        AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id = v_op_id)
        AND (v_lista_id IS NULL OR av.lista_id = v_lista_id)
        -- Se o operador tem lista travada, ele SÓ pode ver contatos dessa lista
        AND (v_lista_id IS NULL OR av.lista_id IS NOT NULL) 
        AND COALESCE(av.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
      
      UNION ALL
      
      -- Outras origens: SÓ aparecem se o operador NÃO tiver uma lista designada
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
        'expires_at', v_expires,
        'lista_id', v_lista_id
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('found', false, 'lista_id', v_lista_id);
END;
$function$;

-- 2. Recriar tele_list_contatos com o campo lista_id
CREATE OR REPLACE FUNCTION public.tele_list_contatos(
  _client_id uuid,
  _nome text,
  _senha text,
  _campanha_id uuid DEFAULT NULL
) RETURNS TABLE(
  id uuid, nome text, telefone text, cidade text, bairro text,
  ligacao_status text, vota_candidato text, candidato_alternativo text,
  operador_nome text, ligacao_em timestamptz, tipo text, tabela text,
  proxima_tentativa_em timestamptz, tentativas_count integer, observacao_tele text,
  locked_by text, locked_until timestamptz, campanha_id uuid,
  indicador_nome text, indicador_tipo text, lista_id uuid
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  v_op_id uuid;
  v_lista_id uuid;
BEGIN
  v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);
  
  -- Verificar se o operador tem uma lista específica designada
  SELECT lista_atual_id INTO v_lista_id FROM public.telemarketing_operadores WHERE id = v_op_id;

  RETURN QUERY
    -- Contatos Avulsos (única tabela com lista_id)
    SELECT av.id, av.nome, av.telefone, av.cidade, av.bairro,
           av.ligacao_status, av.vota_candidato, av.candidato_alternativo,
           av.operador_nome, av.ligacao_em, 'avulso'::text, 'contatos_avulsos'::text,
           av.proxima_tentativa_em, COALESCE(av.tentativas_count,0), av.observacao_tele,
           a.operador_nome, a.expires_at, av.campanha_id,
           NULL::text, NULL::text, av.lista_id
    FROM public.telemarketing_contatos_avulsos av
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=av.client_id AND a.tabela='contatos_avulsos' AND a.contato_id=av.id AND a.expires_at>now()
    WHERE av.client_id=_client_id AND av.ativo=true
      AND (_campanha_id IS NULL OR av.campanha_id=_campanha_id)
      AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id=v_op_id)
      AND (v_lista_id IS NULL OR av.lista_id=v_lista_id)
    
    UNION ALL
    
    -- Contratados (Apenas se sem lista específica)
    SELECT c.id, c.nome, c.telefone, c.cidade, c.bairro,
           c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
           c.operador_nome, c.ligacao_em,
           CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END, 'contratados'::text,
           c.proxima_tentativa_em, COALESCE(c.tentativas_count,0), c.observacao_tele,
           a.operador_nome, a.expires_at, c.campanha_id,
           NULL::text, NULL::text, NULL::uuid
    FROM public.contratados c
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=c.client_id AND a.tabela='contratados' AND a.contato_id=c.id AND a.expires_at>now()
    WHERE v_lista_id IS NULL AND c.client_id=_client_id
      AND (_campanha_id IS NULL OR c.campanha_id=_campanha_id)

    UNION ALL
    
    -- Outros (Apenas se sem lista específica)
    SELECT i.id, i.nome, i.telefone, i.cidade, i.bairro,
           i.ligacao_status, i.vota_candidato, i.candidato_alternativo,
           i.operador_nome, i.ligacao_em, 'indicado'::text, 'contratado_indicados'::text,
           i.proxima_tentativa_em, COALESCE(i.tentativas_count,0), i.observacao_tele,
           a.operador_nome, a.expires_at, i.campanha_id,
           NULL::text, NULL::text, NULL::uuid
    FROM public.contratado_indicados i
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=i.client_id AND a.tabela='contratado_indicados' AND a.contato_id=i.id AND a.expires_at>now()
    WHERE v_lista_id IS NULL AND i.client_id=_client_id
      AND (_campanha_id IS NULL OR i.campanha_id=_campanha_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_list_contatos(uuid, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tele_proximo_contato(uuid, text, text, uuid, integer) TO anon, authenticated;
