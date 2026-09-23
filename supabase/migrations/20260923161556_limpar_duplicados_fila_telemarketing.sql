-- Corrige filas antigas que receberam a mesma planilha mais de uma vez,
-- inclusive quando a importacao nao foi associada a uma lista.
-- A limpeza e reversivel: excedentes sem atividade sao apenas desativados.

CREATE OR REPLACE FUNCTION public.tele_limpar_duplicados_fila(
  _client_id uuid,
  _campanha_id uuid,
  _confirmar boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_telefones integer := 0;
  v_excedentes integer := 0;
  v_removiveis integer := 0;
  v_protegidos integer := 0;
  v_desativados integer := 0;
  v_amostras jsonb := '[]'::jsonb;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);
  -- Usa a mesma trava das importacoes para a previa/limpeza nao disputar com upload.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(_client_id::text));

  IF NOT EXISTS (
    SELECT 1 FROM public.telemarketing_campanhas c
    WHERE c.id = _campanha_id AND c.client_id = _client_id
  ) THEN
    RAISE EXCEPTION 'Fila invalida' USING ERRCODE = '22023';
  END IF;

  CREATE TEMP TABLE tmp_tele_fila_duplicados ON COMMIT DROP AS
  WITH contatos AS (
    SELECT
      a.id,
      a.nome,
      a.telefone,
      public.tele_phone_key(a.telefone) AS phone_key,
      a.created_at,
      (
        COALESCE(a.ligacao_status, 'pendente') <> 'pendente'
        OR COALESCE(a.tentativas_count, 0) > 0
        OR a.ligacao_em IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM public.telemarketing_call_log lg
          WHERE lg.client_id = _client_id
            AND lg.tabela = 'contatos_avulsos'
            AND lg.contato_id = a.id
        )
      ) AS trabalhado
    FROM public.telemarketing_contatos_avulsos a
    WHERE a.client_id = _client_id
      AND a.campanha_id = _campanha_id
      AND COALESCE(a.ativo, true)
      AND public.tele_phone_key(a.telefone) IS NOT NULL
  ), classificados AS (
    SELECT
      c.*,
      count(*) OVER (PARTITION BY c.phone_key) AS quantidade,
      row_number() OVER (
        PARTITION BY c.phone_key
        ORDER BY c.trabalhado DESC, c.created_at, c.id
      ) AS posicao
    FROM contatos c
  )
  SELECT * FROM classificados WHERE quantidade > 1;

  SELECT
    count(DISTINCT phone_key)::integer,
    COALESCE(sum(quantidade - 1) FILTER (WHERE posicao = 1), 0)::integer,
    count(*) FILTER (WHERE posicao > 1 AND NOT trabalhado)::integer,
    count(*) FILTER (WHERE posicao > 1 AND trabalhado)::integer
  INTO v_telefones, v_excedentes, v_removiveis, v_protegidos
  FROM pg_temp.tmp_tele_fila_duplicados;

  SELECT COALESCE(jsonb_agg(s.item ORDER BY s.phone_key), '[]'::jsonb)
  INTO v_amostras
  FROM (
    SELECT
      d.phone_key,
      jsonb_build_object(
        'telefone', min(d.telefone),
        'nome', min(d.nome),
        'quantidade', max(d.quantidade),
        'removiveis', count(*) FILTER (WHERE d.posicao > 1 AND NOT d.trabalhado),
        'protegidos', count(*) FILTER (WHERE d.posicao > 1 AND d.trabalhado)
      ) AS item
    FROM pg_temp.tmp_tele_fila_duplicados d
    GROUP BY d.phone_key
    ORDER BY d.phone_key
    LIMIT 10
  ) s;

  IF NOT _confirmar THEN
    RETURN jsonb_build_object(
      'telefones_duplicados', v_telefones,
      'contatos_excedentes', v_excedentes,
      'removiveis', v_removiveis,
      'protegidos', v_protegidos,
      'amostras', v_amostras
    );
  END IF;

  UPDATE public.telemarketing_contatos_avulsos a
  SET ativo = false
  FROM pg_temp.tmp_tele_fila_duplicados d
  WHERE d.id = a.id
    AND d.posicao > 1
    AND NOT d.trabalhado
    AND a.client_id = _client_id
    AND a.campanha_id = _campanha_id
    AND COALESCE(a.ativo, true);
  GET DIAGNOSTICS v_desativados = ROW_COUNT;

  DELETE FROM public.telemarketing_call_assignments ca
  USING pg_temp.tmp_tele_fila_duplicados d
  WHERE ca.client_id = _client_id
    AND ca.tabela = 'contatos_avulsos'
    AND ca.contato_id = d.id
    AND d.posicao > 1
    AND NOT d.trabalhado;

  UPDATE public.telemarketing_listas l
  SET total_contatos = (
    SELECT count(*) FROM public.telemarketing_contatos_avulsos a
    WHERE a.client_id = _client_id
      AND a.lista_id = l.id
      AND COALESCE(a.ativo, true)
  )
  WHERE l.client_id = _client_id AND l.campanha_id = _campanha_id;

  RETURN jsonb_build_object(
    'telefones_duplicados', v_telefones,
    'contatos_excedentes', v_excedentes,
    'removidos', v_desativados,
    'protegidos', v_protegidos,
    'amostras', v_amostras
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tele_limpar_duplicados_fila(uuid, uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tele_limpar_duplicados_fila(uuid, uuid, boolean)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
