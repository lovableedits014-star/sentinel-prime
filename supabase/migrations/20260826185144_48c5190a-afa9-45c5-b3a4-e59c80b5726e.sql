-- 1) Remove overloads legados (causavam ambiguidade no PostgREST ao salvar)
DROP FUNCTION IF EXISTS public.tele_registrar_ligacao(uuid,text,text,text,uuid,text,text,text,text,text,text,timestamptz);
DROP FUNCTION IF EXISTS public.tele_claim_contato(uuid,text,text,text,uuid,integer);
DROP FUNCTION IF EXISTS public.tele_heartbeat_contato(uuid,text,text,text,uuid,integer);
DROP FUNCTION IF EXISTS public.tele_release_contato(uuid,text,text,text,uuid);
DROP FUNCTION IF EXISTS public.tele_proximo_contato(uuid,text,text,uuid,integer);

-- 2) tele_fila_set_operadores: ao mudar os operadores da fila, redistribui os contatos
CREATE OR REPLACE FUNCTION public.tele_fila_set_operadores(_client_id uuid, _campanha_id uuid, _operador_ids uuid[], _modo text DEFAULT 'compartilhada'::text, _acao_remocao text DEFAULT 'devolver'::text, _repassar_para uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_removidos uuid[];
  v_afetados integer := 0;
  v_n integer;
  v_modo text;
  v_qtd integer;
  v_ids uuid[] := COALESCE(_operador_ids, ARRAY[]::uuid[]);
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF NOT EXISTS (SELECT 1 FROM public.telemarketing_campanhas c
                  WHERE c.id = _campanha_id AND c.client_id = _client_id) THEN
    RAISE EXCEPTION 'Fila não encontrada';
  END IF;

  IF _acao_remocao = 'repassar' AND _repassar_para IS NULL THEN
    RAISE EXCEPTION 'Escolha o operador que vai receber os contatos';
  END IF;

  v_modo := CASE WHEN _modo IN ('compartilhada','dividida') THEN _modo ELSE 'compartilhada' END;

  SELECT COALESCE(array_agg(co.operador_id), ARRAY[]::uuid[]) INTO v_removidos
    FROM public.telemarketing_campanha_operadores co
   WHERE co.campanha_id = _campanha_id AND co.ativo = true
     AND NOT (co.operador_id = ANY (v_ids));

  UPDATE public.telemarketing_campanha_operadores
     SET ativo = false
   WHERE campanha_id = _campanha_id AND ativo = true AND NOT (operador_id = ANY (v_ids));

  INSERT INTO public.telemarketing_campanha_operadores (client_id, campanha_id, operador_id, ativo)
  SELECT _client_id, _campanha_id, x, true
    FROM unnest(v_ids) AS x
  ON CONFLICT (campanha_id, operador_id) DO UPDATE SET ativo = true, updated_at = now();

  UPDATE public.telemarketing_campanhas
     SET modo_designacao = v_modo
   WHERE id = _campanha_id AND client_id = _client_id;

  -- contatos de quem saiu
  IF array_length(v_removidos, 1) IS NOT NULL AND _acao_remocao <> 'manter' THEN
    UPDATE public.telemarketing_contatos_avulsos
       SET assigned_operador_id = CASE WHEN _acao_remocao = 'repassar' THEN _repassar_para ELSE NULL END
     WHERE client_id = _client_id AND campanha_id = _campanha_id
       AND assigned_operador_id = ANY (v_removidos);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_afetados := v_afetados + v_n;

    UPDATE public.eleicao_indicados
       SET assigned_operador_id = CASE WHEN _acao_remocao = 'repassar' THEN _repassar_para ELSE NULL END
     WHERE client_id = _client_id AND campanha_id = _campanha_id
       AND assigned_operador_id = ANY (v_removidos);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_afetados := v_afetados + v_n;

    UPDATE public.eleicao_pessoas
       SET assigned_operador_id = CASE WHEN _acao_remocao = 'repassar' THEN _repassar_para ELSE NULL END
     WHERE client_id = _client_id AND campanha_id = _campanha_id
       AND assigned_operador_id = ANY (v_removidos);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_afetados := v_afetados + v_n;
  END IF;

  -- CORREÇÃO: fila compartilhada -> nenhum contato pendente fica preso a um operador
  IF v_modo = 'compartilhada' THEN
    UPDATE public.telemarketing_contatos_avulsos
       SET assigned_operador_id = NULL
     WHERE client_id = _client_id AND campanha_id = _campanha_id
       AND assigned_operador_id IS NOT NULL
       AND COALESCE(ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou');
    UPDATE public.eleicao_indicados
       SET assigned_operador_id = NULL
     WHERE client_id = _client_id AND campanha_id = _campanha_id
       AND assigned_operador_id IS NOT NULL
       AND COALESCE(ultimo_status_ligacao,'pendente') IN ('pendente','nao_atendeu','reagendou');
    UPDATE public.eleicao_pessoas
       SET assigned_operador_id = NULL
     WHERE client_id = _client_id AND campanha_id = _campanha_id
       AND assigned_operador_id IS NOT NULL
       AND COALESCE(ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou');
  ELSIF array_length(v_ids,1) IS NOT NULL THEN
    -- fila dividida -> redistribui os pendentes igualmente entre os operadores marcados
    v_qtd := array_length(v_ids,1);
    WITH numbered AS (
      SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS rn
        FROM public.telemarketing_contatos_avulsos
       WHERE client_id = _client_id AND campanha_id = _campanha_id
         AND COALESCE(ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
    )
    UPDATE public.telemarketing_contatos_avulsos t
       SET assigned_operador_id = v_ids[(n.rn % v_qtd) + 1]
      FROM numbered n
     WHERE t.id = n.id;

    WITH numbered AS (
      SELECT id, row_number() OVER (ORDER BY created_at, id) - 1 AS rn
        FROM public.eleicao_indicados
       WHERE client_id = _client_id AND campanha_id = _campanha_id
         AND COALESCE(ultimo_status_ligacao,'pendente') IN ('pendente','nao_atendeu','reagendou')
    )
    UPDATE public.eleicao_indicados t
       SET assigned_operador_id = v_ids[(n.rn % v_qtd) + 1]
      FROM numbered n
     WHERE t.id = n.id;
  END IF;

  DELETE FROM public.telemarketing_call_assignments a
   WHERE a.client_id = _client_id
     AND a.operador_nome IN (SELECT o.nome FROM public.telemarketing_operadores o
                              WHERE o.id = ANY (COALESCE(v_removidos, ARRAY[]::uuid[])));

  RETURN jsonb_build_object(
    'ok', true,
    'marcados', COALESCE(array_length(v_ids,1),0),
    'removidos', COALESCE(array_length(v_removidos,1),0),
    'contatos_afetados', v_afetados
  );
END;
$function$;

-- 3) Rede de segurança: contato reservado para operador que não está mais na fila volta ao pool
CREATE OR REPLACE FUNCTION public.tele_assign_visivel(_client_id uuid, _campanha_id uuid, _assigned uuid, _op_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _assigned IS NULL
      OR _assigned = _op_id
      OR NOT EXISTS (
           SELECT 1 FROM public.telemarketing_campanha_operadores co
            WHERE co.client_id = _client_id
              AND co.campanha_id = _campanha_id
              AND co.operador_id = _assigned
              AND co.ativo = true);
$$;

-- 4) Normaliza filas compartilhadas existentes (ISA, ISA + 1, etc.)
UPDATE public.telemarketing_contatos_avulsos av
   SET assigned_operador_id = NULL
  FROM public.telemarketing_campanhas c
 WHERE c.id = av.campanha_id
   AND c.client_id = av.client_id
   AND COALESCE(c.modo_designacao,'compartilhada') = 'compartilhada'
   AND av.assigned_operador_id IS NOT NULL
   AND COALESCE(av.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou');

UPDATE public.eleicao_indicados ei
   SET assigned_operador_id = NULL
  FROM public.telemarketing_campanhas c
 WHERE c.id = ei.campanha_id
   AND c.client_id = ei.client_id
   AND COALESCE(c.modo_designacao,'compartilhada') = 'compartilhada'
   AND ei.assigned_operador_id IS NOT NULL
   AND COALESCE(ei.ultimo_status_ligacao,'pendente') IN ('pendente','nao_atendeu','reagendou');
