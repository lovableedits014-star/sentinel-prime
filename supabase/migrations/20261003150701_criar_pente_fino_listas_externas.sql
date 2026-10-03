-- Conferencia auditavel entre listas externas e a estrutura eleitoral.
-- O telefone e a chave forte. Nome igual sem telefone gera apenas sugestao,
-- para que uma coincidencia aproximada nunca altere ou confirme um cadastro.

CREATE TABLE public.eleicao_conferencia_listas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome text NOT NULL CHECK (nullif(btrim(nome), '') IS NOT NULL),
  arquivo_nome text NOT NULL,
  referencia_em date NOT NULL DEFAULT current_date,
  lideranca_esperada_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  total_lista integer NOT NULL DEFAULT 0 CHECK (total_lista >= 0),
  total_dentro integer NOT NULL DEFAULT 0 CHECK (total_dentro >= 0),
  total_outra_lideranca integer NOT NULL DEFAULT 0 CHECK (total_outra_lideranca >= 0),
  total_fora integer NOT NULL DEFAULT 0 CHECK (total_fora >= 0),
  total_ausentes integer NOT NULL DEFAULT 0 CHECK (total_ausentes >= 0),
  total_atencao integer NOT NULL DEFAULT 0 CHECK (total_atencao >= 0),
  criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, client_id)
);

CREATE TABLE public.eleicao_conferencia_itens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lista_id uuid NOT NULL,
  origem text NOT NULL CHECK (origem IN ('lista', 'sistema')),
  numero_linha integer,
  nome_informado text,
  telefone_informado text,
  telefone_key text,
  pessoa_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  pessoa_nome text,
  pessoa_telefone text,
  pessoa_tipo text,
  responsavel_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  responsavel_nome text,
  metodo_correspondencia text CHECK (
    metodo_correspondencia IS NULL OR metodo_correspondencia IN ('telefone', 'nome')
  ),
  classificacao text NOT NULL CHECK (classificacao IN (
    'dentro', 'outra_lideranca', 'sem_contrato', 'arquivado',
    'nao_encontrado', 'possivel_correspondencia', 'conflito_nome',
    'repetido_lista', 'dados_invalidos', 'ausente_lista'
  )),
  motivo text NOT NULL,
  contrato_inicio date,
  contrato_fim date,
  valor_contratacao numeric(12,2),
  conferido boolean NOT NULL DEFAULT false,
  observacoes text,
  conferido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conferido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eleicao_conferencia_item_linha CHECK (
    (origem = 'lista' AND numero_linha IS NOT NULL AND numero_linha > 0)
    OR (origem = 'sistema' AND numero_linha IS NULL)
  ),
  CONSTRAINT eleicao_conferencia_item_lista_cliente_fkey
    FOREIGN KEY (lista_id, client_id)
    REFERENCES public.eleicao_conferencia_listas(id, client_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX eleicao_conferencia_itens_linha_uidx
  ON public.eleicao_conferencia_itens(lista_id, numero_linha)
  WHERE origem = 'lista';
CREATE UNIQUE INDEX eleicao_conferencia_itens_ausente_uidx
  ON public.eleicao_conferencia_itens(lista_id, pessoa_id)
  WHERE origem = 'sistema';
CREATE INDEX eleicao_conferencia_listas_cliente_idx
  ON public.eleicao_conferencia_listas(client_id, created_at DESC);
CREATE INDEX eleicao_conferencia_itens_lista_classificacao_idx
  ON public.eleicao_conferencia_itens(lista_id, classificacao, conferido, id);
CREATE INDEX eleicao_conferencia_itens_cliente_telefone_idx
  ON public.eleicao_conferencia_itens(client_id, telefone_key)
  WHERE telefone_key IS NOT NULL;
CREATE INDEX eleicao_conferencia_itens_pessoa_idx
  ON public.eleicao_conferencia_itens(pessoa_id)
  WHERE pessoa_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS eleicao_pessoas_cliente_nome_key_idx
  ON public.eleicao_pessoas(client_id, public.eleicao_nome_key(nome));

ALTER TABLE public.eleicao_conferencia_listas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eleicao_conferencia_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY eleicao_conferencia_listas_select
  ON public.eleicao_conferencia_listas FOR SELECT TO authenticated
  USING ((SELECT public.is_client_member(client_id)));
CREATE POLICY eleicao_conferencia_listas_insert
  ON public.eleicao_conferencia_listas FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_client_member(client_id))
    AND (
      lideranca_esperada_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.eleicao_pessoas p
        WHERE p.id = lideranca_esperada_id
          AND p.client_id = eleicao_conferencia_listas.client_id
      )
    )
  );
CREATE POLICY eleicao_conferencia_listas_update
  ON public.eleicao_conferencia_listas FOR UPDATE TO authenticated
  USING ((SELECT public.is_client_member(client_id)))
  WITH CHECK (
    (SELECT public.is_client_member(client_id))
    AND (
      lideranca_esperada_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.eleicao_pessoas p
        WHERE p.id = lideranca_esperada_id
          AND p.client_id = eleicao_conferencia_listas.client_id
      )
    )
  );
CREATE POLICY eleicao_conferencia_listas_delete
  ON public.eleicao_conferencia_listas FOR DELETE TO authenticated
  USING ((SELECT public.is_client_member(client_id)));

CREATE POLICY eleicao_conferencia_itens_select
  ON public.eleicao_conferencia_itens FOR SELECT TO authenticated
  USING ((SELECT public.is_client_member(client_id)));
CREATE POLICY eleicao_conferencia_itens_insert
  ON public.eleicao_conferencia_itens FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_client_member(client_id)));
CREATE POLICY eleicao_conferencia_itens_update
  ON public.eleicao_conferencia_itens FOR UPDATE TO authenticated
  USING ((SELECT public.is_client_member(client_id)))
  WITH CHECK ((SELECT public.is_client_member(client_id)));
CREATE POLICY eleicao_conferencia_itens_delete
  ON public.eleicao_conferencia_itens FOR DELETE TO authenticated
  USING ((SELECT public.is_client_member(client_id)));

REVOKE ALL ON public.eleicao_conferencia_listas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.eleicao_conferencia_itens FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_conferencia_listas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_conferencia_itens TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.eleicao_conferencia_itens_id_seq TO authenticated;

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
    SELECT 1 FROM public.eleicao_pessoas p
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
    p_client_id, btrim(p_nome), coalesce(nullif(btrim(p_arquivo_nome), ''), 'lista.xlsx'),
    p_referencia_em, p_lideranca_esperada_id, v_total
  ) RETURNING id INTO v_lista_id;

  WITH RECURSIVE escopo_lideranca AS (
    SELECT p.id
    FROM public.eleicao_pessoas p
    WHERE p.id = p_lideranca_esperada_id AND p.client_id = p_client_id
    UNION
    SELECT filho.id
    FROM public.eleicao_pessoas filho
    JOIN escopo_lideranca pai ON pai.id = filho.parent_id
    WHERE filho.client_id = p_client_id
  ), raw AS (
    SELECT
      x.ordinality::integer AS numero_linha,
      nullif(btrim(x.value->>'nome'), '') AS nome,
      nullif(btrim(x.value->>'telefone'), '') AS telefone,
      public.tele_phone_key(x.value->>'telefone') AS telefone_key,
      public.eleicao_nome_key(x.value->>'nome') AS nome_key
    FROM jsonb_array_elements(p_linhas) WITH ORDINALITY x(value, ordinality)
  ), ranked AS (
    SELECT r.*,
      CASE WHEN r.telefone_key IS NULL THEN 1 ELSE
        row_number() OVER (PARTITION BY r.telefone_key ORDER BY r.numero_linha)
      END AS telefone_ordem
    FROM raw r
  ), candidatos AS (
    SELECT r.*,
      telefone_match.id AS telefone_pessoa_id,
      nome_match.id AS nome_pessoa_id
    FROM ranked r
    LEFT JOIN LATERAL (
      SELECT p.id
      FROM public.eleicao_pessoas p
      WHERE p.client_id = p_client_id
        AND r.telefone_key IS NOT NULL
        AND public.tele_phone_key(p.telefone) = r.telefone_key
      ORDER BY
        (public.eleicao_nome_key(p.nome) = r.nome_key) DESC,
        (p.arquivado_em IS NULL) DESC,
        p.created_at DESC,
        p.id
      LIMIT 1
    ) telefone_match ON true
    LEFT JOIN LATERAL (
      SELECT min(p.id::text)::uuid AS id
      FROM public.eleicao_pessoas p
      WHERE p.client_id = p_client_id
        AND r.nome_key IS NOT NULL
        AND public.eleicao_nome_key(p.nome) = r.nome_key
      HAVING count(*) = 1
    ) nome_match ON telefone_match.id IS NULL
  ), resolvidos AS (
    SELECT c.*,
      coalesce(c.telefone_pessoa_id, c.nome_pessoa_id) AS pessoa_id,
      CASE WHEN c.telefone_pessoa_id IS NOT NULL THEN 'telefone'
           WHEN c.nome_pessoa_id IS NOT NULL THEN 'nome' END AS metodo
    FROM candidatos c
  )
  INSERT INTO public.eleicao_conferencia_itens (
    client_id, lista_id, origem, numero_linha, nome_informado, telefone_informado,
    telefone_key, pessoa_id, pessoa_nome, pessoa_telefone, pessoa_tipo,
    responsavel_id, responsavel_nome, metodo_correspondencia, classificacao,
    motivo, contrato_inicio, contrato_fim, valor_contratacao
  )
  SELECT
    p_client_id, v_lista_id, 'lista', r.numero_linha, r.nome, r.telefone,
    r.telefone_key, p.id, p.nome, p.telefone, p.tipo::text,
    responsavel.id, responsavel.nome, r.metodo,
    CASE
      WHEN r.nome IS NULL AND r.telefone_key IS NULL THEN 'dados_invalidos'
      WHEN r.telefone_key IS NOT NULL AND length(r.telefone_key) < 10 THEN 'dados_invalidos'
      WHEN r.telefone_ordem > 1 THEN 'repetido_lista'
      WHEN r.metodo = 'nome' THEN 'possivel_correspondencia'
      WHEN p.id IS NULL THEN 'nao_encontrado'
      WHEN public.eleicao_nome_key(r.nome) IS NOT NULL
        AND public.eleicao_nome_key(r.nome) IS DISTINCT FROM public.eleicao_nome_key(p.nome)
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
      WHEN r.nome IS NULL AND r.telefone_key IS NULL THEN 'Nome e telefone ausentes'
      WHEN r.telefone_key IS NOT NULL AND length(r.telefone_key) < 10 THEN 'Telefone possui menos de 10 digitos'
      WHEN r.telefone_ordem > 1 THEN 'Telefone repetido dentro da lista'
      WHEN r.metodo = 'nome' THEN 'Nome igual encontrado; confirme manualmente antes de vincular'
      WHEN p.id IS NULL THEN 'Nao localizado no cadastro eleitoral'
      WHEN public.eleicao_nome_key(r.nome) IS NOT NULL
        AND public.eleicao_nome_key(r.nome) IS DISTINCT FROM public.eleicao_nome_key(p.nome)
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
    coalesce(p.contrato_fim, p.vigencia_fim), p.valor_contratacao
  FROM resolvidos r
  LEFT JOIN public.eleicao_pessoas p ON p.id = r.pessoa_id AND p.client_id = p_client_id
  LEFT JOIN public.eleicao_pessoas responsavel
    ON responsavel.id = p.parent_id AND responsavel.client_id = p_client_id;

  -- Gera o inverso do pente-fino: contratos ativos que deveriam estar no
  -- escopo escolhido, mas cujo telefone nao apareceu na lista externa.
  WITH RECURSIVE escopo_lideranca AS (
    SELECT p.id
    FROM public.eleicao_pessoas p
    WHERE p.id = p_lideranca_esperada_id AND p.client_id = p_client_id
    UNION
    SELECT filho.id
    FROM public.eleicao_pessoas filho
    JOIN escopo_lideranca pai ON pai.id = filho.parent_id
    WHERE filho.client_id = p_client_id
  )
  INSERT INTO public.eleicao_conferencia_itens (
    client_id, lista_id, origem, nome_informado, telefone_informado, telefone_key,
    pessoa_id, pessoa_nome, pessoa_telefone, pessoa_tipo, responsavel_id,
    responsavel_nome, metodo_correspondencia, classificacao, motivo,
    contrato_inicio, contrato_fim, valor_contratacao
  )
  SELECT
    p_client_id, v_lista_id, 'sistema', p.nome, p.telefone,
    public.tele_phone_key(p.telefone), p.id, p.nome, p.telefone, p.tipo::text,
    responsavel.id, responsavel.nome, 'telefone', 'ausente_lista',
    'Possui contrato ativo no sistema, mas nao apareceu na lista externa',
    coalesce(p.contrato_inicio, p.vigencia_inicio),
    coalesce(p.contrato_fim, p.vigencia_fim), p.valor_contratacao
  FROM public.eleicao_pessoas p
  LEFT JOIN public.eleicao_pessoas responsavel
    ON responsavel.id = p.parent_id AND responsavel.client_id = p_client_id
  WHERE p.client_id = p_client_id
    AND p.arquivado_em IS NULL
    AND NOT coalesce(p.is_voluntario, false)
    AND coalesce(p.valor_contratacao, 0) > 0
    AND coalesce(p.contrato_inicio, p.vigencia_inicio, '-infinity'::date) <= p_referencia_em
    AND coalesce(p.contrato_fim, p.vigencia_fim, 'infinity'::date) >= p_referencia_em
    AND (p_lideranca_esperada_id IS NULL OR (
      p.id <> p_lideranca_esperada_id
      AND EXISTS (SELECT 1 FROM escopo_lideranca e WHERE e.id = p.id)
    ))
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

  SELECT jsonb_build_object('lista', to_jsonb(l)) INTO v_result
  FROM public.eleicao_conferencia_listas l
  WHERE l.id = v_lista_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_conferencia_processar(uuid, text, text, date, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eleicao_conferencia_processar(uuid, text, text, date, uuid, jsonb)
  TO authenticated;

COMMENT ON TABLE public.eleicao_conferencia_listas IS
  'Historico de comparacoes entre listas externas e contratos da estrutura eleitoral.';
COMMENT ON TABLE public.eleicao_conferencia_itens IS
  'Resultado por pessoa, incluindo linhas externas e contratos ativos ausentes da lista.';
COMMENT ON FUNCTION public.eleicao_conferencia_processar(uuid, text, text, date, uuid, jsonb) IS
  'Compara nome e telefone de uma lista externa com contratos e liderancas, preservando o resultado para auditoria.';

NOTIFY pgrst, 'reload schema';
