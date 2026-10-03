-- Corrige timeout da conferencia externa.
-- A versao anterior executava buscas laterais para cada linha importada.
-- Esta versao materializa uma unica fotografia de leitura de eleicao_pessoas
-- e faz os cruzamentos em lote. Nenhum DML e executado nas tabelas de pessoas,
-- contratos, funcionarios ou hierarquia.

CREATE INDEX IF NOT EXISTS eleicao_pessoas_conferencia_telefone_idx
  ON public.eleicao_pessoas(client_id, public.tele_phone_key(telefone))
  WHERE telefone IS NOT NULL;

CREATE INDEX IF NOT EXISTS eleicao_pessoas_cliente_nome_key_idx
  ON public.eleicao_pessoas(client_id, public.eleicao_nome_key(nome));

CREATE OR REPLACE FUNCTION public.eleicao_conferencia_processar(
  p_client_id uuid,
  p_nome text,
  p_arquivo_nome text,
  p_referencia_em date,
  p_lideranca_esperada_id uuid,
  p_linhas jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
SET statement_timeout = '30s'
AS $$
DECLARE
  v_lista_id uuid;
  v_total integer;
  v_result jsonb;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente' USING ERRCODE = '42501';
  END IF;
  IF nullif(btrim(coalesce(p_nome, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe um nome para a conferencia';
  END IF;
  IF p_referencia_em IS NULL THEN
    RAISE EXCEPTION 'Informe a data de referencia';
  END IF;
  IF jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'A lista enviada e invalida';
  END IF;

  v_total := jsonb_array_length(p_linhas);
  IF v_total = 0 OR v_total > 20000 THEN
    RAISE EXCEPTION 'A lista deve possuir entre 1 e 20000 linhas';
  END IF;

  IF p_lideranca_esperada_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.eleicao_pessoas p
    WHERE p.id = p_lideranca_esperada_id
      AND p.client_id = p_client_id
      AND p.arquivado_em IS NULL
      AND p.tipo::text IN ('coordenador', 'lider')
  ) THEN
    RAISE EXCEPTION 'A lideranca esperada nao e valida';
  END IF;

  INSERT INTO public.eleicao_conferencia_listas (
    client_id, nome, arquivo_nome, referencia_em, lideranca_esperada_id, total_lista
  ) VALUES (
    p_client_id,
    btrim(p_nome),
    coalesce(nullif(btrim(p_arquivo_nome), ''), 'lista.xlsx'),
    p_referencia_em,
    p_lideranca_esperada_id,
    v_total
  ) RETURNING id INTO v_lista_id;

  WITH RECURSIVE escopo_lideranca AS (
    SELECT p.id
    FROM public.eleicao_pessoas p
    WHERE p.id = p_lideranca_esperada_id
      AND p.client_id = p_client_id

    UNION

    SELECT filho.id
    FROM public.eleicao_pessoas filho
    JOIN escopo_lideranca pai ON pai.id = filho.parent_id
    WHERE filho.client_id = p_client_id
  ), raw AS MATERIALIZED (
    SELECT
      x.ordinality::integer AS numero_linha,
      nullif(btrim(x.value->>'nome'), '') AS nome,
      nullif(btrim(x.value->>'telefone'), '') AS telefone,
      public.tele_phone_key(x.value->>'telefone') AS telefone_key,
      public.eleicao_nome_key(x.value->>'nome') AS nome_key
    FROM jsonb_array_elements(p_linhas) WITH ORDINALITY x(value, ordinality)
  ), ranked AS MATERIALIZED (
    SELECT
      r.*,
      CASE
        WHEN r.telefone_key IS NULL THEN 1
        ELSE row_number() OVER (
          PARTITION BY r.telefone_key
          ORDER BY r.numero_linha
        )
      END AS telefone_ordem
    FROM raw r
  ), pessoas AS MATERIALIZED (
    SELECT
      p.id,
      p.nome,
      p.telefone,
      p.tipo,
      p.parent_id,
      p.arquivado_em,
      p.is_voluntario,
      p.valor_contratacao,
      p.contrato_inicio,
      p.contrato_fim,
      p.vigencia_inicio,
      p.vigencia_fim,
      p.created_at,
      public.tele_phone_key(p.telefone) AS telefone_key,
      public.eleicao_nome_key(p.nome) AS nome_key
    FROM public.eleicao_pessoas p
    WHERE p.client_id = p_client_id
  ), candidatos_telefone AS (
    SELECT
      r.numero_linha,
      p.id AS pessoa_id,
      row_number() OVER (
        PARTITION BY r.numero_linha
        ORDER BY
          (p.nome_key IS NOT DISTINCT FROM r.nome_key) DESC,
          (p.arquivado_em IS NULL) DESC,
          p.created_at DESC,
          p.id
      ) AS ordem
    FROM ranked r
    JOIN pessoas p
      ON r.telefone_key IS NOT NULL
     AND p.telefone_key = r.telefone_key
  ), telefone_match AS (
    SELECT c.numero_linha, c.pessoa_id
    FROM candidatos_telefone c
    WHERE c.ordem = 1
  ), nome_unico AS (
    SELECT p.nome_key, min(p.id::text)::uuid AS pessoa_id
    FROM pessoas p
    WHERE p.nome_key IS NOT NULL
    GROUP BY p.nome_key
    HAVING count(*) = 1
  ), resolvidos AS (
    SELECT
      r.*,
      coalesce(t.pessoa_id, n.pessoa_id) AS pessoa_id,
      CASE
        WHEN t.pessoa_id IS NOT NULL THEN 'telefone'
        WHEN n.pessoa_id IS NOT NULL THEN 'nome'
      END AS metodo
    FROM ranked r
    LEFT JOIN telefone_match t ON t.numero_linha = r.numero_linha
    LEFT JOIN nome_unico n
      ON t.pessoa_id IS NULL
     AND n.nome_key = r.nome_key
  )
  INSERT INTO public.eleicao_conferencia_itens (
    client_id, lista_id, origem, numero_linha, nome_informado, telefone_informado,
    telefone_key, pessoa_id, pessoa_nome, pessoa_telefone, pessoa_tipo,
    responsavel_id, responsavel_nome, metodo_correspondencia, classificacao,
    motivo, contrato_inicio, contrato_fim, valor_contratacao
  )
  SELECT
    p_client_id,
    v_lista_id,
    'lista',
    r.numero_linha,
    r.nome,
    r.telefone,
    r.telefone_key,
    p.id,
    p.nome,
    p.telefone,
    p.tipo::text,
    responsavel.id,
    responsavel.nome,
    r.metodo,
    CASE
      WHEN r.nome IS NULL AND r.telefone IS NULL THEN 'dados_invalidos'
      WHEN r.telefone IS NOT NULL AND coalesce(length(r.telefone_key), 0) < 10
        THEN 'dados_invalidos'
      WHEN r.telefone_ordem > 1 THEN 'repetido_lista'
      WHEN r.metodo = 'nome' THEN 'possivel_correspondencia'
      WHEN p.id IS NULL THEN 'nao_encontrado'
      WHEN public.eleicao_nome_key(r.nome) IS NOT NULL
        AND public.eleicao_nome_key(r.nome) IS DISTINCT FROM p.nome_key
        THEN 'conflito_nome'
      WHEN p.arquivado_em IS NOT NULL THEN 'arquivado'
      WHEN coalesce(p.is_voluntario, false)
        OR coalesce(p.valor_contratacao, 0) <= 0
        OR coalesce(p.contrato_inicio, p.vigencia_inicio, '-infinity'::date) > p_referencia_em
        OR coalesce(p.contrato_fim, p.vigencia_fim, 'infinity'::date) < p_referencia_em
        THEN 'sem_contrato'
      WHEN p_lideranca_esperada_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM escopo_lideranca e WHERE e.id = p.id)
        THEN 'outra_lideranca'
      ELSE 'dentro'
    END,
    CASE
      WHEN r.nome IS NULL AND r.telefone IS NULL THEN 'Nome e telefone ausentes'
      WHEN r.telefone IS NOT NULL AND coalesce(length(r.telefone_key), 0) < 10
        THEN 'Telefone possui menos de 10 digitos'
      WHEN r.telefone_ordem > 1 THEN 'Telefone repetido dentro da lista'
      WHEN r.metodo = 'nome' THEN 'Nome igual encontrado; confirme manualmente antes de vincular'
      WHEN p.id IS NULL THEN 'Nao localizado no cadastro eleitoral'
      WHEN public.eleicao_nome_key(r.nome) IS NOT NULL
        AND public.eleicao_nome_key(r.nome) IS DISTINCT FROM p.nome_key
        THEN 'Telefone localizado, mas o nome informado e diferente'
      WHEN p.arquivado_em IS NOT NULL THEN 'Cadastro localizado, mas esta arquivado'
      WHEN coalesce(p.is_voluntario, false) THEN 'Cadastro localizado como voluntario'
      WHEN coalesce(p.valor_contratacao, 0) <= 0 THEN 'Cadastro localizado sem valor de contrato'
      WHEN coalesce(p.contrato_inicio, p.vigencia_inicio, '-infinity'::date) > p_referencia_em
        THEN 'Contrato ainda nao iniciado na data de referencia'
      WHEN coalesce(p.contrato_fim, p.vigencia_fim, 'infinity'::date) < p_referencia_em
        THEN 'Contrato encerrado na data de referencia'
      WHEN p_lideranca_esperada_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM escopo_lideranca e WHERE e.id = p.id)
        THEN 'Contrato ativo vinculado a outra lideranca'
      ELSE 'Contrato ativo e dentro da lideranca esperada'
    END,
    coalesce(p.contrato_inicio, p.vigencia_inicio),
    coalesce(p.contrato_fim, p.vigencia_fim),
    p.valor_contratacao
  FROM resolvidos r
  LEFT JOIN pessoas p ON p.id = r.pessoa_id
  LEFT JOIN public.eleicao_pessoas responsavel
    ON responsavel.id = p.parent_id
   AND responsavel.client_id = p_client_id;

  -- Segunda leitura somente para gerar o inverso: contratos ativos que nao
  -- aparecem entre os telefones resolvidos da lista externa.
  WITH RECURSIVE escopo_lideranca AS (
    SELECT p.id
    FROM public.eleicao_pessoas p
    WHERE p.id = p_lideranca_esperada_id
      AND p.client_id = p_client_id

    UNION

    SELECT filho.id
    FROM public.eleicao_pessoas filho
    JOIN escopo_lideranca pai ON pai.id = filho.parent_id
    WHERE filho.client_id = p_client_id
  ), pessoas_ativas AS MATERIALIZED (
    SELECT p.*
    FROM public.eleicao_pessoas p
    WHERE p.client_id = p_client_id
      AND p.arquivado_em IS NULL
      AND NOT coalesce(p.is_voluntario, false)
      AND coalesce(p.valor_contratacao, 0) > 0
      AND coalesce(p.contrato_inicio, p.vigencia_inicio, '-infinity'::date) <= p_referencia_em
      AND coalesce(p.contrato_fim, p.vigencia_fim, 'infinity'::date) >= p_referencia_em
  )
  INSERT INTO public.eleicao_conferencia_itens (
    client_id, lista_id, origem, nome_informado, telefone_informado, telefone_key,
    pessoa_id, pessoa_nome, pessoa_telefone, pessoa_tipo, responsavel_id,
    responsavel_nome, metodo_correspondencia, classificacao, motivo,
    contrato_inicio, contrato_fim, valor_contratacao
  )
  SELECT
    p_client_id,
    v_lista_id,
    'sistema',
    p.nome,
    p.telefone,
    public.tele_phone_key(p.telefone),
    p.id,
    p.nome,
    p.telefone,
    p.tipo::text,
    responsavel.id,
    responsavel.nome,
    'telefone',
    'ausente_lista',
    'Possui contrato ativo no sistema, mas nao apareceu na lista externa',
    coalesce(p.contrato_inicio, p.vigencia_inicio),
    coalesce(p.contrato_fim, p.vigencia_fim),
    p.valor_contratacao
  FROM pessoas_ativas p
  LEFT JOIN public.eleicao_pessoas responsavel
    ON responsavel.id = p.parent_id
   AND responsavel.client_id = p_client_id
  WHERE (
    p_lideranca_esperada_id IS NULL
    OR (
      p.id <> p_lideranca_esperada_id
      AND EXISTS (SELECT 1 FROM escopo_lideranca e WHERE e.id = p.id)
    )
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.eleicao_conferencia_itens i
    WHERE i.lista_id = v_lista_id
      AND i.origem = 'lista'
      AND i.metodo_correspondencia = 'telefone'
      AND i.pessoa_id = p.id
      AND i.classificacao <> 'repetido_lista'
  );

  UPDATE public.eleicao_conferencia_listas l
  SET
    total_dentro = s.dentro,
    total_outra_lideranca = s.outra_lideranca,
    total_fora = s.fora,
    total_ausentes = s.ausentes,
    total_atencao = s.atencao,
    updated_at = now()
  FROM (
    SELECT
      count(*) FILTER (WHERE classificacao = 'dentro')::integer AS dentro,
      count(*) FILTER (WHERE classificacao = 'outra_lideranca')::integer AS outra_lideranca,
      count(*) FILTER (WHERE classificacao = 'nao_encontrado')::integer AS fora,
      count(*) FILTER (WHERE classificacao = 'ausente_lista')::integer AS ausentes,
      count(*) FILTER (WHERE classificacao IN (
        'sem_contrato', 'arquivado', 'possivel_correspondencia', 'conflito_nome',
        'repetido_lista', 'dados_invalidos'
      ))::integer AS atencao
    FROM public.eleicao_conferencia_itens
    WHERE lista_id = v_lista_id
  ) s
  WHERE l.id = v_lista_id;

  SELECT jsonb_build_object('lista', to_jsonb(l))
  INTO v_result
  FROM public.eleicao_conferencia_listas l
  WHERE l.id = v_lista_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_conferencia_processar(uuid, text, text, date, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eleicao_conferencia_processar(uuid, text, text, date, uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.eleicao_conferencia_processar(uuid, text, text, date, uuid, jsonb) IS
  'Conferencia isolada: le eleicao_pessoas e grava exclusivamente nas tabelas eleicao_conferencia_*.';

NOTIFY pgrst, 'reload schema';
