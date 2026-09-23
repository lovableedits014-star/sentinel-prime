-- Torna a importacao de listas idempotente por telefone normalizado, mostra
-- onde cada numero ja existe antes da confirmacao e permite reverter um lote
-- ainda nao trabalhado.

CREATE OR REPLACE FUNCTION public.tele_preview_importacao_avulsos(
  _client_id uuid,
  _campanha_id uuid,
  _rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _campanha_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.telemarketing_campanhas c
    WHERE c.id = _campanha_id AND c.client_id = _client_id
  ) THEN
    RAISE EXCEPTION 'Fila invalida';
  END IF;

  WITH incoming AS (
    SELECT
      r.value AS row_data,
      r.ordinality,
      public.tele_phone_key(r.value->>'telefone') AS phone_key,
      row_number() OVER (
        PARTITION BY public.tele_phone_key(r.value->>'telefone')
        ORDER BY r.ordinality
      ) AS occurrence
    FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) WITH ORDINALITY r(value, ordinality)
  ), valid AS (
    SELECT * FROM incoming
    WHERE NULLIF(btrim(row_data->>'nome'), '') IS NOT NULL AND phone_key IS NOT NULL
  ), existing AS (
    SELECT
      v.ordinality,
      jsonb_agg(jsonb_build_object(
        'contato_id', a.id,
        'lista_id', a.lista_id,
        'lista_nome', l.nome,
        'campanha_id', a.campanha_id,
        'campanha_nome', c.nome
      ) ORDER BY a.created_at) AS locais,
      COALESCE(bool_or(a.campanha_id = _campanha_id), false) AS mesma_fila
    FROM valid v
    JOIN public.telemarketing_contatos_avulsos a
      ON a.client_id = _client_id
     AND COALESCE(a.ativo, true)
     AND public.tele_phone_key(a.telefone) = v.phone_key
    LEFT JOIN public.telemarketing_listas l ON l.id = a.lista_id
    LEFT JOIN public.telemarketing_campanhas c ON c.id = a.campanha_id
    GROUP BY v.ordinality
  ), samples AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'nome', v.row_data->>'nome',
      'telefone', v.row_data->>'telefone',
      'tipo', CASE WHEN v.occurrence > 1 THEN 'na_planilha'
                   WHEN e.mesma_fila THEN 'na_mesma_fila'
                   ELSE 'em_outra_fila' END,
      'locais', COALESCE(e.locais, '[]'::jsonb)
    ) ORDER BY v.ordinality), '[]'::jsonb) AS value
    FROM (SELECT * FROM valid WHERE occurrence > 1 OR EXISTS (
      SELECT 1 FROM existing e0 WHERE e0.ordinality = valid.ordinality
    ) ORDER BY ordinality LIMIT 25) v
    LEFT JOIN existing e ON e.ordinality = v.ordinality
  )
  SELECT jsonb_build_object(
    'total_linhas', jsonb_array_length(COALESCE(_rows, '[]'::jsonb)),
    'validos', (SELECT count(*) FROM valid),
    'unicos_na_planilha', (SELECT count(*) FROM valid WHERE occurrence = 1),
    'duplicados_na_planilha', (SELECT count(*) FROM valid WHERE occurrence > 1),
    'ja_na_mesma_fila', (SELECT count(*) FROM valid v JOIN existing e USING (ordinality)
                          WHERE v.occurrence = 1 AND e.mesma_fila),
    'ja_em_outra_fila', (SELECT count(*) FROM valid v JOIN existing e USING (ordinality)
                          WHERE v.occurrence = 1 AND NOT e.mesma_fila),
    'novos', (SELECT count(*) FROM valid v WHERE v.occurrence = 1
              AND NOT EXISTS (SELECT 1 FROM existing e WHERE e.ordinality = v.ordinality)),
    'amostras', (SELECT value FROM samples)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.tele_import_contato_avulso_batch(
  _client_id uuid,
  _campanha_id uuid,
  _rows jsonb,
  _assigned_operador_id uuid DEFAULT NULL,
  _skip_global_dupes boolean DEFAULT true,
  _lista_nome text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_inserted integer := 0;
  v_same integer := 0;
  v_other integer := 0;
  v_in_file integer := 0;
  v_lista_id uuid;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(_client_id::text));

  IF NOT EXISTS (
    SELECT 1 FROM public.telemarketing_campanhas c
    WHERE c.id = _campanha_id AND c.client_id = _client_id
  ) THEN
    RAISE EXCEPTION 'Fila invalida';
  END IF;

  IF _assigned_operador_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.telemarketing_operadores o
    WHERE o.id = _assigned_operador_id AND o.client_id = _client_id
  ) THEN
    RAISE EXCEPTION 'Operador invalido';
  END IF;

  IF NULLIF(btrim(COALESCE(_lista_nome, '')), '') IS NOT NULL THEN
    INSERT INTO public.telemarketing_listas(client_id, campanha_id, nome, total_contatos)
    VALUES (_client_id, _campanha_id, btrim(_lista_nome), 0)
    RETURNING id INTO v_lista_id;
  END IF;

  CREATE TEMP TABLE tmp_tele_import ON COMMIT DROP AS
  SELECT
    r.value AS row_data,
    r.ordinality,
    public.tele_phone_key(r.value->>'telefone') AS phone_key,
    row_number() OVER (
      PARTITION BY public.tele_phone_key(r.value->>'telefone') ORDER BY r.ordinality
    ) AS occurrence
  FROM jsonb_array_elements(COALESCE(_rows, '[]'::jsonb)) WITH ORDINALITY r(value, ordinality);

  DELETE FROM pg_temp.tmp_tele_import
  WHERE NULLIF(btrim(row_data->>'nome'), '') IS NULL OR phone_key IS NULL;

  SELECT count(*) INTO v_in_file FROM pg_temp.tmp_tele_import WHERE occurrence > 1;
  SELECT count(*) FILTER (WHERE a.campanha_id = _campanha_id),
         count(*) FILTER (WHERE a.campanha_id <> _campanha_id)
    INTO v_same, v_other
  FROM pg_temp.tmp_tele_import t
  JOIN LATERAL (
    SELECT a.campanha_id
    FROM public.telemarketing_contatos_avulsos a
    WHERE a.client_id = _client_id AND COALESCE(a.ativo, true)
      AND public.tele_phone_key(a.telefone) = t.phone_key
    ORDER BY (a.campanha_id = _campanha_id) DESC, a.created_at
    LIMIT 1
  ) a ON true
  WHERE t.occurrence = 1;

  IF v_lista_id IS NOT NULL THEN
    INSERT INTO public.telemarketing_import_duplicatas(
      client_id, lista_id, nome, telefone, cidade, bairro, motivo
    )
    SELECT _client_id, v_lista_id, NULLIF(btrim(t.row_data->>'nome'), ''),
      t.row_data->>'telefone', NULLIF(btrim(t.row_data->>'cidade'), ''),
      NULLIF(btrim(t.row_data->>'bairro'), ''),
      CASE WHEN t.occurrence > 1 THEN 'lista' ELSE 'global' END
    FROM pg_temp.tmp_tele_import t
    WHERE t.occurrence > 1 OR EXISTS (
      SELECT 1 FROM public.telemarketing_contatos_avulsos a
      WHERE a.client_id = _client_id AND COALESCE(a.ativo, true)
        AND public.tele_phone_key(a.telefone) = t.phone_key
    );
  END IF;

  INSERT INTO public.telemarketing_contatos_avulsos(
    client_id, campanha_id, lista_id, nome, telefone, cidade, bairro,
    assigned_operador_id, ativo
  )
  SELECT _client_id, _campanha_id, v_lista_id,
    NULLIF(btrim(t.row_data->>'nome'), ''), t.phone_key,
    NULLIF(btrim(t.row_data->>'cidade'), ''), NULLIF(btrim(t.row_data->>'bairro'), ''),
    _assigned_operador_id, true
  FROM pg_temp.tmp_tele_import t
  WHERE t.occurrence = 1
    AND (NOT _skip_global_dupes OR NOT EXISTS (
      SELECT 1 FROM public.telemarketing_contatos_avulsos a
      WHERE a.client_id = _client_id AND COALESCE(a.ativo, true)
        AND public.tele_phone_key(a.telefone) = t.phone_key
    ));
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_lista_id IS NOT NULL THEN
    UPDATE public.telemarketing_listas SET total_contatos = v_inserted WHERE id = v_lista_id;
  END IF;

  IF _assigned_operador_id IS NOT NULL AND v_inserted > 0 THEN
    INSERT INTO public.telemarketing_assignment_log(
      client_id, campanha_id, operador_id, acao, contatos_count, criado_por
    ) VALUES (
      _client_id, _campanha_id, _assigned_operador_id, 'importar_atribuir',
      v_inserted, (SELECT auth.uid())
    );
  END IF;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'skipped_global', CASE WHEN _skip_global_dupes THEN v_same + v_other ELSE 0 END,
    'skipped_same_campaign', CASE WHEN _skip_global_dupes THEN v_same ELSE 0 END,
    'skipped_other_campaign', CASE WHEN _skip_global_dupes THEN v_other ELSE 0 END,
    'duplicates_in_file', v_in_file,
    'lista_id', v_lista_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.tele_reverter_lista_importada(
  _client_id uuid,
  _lista_id uuid,
  _confirmar boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_lista public.telemarketing_listas%ROWTYPE;
  v_total integer;
  v_trabalhados integer;
  v_removidos integer := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  SELECT * INTO v_lista FROM public.telemarketing_listas l
  WHERE l.id = _lista_id AND l.client_id = _client_id FOR UPDATE;
  IF v_lista.id IS NULL THEN RAISE EXCEPTION 'Lista nao encontrada'; END IF;

  SELECT count(*), count(*) FILTER (
    WHERE COALESCE(a.ligacao_status, 'pendente') <> 'pendente'
       OR COALESCE(a.tentativas_count, 0) > 0
       OR EXISTS (SELECT 1 FROM public.telemarketing_call_log lg
                  WHERE lg.client_id = _client_id
                    AND lg.tabela = 'contatos_avulsos' AND lg.contato_id = a.id)
  ) INTO v_total, v_trabalhados
  FROM public.telemarketing_contatos_avulsos a
  WHERE a.client_id = _client_id AND a.lista_id = _lista_id;

  IF NOT _confirmar THEN
    RETURN jsonb_build_object('lista_id', _lista_id, 'nome', v_lista.nome,
      'total', v_total, 'trabalhados', v_trabalhados, 'pode_reverter', v_trabalhados = 0);
  END IF;
  IF v_trabalhados > 0 THEN
    RAISE EXCEPTION 'A lista possui % contato(s) ja trabalhado(s) e nao pode ser revertida automaticamente', v_trabalhados;
  END IF;

  DELETE FROM public.telemarketing_contatos_avulsos
  WHERE client_id = _client_id AND lista_id = _lista_id;
  GET DIAGNOSTICS v_removidos = ROW_COUNT;
  DELETE FROM public.telemarketing_listas WHERE id = _lista_id AND client_id = _client_id;

  RETURN jsonb_build_object('lista_id', _lista_id, 'removidos', v_removidos, 'revertida', true);
END;
$$;

REVOKE ALL ON FUNCTION public.tele_preview_importacao_avulsos(uuid,uuid,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tele_import_contato_avulso_batch(uuid,uuid,jsonb,uuid,boolean,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tele_reverter_lista_importada(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tele_preview_importacao_avulsos(uuid,uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_import_contato_avulso_batch(uuid,uuid,jsonb,uuid,boolean,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_reverter_lista_importada(uuid,uuid,boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
