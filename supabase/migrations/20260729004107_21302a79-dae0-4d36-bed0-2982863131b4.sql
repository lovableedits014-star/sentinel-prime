-- 1. Campo template WhatsApp
ALTER TABLE public.telemarketing_campanhas
  ADD COLUMN IF NOT EXISTS whatsapp_template text;

-- 2. Índice para consulta por operador designado
CREATE INDEX IF NOT EXISTS idx_tele_avulsos_assigned
  ON public.telemarketing_contatos_avulsos(client_id, campanha_id, assigned_operador_id, ligacao_status);

-- 3. Importação com dedup — substitui overload de 4 args e remove o de 3 args
DROP FUNCTION IF EXISTS public.tele_import_contato_avulso_batch(uuid, uuid, jsonb);
CREATE OR REPLACE FUNCTION public.tele_import_contato_avulso_batch(
  _client_id uuid,
  _campanha_id uuid,
  _rows jsonb,
  _assigned_operador_id uuid DEFAULT NULL,
  _skip_global_dupes boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inserted int := 0;
  v_skip_same int := 0;
  v_skip_other int := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _assigned_operador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.telemarketing_operadores
     WHERE id = _assigned_operador_id AND client_id = _client_id
  ) THEN
    RAISE EXCEPTION 'Operador inválido' USING ERRCODE='22023';
  END IF;

  -- Materializa as linhas válidas com telefone normalizado
  CREATE TEMP TABLE _tele_import_rows ON COMMIT DROP AS
  SELECT
    NULLIF(trim(r->>'nome'),'')     AS nome,
    regexp_replace(coalesce(r->>'telefone',''), '\D', '', 'g') AS tel_digits,
    NULLIF(trim(r->>'cidade'),'')   AS cidade,
    NULLIF(trim(r->>'bairro'),'')   AS bairro
  FROM jsonb_array_elements(_rows) r;

  DELETE FROM _tele_import_rows
   WHERE nome IS NULL OR tel_digits IS NULL OR length(tel_digits) < 8;

  -- Conta duplicados na mesma campanha
  SELECT count(*) INTO v_skip_same
    FROM _tele_import_rows i
   WHERE EXISTS (
     SELECT 1 FROM public.telemarketing_contatos_avulsos c
      WHERE c.client_id = _client_id
        AND c.campanha_id = _campanha_id
        AND regexp_replace(c.telefone,'\D','','g') = i.tel_digits
   );

  -- Conta duplicados em outras campanhas do mesmo cliente
  SELECT count(*) INTO v_skip_other
    FROM _tele_import_rows i
   WHERE NOT EXISTS (
     SELECT 1 FROM public.telemarketing_contatos_avulsos c
      WHERE c.client_id = _client_id
        AND c.campanha_id = _campanha_id
        AND regexp_replace(c.telefone,'\D','','g') = i.tel_digits
   )
   AND EXISTS (
     SELECT 1 FROM public.telemarketing_contatos_avulsos c
      WHERE c.client_id = _client_id
        AND c.campanha_id <> _campanha_id
        AND regexp_replace(c.telefone,'\D','','g') = i.tel_digits
   );

  -- Insere
  INSERT INTO public.telemarketing_contatos_avulsos(
    client_id, campanha_id, nome, telefone, cidade, bairro, assigned_operador_id
  )
  SELECT _client_id, _campanha_id, i.nome, i.tel_digits, i.cidade, i.bairro, _assigned_operador_id
    FROM _tele_import_rows i
   WHERE NOT EXISTS (
     SELECT 1 FROM public.telemarketing_contatos_avulsos c
      WHERE c.client_id = _client_id
        AND c.campanha_id = _campanha_id
        AND regexp_replace(c.telefone,'\D','','g') = i.tel_digits
   )
   AND (
     NOT _skip_global_dupes
     OR NOT EXISTS (
       SELECT 1 FROM public.telemarketing_contatos_avulsos c
        WHERE c.client_id = _client_id
          AND c.campanha_id <> _campanha_id
          AND regexp_replace(c.telefone,'\D','','g') = i.tel_digits
     )
   );

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF _assigned_operador_id IS NOT NULL AND v_inserted > 0 THEN
    INSERT INTO public.telemarketing_assignment_log(
      client_id, campanha_id, operador_id, acao, contatos_count, criado_por
    ) VALUES (_client_id, _campanha_id, _assigned_operador_id, 'importar_atribuir', v_inserted, auth.uid());
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped_same_campaign', v_skip_same,
    'skipped_other_campaign', v_skip_other
  );
END;
$$;

-- 4. Redistribuir uma fila entre operadores (round-robin, só pendentes)
CREATE OR REPLACE FUNCTION public.tele_redistribute_campanha(
  _client_id uuid,
  _campanha_id uuid,
  _operador_ids uuid[],
  _only_pending boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated int := 0;
  v_n int;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);
  IF _operador_ids IS NULL OR array_length(_operador_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Informe ao menos um operador' USING ERRCODE='22023';
  END IF;
  v_n := array_length(_operador_ids, 1);

  -- Verifica operadores pertencem ao cliente
  IF EXISTS (
    SELECT 1 FROM unnest(_operador_ids) x(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.telemarketing_operadores o
       WHERE o.id = x.id AND o.client_id = _client_id
    )
  ) THEN
    RAISE EXCEPTION 'Operador inválido' USING ERRCODE='22023';
  END IF;

  WITH alvo AS (
    SELECT c.id,
           _operador_ids[((row_number() OVER (ORDER BY c.created_at, c.id) - 1) % v_n) + 1] AS novo_op
      FROM public.telemarketing_contatos_avulsos c
     WHERE c.client_id = _client_id
       AND c.campanha_id = _campanha_id
       AND (NOT _only_pending OR c.ligacao_status IS NULL OR c.ligacao_status = 'pendente')
       AND NOT EXISTS (
         SELECT 1 FROM public.telemarketing_call_assignments a
          WHERE a.contato_id = c.id AND a.expires_at > now()
       )
  )
  UPDATE public.telemarketing_contatos_avulsos c
     SET assigned_operador_id = alvo.novo_op
    FROM alvo
   WHERE c.id = alvo.id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  INSERT INTO public.telemarketing_assignment_log(
    client_id, campanha_id, operador_id, acao, contatos_count, criado_por
  ) VALUES (_client_id, _campanha_id, NULL, 'redistribuir', v_updated, auth.uid());

  RETURN jsonb_build_object('updated', v_updated, 'operadores', v_n);
END;
$$;

-- 5. Contagem por operador em uma campanha
CREATE OR REPLACE FUNCTION public.tele_operador_counts_por_campanha(
  _client_id uuid,
  _campanha_id uuid
)
RETURNS TABLE(operador_id uuid, operador_nome text, pendentes bigint, ligados bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);
  RETURN QUERY
    SELECT c.assigned_operador_id,
           COALESCE(o.nome, '(Pool livre)'),
           count(*) FILTER (WHERE c.ligacao_status IS NULL OR c.ligacao_status = 'pendente')::bigint,
           count(*) FILTER (WHERE c.ligacao_status IS NOT NULL AND c.ligacao_status <> 'pendente')::bigint
      FROM public.telemarketing_contatos_avulsos c
      LEFT JOIN public.telemarketing_operadores o ON o.id = c.assigned_operador_id
     WHERE c.client_id = _client_id AND c.campanha_id = _campanha_id
     GROUP BY c.assigned_operador_id, o.nome
     ORDER BY (c.assigned_operador_id IS NULL), COALESCE(o.nome,'');
END;
$$;

-- 6. Reatribuir pendentes de um operador que saiu
CREATE OR REPLACE FUNCTION public.tele_reassign_from_operador(
  _client_id uuid,
  _operador_id uuid,
  _to_operador_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_updated int := 0;
  v_n int;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _to_operador_ids IS NULL OR array_length(_to_operador_ids,1) IS NULL THEN
    -- Solta os contatos no pool livre
    UPDATE public.telemarketing_contatos_avulsos
       SET assigned_operador_id = NULL
     WHERE client_id = _client_id
       AND assigned_operador_id = _operador_id
       AND (ligacao_status IS NULL OR ligacao_status = 'pendente');
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  ELSE
    v_n := array_length(_to_operador_ids, 1);
    WITH alvo AS (
      SELECT c.id,
             _to_operador_ids[((row_number() OVER (ORDER BY c.campanha_id, c.created_at, c.id) - 1) % v_n) + 1] AS novo_op
        FROM public.telemarketing_contatos_avulsos c
       WHERE c.client_id = _client_id
         AND c.assigned_operador_id = _operador_id
         AND (c.ligacao_status IS NULL OR c.ligacao_status = 'pendente')
    )
    UPDATE public.telemarketing_contatos_avulsos c
       SET assigned_operador_id = alvo.novo_op
      FROM alvo
     WHERE c.id = alvo.id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
  END IF;

  INSERT INTO public.telemarketing_assignment_log(
    client_id, campanha_id, operador_id, acao, contatos_count, criado_por
  ) VALUES (_client_id, NULL, _operador_id, 'reatribuir_saida', v_updated, auth.uid());

  RETURN jsonb_build_object('updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_import_contato_avulso_batch(uuid, uuid, jsonb, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_redistribute_campanha(uuid, uuid, uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_operador_counts_por_campanha(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_reassign_from_operador(uuid, uuid, uuid[]) TO authenticated;