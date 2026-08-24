
-- Helper: normaliza um filtro textual em padrão ILIKE parcial
CREATE OR REPLACE FUNCTION public._tele_like(_v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN NULLIF(btrim(COALESCE(_v,'')),'') IS NULL THEN NULL
    ELSE '%' || btrim(replace(_v,'%','')) || '%'
  END
$$;

-- Prévia unificada de contatos por origem
CREATE OR REPLACE FUNCTION public.tele_preview_fila(
  _client_id uuid,
  _origem text,
  _filtros jsonb DEFAULT '{}'::jsonb,
  _csv_count int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cidade text := public._tele_like(_filtros->>'cidade');
  v_bairro text := public._tele_like(_filtros->>'bairro');
  v_tipo text := NULLIF(btrim(COALESCE(_filtros->>'tipo','')),'');
  v_indicador uuid := NULLIF(_filtros->>'indicador_id','')::uuid;
  v_pend boolean := COALESCE((_filtros->>'apenas_pendentes')::boolean, true);
  v_total int := 0; v_pendentes int := 0; v_outra int := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _origem = 'csv' THEN
    RETURN jsonb_build_object('total', COALESCE(_csv_count,0), 'pendentes', COALESCE(_csv_count,0), 'ja_em_outra_fila', 0);

  ELSIF _origem = 'estrutura' THEN
    SELECT count(*),
           count(*) FILTER (WHERE p.ligacao_status IS NULL OR p.ligacao_status = 'pendente'),
           count(*) FILTER (WHERE p.campanha_id IS NOT NULL)
      INTO v_total, v_pendentes, v_outra
      FROM public.eleicao_pessoas p
     WHERE p.client_id = _client_id
       AND length(regexp_replace(COALESCE(p.telefone,''),'\D','','g')) >= 8
       AND (v_cidade IS NULL OR p.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR p.bairro ILIKE v_bairro OR p.regiao ILIKE v_bairro)
       AND (v_tipo IS NULL OR p.tipo::text = v_tipo)
       AND (v_indicador IS NULL OR p.parent_id = v_indicador)
       AND (NOT v_pend OR p.ligacao_status IS NULL OR p.ligacao_status = 'pendente');

  ELSIF _origem = 'indicados_eleicao' THEN
    SELECT count(*),
           count(*) FILTER (WHERE ei.ultima_ligacao_em IS NULL),
           count(*) FILTER (WHERE ei.campanha_id IS NOT NULL)
      INTO v_total, v_pendentes, v_outra
      FROM public.eleicao_indicados ei
     WHERE ei.client_id = _client_id
       AND length(regexp_replace(COALESCE(ei.telefone,''),'\D','','g')) >= 8
       AND (v_cidade IS NULL OR ei.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR ei.bairro ILIKE v_bairro)
       AND (v_tipo IS NULL OR ei.indicador_tipo::text = v_tipo)
       AND (v_indicador IS NULL OR ei.indicador_id = v_indicador)
       AND (NOT v_pend OR ei.ultima_ligacao_em IS NULL);

  ELSIF _origem = 'contratados' THEN
    SELECT count(*),
           count(*) FILTER (WHERE c.ligacao_status IS NULL OR c.ligacao_status = 'pendente'),
           count(*) FILTER (WHERE c.campanha_id IS NOT NULL)
      INTO v_total, v_pendentes, v_outra
      FROM public.contratados c
     WHERE c.client_id = _client_id
       AND length(regexp_replace(COALESCE(c.telefone,''),'\D','','g')) >= 8
       AND (v_cidade IS NULL OR c.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR c.bairro ILIKE v_bairro)
       AND (v_tipo IS NULL
            OR (v_tipo = 'lider' AND COALESCE(c.is_lider,false) = true)
            OR (v_tipo = 'liderado' AND COALESCE(c.is_lider,false) = false))
       AND (v_indicador IS NULL OR c.lider_id = v_indicador)
       AND (NOT v_pend OR c.ligacao_status IS NULL OR c.ligacao_status = 'pendente');

  ELSIF _origem = 'indicados_contratados' THEN
    SELECT count(*),
           count(*) FILTER (WHERE ci.ligacao_status IS NULL OR ci.ligacao_status = 'pendente'),
           count(*) FILTER (WHERE ci.campanha_id IS NOT NULL)
      INTO v_total, v_pendentes, v_outra
      FROM public.contratado_indicados ci
     WHERE ci.client_id = _client_id
       AND length(regexp_replace(COALESCE(ci.telefone,''),'\D','','g')) >= 8
       AND (v_cidade IS NULL OR ci.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR ci.bairro ILIKE v_bairro)
       AND (v_indicador IS NULL OR ci.contratado_id = v_indicador)
       AND (NOT v_pend OR ci.ligacao_status IS NULL OR ci.ligacao_status = 'pendente');
  ELSE
    RAISE EXCEPTION 'Origem de contatos inválida: %', _origem;
  END IF;

  RETURN jsonb_build_object('total', COALESCE(v_total,0), 'pendentes', COALESCE(v_pendentes,0), 'ja_em_outra_fila', COALESCE(v_outra,0));
END;
$$;

-- Popula (ou complementa) uma fila existente com contatos de qualquer origem
CREATE OR REPLACE FUNCTION public.tele_popular_fila(
  _client_id uuid,
  _campanha_id uuid,
  _origem text,
  _filtros jsonb DEFAULT '{}'::jsonb,
  _csv_rows jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cidade text := public._tele_like(_filtros->>'cidade');
  v_bairro text := public._tele_like(_filtros->>'bairro');
  v_tipo text := NULLIF(btrim(COALESCE(_filtros->>'tipo','')),'');
  v_indicador uuid := NULLIF(_filtros->>'indicador_id','')::uuid;
  v_pend boolean := COALESCE((_filtros->>'apenas_pendentes')::boolean, true);
  v_sub boolean := COALESCE((_filtros->>'substituir')::boolean, false);
  v_total int := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF NOT EXISTS (SELECT 1 FROM public.telemarketing_campanhas t WHERE t.id = _campanha_id AND t.client_id = _client_id) THEN
    RAISE EXCEPTION 'Fila inválida';
  END IF;

  IF _origem = 'csv' THEN
    INSERT INTO public.telemarketing_contatos_avulsos(client_id, campanha_id, nome, telefone, cidade, bairro, ativo)
    SELECT _client_id, _campanha_id,
           NULLIF(btrim(r->>'nome'),''),
           NULLIF(regexp_replace(COALESCE(r->>'telefone',''),'\D','','g'),''),
           NULLIF(btrim(r->>'cidade'),''),
           NULLIF(btrim(r->>'bairro'),''),
           true
      FROM jsonb_array_elements(COALESCE(_csv_rows,'[]'::jsonb)) r
     WHERE NULLIF(btrim(r->>'nome'),'') IS NOT NULL
       AND length(regexp_replace(COALESCE(r->>'telefone',''),'\D','','g')) >= 8;
    GET DIAGNOSTICS v_total = ROW_COUNT;

  ELSIF _origem = 'estrutura' THEN
    UPDATE public.eleicao_pessoas p
       SET campanha_id = _campanha_id, updated_at = now()
     WHERE p.client_id = _client_id
       AND length(regexp_replace(COALESCE(p.telefone,''),'\D','','g')) >= 8
       AND (v_cidade IS NULL OR p.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR p.bairro ILIKE v_bairro OR p.regiao ILIKE v_bairro)
       AND (v_tipo IS NULL OR p.tipo::text = v_tipo)
       AND (v_indicador IS NULL OR p.parent_id = v_indicador)
       AND (NOT v_pend OR p.ligacao_status IS NULL OR p.ligacao_status = 'pendente')
       AND (v_sub OR p.campanha_id IS NULL OR p.campanha_id = _campanha_id);
    GET DIAGNOSTICS v_total = ROW_COUNT;

  ELSIF _origem = 'indicados_eleicao' THEN
    UPDATE public.eleicao_indicados ei
       SET campanha_id = _campanha_id
     WHERE ei.client_id = _client_id
       AND length(regexp_replace(COALESCE(ei.telefone,''),'\D','','g')) >= 8
       AND (v_cidade IS NULL OR ei.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR ei.bairro ILIKE v_bairro)
       AND (v_tipo IS NULL OR ei.indicador_tipo::text = v_tipo)
       AND (v_indicador IS NULL OR ei.indicador_id = v_indicador)
       AND (NOT v_pend OR ei.ultima_ligacao_em IS NULL)
       AND (v_sub OR ei.campanha_id IS NULL OR ei.campanha_id = _campanha_id);
    GET DIAGNOSTICS v_total = ROW_COUNT;

  ELSIF _origem = 'contratados' THEN
    UPDATE public.contratados c
       SET campanha_id = _campanha_id, updated_at = now()
     WHERE c.client_id = _client_id
       AND length(regexp_replace(COALESCE(c.telefone,''),'\D','','g')) >= 8
       AND (v_cidade IS NULL OR c.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR c.bairro ILIKE v_bairro)
       AND (v_tipo IS NULL
            OR (v_tipo = 'lider' AND COALESCE(c.is_lider,false) = true)
            OR (v_tipo = 'liderado' AND COALESCE(c.is_lider,false) = false))
       AND (v_indicador IS NULL OR c.lider_id = v_indicador)
       AND (NOT v_pend OR c.ligacao_status IS NULL OR c.ligacao_status = 'pendente')
       AND (v_sub OR c.campanha_id IS NULL OR c.campanha_id = _campanha_id);
    GET DIAGNOSTICS v_total = ROW_COUNT;

  ELSIF _origem = 'indicados_contratados' THEN
    UPDATE public.contratado_indicados ci
       SET campanha_id = _campanha_id
     WHERE ci.client_id = _client_id
       AND length(regexp_replace(COALESCE(ci.telefone,''),'\D','','g')) >= 8
       AND (v_cidade IS NULL OR ci.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR ci.bairro ILIKE v_bairro)
       AND (v_indicador IS NULL OR ci.contratado_id = v_indicador)
       AND (NOT v_pend OR ci.ligacao_status IS NULL OR ci.ligacao_status = 'pendente')
       AND (v_sub OR ci.campanha_id IS NULL OR ci.campanha_id = _campanha_id);
    GET DIAGNOSTICS v_total = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Origem de contatos inválida: %', _origem;
  END IF;

  UPDATE public.telemarketing_campanhas
     SET filtros = COALESCE(filtros,'{}'::jsonb) || jsonb_build_object('fonte', _origem, 'ultimo_filtro', _filtros)
   WHERE id = _campanha_id AND client_id = _client_id;

  RETURN jsonb_build_object('campanha_id', _campanha_id, 'total', COALESCE(v_total,0));
END;
$$;

-- Criação da fila delegando o povoamento
CREATE OR REPLACE FUNCTION public.tele_create_fila_wizard(
  _client_id uuid,
  _nome text,
  _descricao text,
  _script_intro text,
  _script_perguntas text[],
  _tags_rapidas text[],
  _origem text,
  _filtros jsonb DEFAULT '{}'::jsonb,
  _csv_rows jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_campanha_id uuid;
  v_res jsonb;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _client_id IS NULL OR NULLIF(btrim(_nome),'') IS NULL THEN
    RAISE EXCEPTION 'Cliente e nome são obrigatórios';
  END IF;

  INSERT INTO public.telemarketing_campanhas(
    client_id, nome, descricao, script_intro, script_perguntas, tags_rapidas, ativo
  ) VALUES (
    _client_id, btrim(_nome),
    NULLIF(btrim(COALESCE(_descricao,'')),''),
    NULLIF(btrim(COALESCE(_script_intro,'')),''),
    to_jsonb(COALESCE(_script_perguntas, ARRAY[]::text[])),
    to_jsonb(COALESCE(_tags_rapidas, ARRAY[]::text[])),
    true
  ) RETURNING id INTO v_campanha_id;

  v_res := public.tele_popular_fila(_client_id, v_campanha_id, _origem, _filtros, _csv_rows);

  RETURN jsonb_build_object('campanha_id', v_campanha_id, 'total', COALESCE((v_res->>'total')::int, 0));
END;
$$;

-- Remove contatos de uma fila (libera vínculo) ou desativa avulsos
CREATE OR REPLACE FUNCTION public.tele_remover_da_fila(
  _client_id uuid,
  _campanha_id uuid,
  _tabela text,
  _ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total int := 0;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF _tabela = 'telemarketing_contatos_avulsos' THEN
    UPDATE public.telemarketing_contatos_avulsos
       SET campanha_id = NULL, assigned_operador_id = NULL
     WHERE client_id = _client_id AND campanha_id = _campanha_id AND id = ANY(_ids);
  ELSIF _tabela = 'eleicao_pessoas' THEN
    UPDATE public.eleicao_pessoas
       SET campanha_id = NULL
     WHERE client_id = _client_id AND campanha_id = _campanha_id AND id = ANY(_ids);
  ELSIF _tabela = 'eleicao_indicados' THEN
    UPDATE public.eleicao_indicados
       SET campanha_id = NULL
     WHERE client_id = _client_id AND campanha_id = _campanha_id AND id = ANY(_ids);
  ELSIF _tabela = 'contratados' THEN
    UPDATE public.contratados
       SET campanha_id = NULL
     WHERE client_id = _client_id AND campanha_id = _campanha_id AND id = ANY(_ids);
  ELSIF _tabela = 'contratado_indicados' THEN
    UPDATE public.contratado_indicados
       SET campanha_id = NULL
     WHERE client_id = _client_id AND campanha_id = _campanha_id AND id = ANY(_ids);
  ELSE
    RAISE EXCEPTION 'Tabela inválida: %', _tabela;
  END IF;

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN jsonb_build_object('removidos', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public._tele_like(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_preview_fila(uuid, text, jsonb, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_popular_fila(uuid, uuid, text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_create_fila_wizard(uuid, text, text, text, text[], text[], text, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_remover_da_fila(uuid, uuid, text, uuid[]) TO authenticated;
