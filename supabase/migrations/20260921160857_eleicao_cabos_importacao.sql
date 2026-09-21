-- Importacao auditavel de listas de cabos eleitorais.
-- A planilha e analisada primeiro; apenas itens elegiveis entram no custo e
-- a confirmacao revalida duplicidades sob trava transacional por cliente.

ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS contrato_inicio date,
  ADD COLUMN IF NOT EXISTS contrato_fim date,
  ADD COLUMN IF NOT EXISTS importacao_lote_id uuid;

CREATE TABLE public.eleicao_cabo_import_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome text NOT NULL,
  arquivo_nome text NOT NULL,
  valor_unitario numeric(12,2) NOT NULL CHECK (valor_unitario > 0),
  data_inicio date NOT NULL DEFAULT current_date,
  data_fim date,
  parent_id_padrao uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  escopo_padrao public.eleicao_escopo NOT NULL,
  regiao_padrao text,
  cidade_padrao text,
  status text NOT NULL DEFAULT 'analisado'
    CHECK (status IN ('analisado','confirmando','confirmado','cancelado','falhou')),
  total_linhas integer NOT NULL DEFAULT 0 CHECK (total_linhas >= 0),
  total_elegiveis integer NOT NULL DEFAULT 0 CHECK (total_elegiveis >= 0),
  total_duplicados integer NOT NULL DEFAULT 0 CHECK (total_duplicados >= 0),
  total_invalidos integer NOT NULL DEFAULT 0 CHECK (total_invalidos >= 0),
  custo_bruto numeric(14,2) NOT NULL DEFAULT 0 CHECK (custo_bruto >= 0),
  custo_previsto numeric(14,2) NOT NULL DEFAULT 0 CHECK (custo_previsto >= 0),
  custo_confirmado numeric(14,2) NOT NULL DEFAULT 0 CHECK (custo_confirmado >= 0),
  criado_por uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  analisado_em timestamptz NOT NULL DEFAULT now(),
  confirmado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eleicao_cabo_import_periodo_valido CHECK (data_fim IS NULL OR data_fim >= data_inicio),
  CONSTRAINT eleicao_cabo_import_localizacao CHECK (
    (escopo_padrao = 'campo_grande' AND regiao_padrao IS NOT NULL)
    OR (escopo_padrao = 'interior' AND nullif(btrim(cidade_padrao),'') IS NOT NULL)
  )
);

CREATE TABLE public.eleicao_cabo_import_itens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.eleicao_cabo_import_lotes(id) ON DELETE CASCADE,
  numero_linha integer NOT NULL CHECK (numero_linha > 0),
  dados_originais jsonb NOT NULL DEFAULT '{}'::jsonb,
  nome text,
  cpf_normalizado text,
  telefone_normalizado text,
  endereco text,
  bairro text,
  cidade text,
  regiao text,
  pessoa_existente_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  classificacao text NOT NULL CHECK (classificacao IN (
    'elegivel','cadastro_sem_contrato','duplicado_contrato_ativo',
    'duplicado_no_arquivo','conflito_identidade','dados_invalidos','confirmado'
  )),
  motivo text,
  valor_aplicado numeric(12,2) NOT NULL DEFAULT 0 CHECK (valor_aplicado >= 0),
  processado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lote_id, numero_linha)
);

ALTER TABLE public.eleicao_pessoas
  ADD CONSTRAINT eleicao_pessoas_importacao_lote_fkey
  FOREIGN KEY (importacao_lote_id) REFERENCES public.eleicao_cabo_import_lotes(id) ON DELETE SET NULL;
CREATE INDEX idx_eleicao_pessoas_importacao_lote
  ON public.eleicao_pessoas(importacao_lote_id)
  WHERE importacao_lote_id IS NOT NULL;

CREATE INDEX idx_eleicao_cabo_import_lotes_cliente
  ON public.eleicao_cabo_import_lotes(client_id, created_at DESC);
CREATE INDEX idx_eleicao_cabo_import_itens_lote_classificacao
  ON public.eleicao_cabo_import_itens(lote_id, classificacao, numero_linha);
CREATE INDEX idx_eleicao_cabo_import_itens_cliente_cpf
  ON public.eleicao_cabo_import_itens(client_id, cpf_normalizado)
  WHERE cpf_normalizado IS NOT NULL;
CREATE INDEX idx_eleicao_cabo_import_itens_cliente_telefone
  ON public.eleicao_cabo_import_itens(client_id, telefone_normalizado)
  WHERE telefone_normalizado IS NOT NULL;

ALTER TABLE public.eleicao_cabo_import_lotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eleicao_cabo_import_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY eleicao_cabo_import_lotes_member
  ON public.eleicao_cabo_import_lotes FOR ALL TO authenticated
  USING ((SELECT public.is_client_member(client_id)))
  WITH CHECK ((SELECT public.is_client_member(client_id)));
CREATE POLICY eleicao_cabo_import_itens_member
  ON public.eleicao_cabo_import_itens FOR ALL TO authenticated
  USING ((SELECT public.is_client_member(client_id)))
  WITH CHECK ((SELECT public.is_client_member(client_id)));

REVOKE ALL ON public.eleicao_cabo_import_lotes FROM PUBLIC, anon;
REVOKE ALL ON public.eleicao_cabo_import_itens FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.eleicao_cabo_import_lotes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.eleicao_cabo_import_itens TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.eleicao_cabo_import_itens_id_seq TO authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_digits(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT nullif(regexp_replace(coalesce(p_value,''), '[^0-9]', '', 'g'), '');
$$;

CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_cpf_normalizado_import
  ON public.eleicao_pessoas(client_id, public.eleicao_cabo_import_digits(cpf))
  WHERE cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_telefone_normalizado_import
  ON public.eleicao_pessoas(client_id, public.eleicao_cabo_import_digits(telefone))
  WHERE telefone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_analisar(
  p_client_id uuid,
  p_nome text,
  p_arquivo_nome text,
  p_valor_unitario numeric,
  p_data_inicio date,
  p_data_fim date,
  p_parent_id uuid,
  p_escopo text,
  p_regiao text,
  p_cidade text,
  p_linhas jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_lote_id uuid;
  v_result jsonb;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;
  IF p_valor_unitario IS NULL OR p_valor_unitario <= 0 THEN
    RAISE EXCEPTION 'O valor unitario deve ser maior que zero';
  END IF;
  IF p_data_inicio IS NULL OR (p_data_fim IS NOT NULL AND p_data_fim < p_data_inicio) THEN
    RAISE EXCEPTION 'Periodo de contratacao invalido';
  END IF;
  IF jsonb_typeof(p_linhas) <> 'array' OR jsonb_array_length(p_linhas) = 0 THEN
    RAISE EXCEPTION 'A planilha nao possui linhas';
  END IF;
  IF jsonb_array_length(p_linhas) > 10000 THEN
    RAISE EXCEPTION 'Limite de 10000 linhas por importacao';
  END IF;
  IF p_parent_id IS NULL THEN RAISE EXCEPTION 'Selecione o responsavel'; END IF;

  -- A localizacao do lote sempre vem do lider/coordenador. Os parametros de
  -- localizacao existem por compatibilidade com a RPC, mas nao sao confiados.
  SELECT p.escopo::text,p.regiao,p.cidade
    INTO p_escopo,p_regiao,p_cidade
  FROM public.eleicao_pessoas p
  WHERE p.id=p_parent_id AND p.client_id=p_client_id AND p.arquivado_em IS NULL
    AND p.tipo::text IN ('coordenador','lider');
  IF NOT FOUND THEN RAISE EXCEPTION 'Responsavel padrao invalido'; END IF;
  IF p_escopo = 'campo_grande' AND nullif(btrim(coalesce(p_regiao,'')),'') IS NULL THEN
    RAISE EXCEPTION 'O responsavel selecionado nao possui regiao cadastrada';
  END IF;
  IF p_escopo = 'interior' AND nullif(btrim(coalesce(p_cidade,'')),'') IS NULL THEN
    RAISE EXCEPTION 'O responsavel selecionado nao possui cidade cadastrada';
  END IF;

  INSERT INTO public.eleicao_cabo_import_lotes(
    client_id,nome,arquivo_nome,valor_unitario,data_inicio,data_fim,parent_id_padrao,
    escopo_padrao,regiao_padrao,cidade_padrao
  ) VALUES (
    p_client_id,coalesce(nullif(btrim(p_nome),''),p_arquivo_nome),p_arquivo_nome,
    p_valor_unitario,p_data_inicio,p_data_fim,p_parent_id,p_escopo::public.eleicao_escopo,
    CASE WHEN p_escopo='campo_grande' THEN p_regiao END,
    CASE WHEN p_escopo='interior' THEN btrim(p_cidade) END
  ) RETURNING id INTO v_lote_id;

  WITH raw AS (
    SELECT
      row_number() OVER ()::integer numero_linha,
      x.value dados,
      nullif(btrim(x.value->>'nome'),'') nome,
      public.eleicao_cabo_import_digits(x.value->>'cpf') cpf,
      public.eleicao_cabo_import_digits(x.value->>'telefone') telefone
    FROM jsonb_array_elements(p_linhas) WITH ORDINALITY x(value, ord)
    ORDER BY x.ord
  ), ranked AS (
    SELECT r.*,
      CASE WHEN r.cpf IS NOT NULL THEN row_number() OVER (PARTITION BY r.cpf ORDER BY r.numero_linha) ELSE 1 END cpf_rn,
      CASE WHEN r.telefone IS NOT NULL THEN row_number() OVER (PARTITION BY r.telefone ORDER BY r.numero_linha) ELSE 1 END tel_rn
    FROM raw r
  ), matched AS (
    SELECT r.*,
      cpf_match.id cpf_id, cpf_match.arquivado_em cpf_arquivado,
      cpf_match.is_voluntario cpf_voluntario, cpf_match.valor_contratacao cpf_valor,
      cpf_match.contrato_fim cpf_contrato_fim,
      tel_match.id tel_id, tel_match.arquivado_em tel_arquivado,
      tel_match.is_voluntario tel_voluntario, tel_match.valor_contratacao tel_valor,
      tel_match.contrato_fim tel_contrato_fim
    FROM ranked r
    LEFT JOIN LATERAL (
      SELECT p.id,p.arquivado_em,p.is_voluntario,p.valor_contratacao,p.contrato_fim
      FROM public.eleicao_pessoas p
      WHERE p.client_id=p_client_id AND r.cpf IS NOT NULL
        AND public.eleicao_cabo_import_digits(p.cpf)=r.cpf
      ORDER BY (p.arquivado_em IS NULL) DESC,p.created_at DESC LIMIT 1
    ) cpf_match ON true
    LEFT JOIN LATERAL (
      SELECT p.id,p.arquivado_em,p.is_voluntario,p.valor_contratacao,p.contrato_fim
      FROM public.eleicao_pessoas p
      WHERE p.client_id=p_client_id AND r.telefone IS NOT NULL
        AND public.eleicao_cabo_import_digits(p.telefone)=r.telefone
      ORDER BY (p.arquivado_em IS NULL) DESC,p.created_at DESC LIMIT 1
    ) tel_match ON true
  )
  INSERT INTO public.eleicao_cabo_import_itens(
    client_id,lote_id,numero_linha,dados_originais,nome,cpf_normalizado,
    telefone_normalizado,endereco,bairro,cidade,regiao,pessoa_existente_id,
    classificacao,motivo,valor_aplicado
  )
  SELECT p_client_id,v_lote_id,m.numero_linha,m.dados,m.nome,m.cpf,m.telefone,
    nullif(btrim(m.dados->>'endereco'),''),nullif(btrim(m.dados->>'bairro'),''),
    nullif(btrim(m.dados->>'cidade'),''),nullif(lower(btrim(m.dados->>'regiao')),''),
    coalesce(m.cpf_id,m.tel_id),
    CASE
      WHEN m.nome IS NULL THEN 'dados_invalidos'
      WHEN m.cpf IS NULL AND (m.telefone IS NULL OR length(m.telefone)<10) THEN 'dados_invalidos'
      WHEN m.cpf IS NOT NULL AND length(m.cpf)<>11 THEN 'dados_invalidos'
      WHEN m.cpf_rn>1 OR m.tel_rn>1 THEN 'duplicado_no_arquivo'
      WHEN m.cpf_id IS NOT NULL AND m.tel_id IS NOT NULL AND m.cpf_id<>m.tel_id THEN 'conflito_identidade'
      WHEN coalesce(m.cpf_arquivado,m.tel_arquivado) IS NULL
        AND NOT coalesce(m.cpf_voluntario,m.tel_voluntario,false)
        AND coalesce(m.cpf_valor,m.tel_valor,0)>0
        AND (coalesce(m.cpf_contrato_fim,m.tel_contrato_fim) IS NULL
          OR coalesce(m.cpf_contrato_fim,m.tel_contrato_fim)>=p_data_inicio) THEN 'duplicado_contrato_ativo'
      WHEN coalesce(m.cpf_id,m.tel_id) IS NOT NULL THEN 'cadastro_sem_contrato'
      ELSE 'elegivel'
    END,
    CASE
      WHEN m.nome IS NULL THEN 'Nome ausente'
      WHEN m.cpf IS NULL AND (m.telefone IS NULL OR length(m.telefone)<10) THEN 'Informe CPF ou telefone valido'
      WHEN m.cpf IS NOT NULL AND length(m.cpf)<>11 THEN 'CPF deve possuir 11 digitos'
      WHEN m.cpf_rn>1 OR m.tel_rn>1 THEN 'Repetido dentro da planilha'
      WHEN m.cpf_id IS NOT NULL AND m.tel_id IS NOT NULL AND m.cpf_id<>m.tel_id THEN 'CPF e telefone pertencem a cadastros diferentes'
      WHEN coalesce(m.cpf_arquivado,m.tel_arquivado) IS NULL
        AND NOT coalesce(m.cpf_voluntario,m.tel_voluntario,false)
        AND coalesce(m.cpf_valor,m.tel_valor,0)>0
        AND (coalesce(m.cpf_contrato_fim,m.tel_contrato_fim) IS NULL
          OR coalesce(m.cpf_contrato_fim,m.tel_contrato_fim)>=p_data_inicio) THEN 'Ja possui contrato ativo'
      WHEN coalesce(m.cpf_id,m.tel_id) IS NOT NULL THEN 'Cadastro existente sera reaproveitado'
      ELSE 'Pronto para importar'
    END,
    CASE WHEN
      m.nome IS NOT NULL
      AND NOT (m.cpf IS NULL AND (m.telefone IS NULL OR length(m.telefone)<10))
      AND NOT (m.cpf IS NOT NULL AND length(m.cpf)<>11)
      AND m.cpf_rn=1 AND m.tel_rn=1
      AND NOT (m.cpf_id IS NOT NULL AND m.tel_id IS NOT NULL AND m.cpf_id<>m.tel_id)
      AND NOT (coalesce(m.cpf_arquivado,m.tel_arquivado) IS NULL
        AND NOT coalesce(m.cpf_voluntario,m.tel_voluntario,false)
        AND coalesce(m.cpf_valor,m.tel_valor,0)>0
        AND (coalesce(m.cpf_contrato_fim,m.tel_contrato_fim) IS NULL
          OR coalesce(m.cpf_contrato_fim,m.tel_contrato_fim)>=p_data_inicio))
      THEN p_valor_unitario ELSE 0 END
  FROM matched m;

  UPDATE public.eleicao_cabo_import_lotes l SET
    total_linhas=s.total,
    total_elegiveis=s.elegiveis,
    total_duplicados=s.duplicados,
    total_invalidos=s.invalidos,
    custo_bruto=s.total*p_valor_unitario,
    custo_previsto=s.elegiveis*p_valor_unitario
  FROM (
    SELECT count(*)::int total,
      count(*) FILTER (WHERE classificacao IN ('elegivel','cadastro_sem_contrato'))::int elegiveis,
      count(*) FILTER (WHERE classificacao IN ('duplicado_contrato_ativo','duplicado_no_arquivo'))::int duplicados,
      count(*) FILTER (WHERE classificacao IN ('conflito_identidade','dados_invalidos'))::int invalidos
    FROM public.eleicao_cabo_import_itens WHERE lote_id=v_lote_id
  ) s WHERE l.id=v_lote_id;

  SELECT jsonb_build_object('lote',to_jsonb(l),'itens',coalesce((
    SELECT jsonb_agg(to_jsonb(i) ORDER BY i.numero_linha)
    FROM public.eleicao_cabo_import_itens i WHERE i.lote_id=l.id
  ),'[]'::jsonb)) INTO v_result
  FROM public.eleicao_cabo_import_lotes l WHERE l.id=v_lote_id;
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_confirmar(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_lote public.eleicao_cabo_import_lotes%ROWTYPE;
  v_item public.eleicao_cabo_import_itens%ROWTYPE;
  v_existing public.eleicao_pessoas%ROWTYPE;
  v_pessoa_id uuid;
  v_confirmados integer := 0;
  v_duplicados integer := 0;
BEGIN
  SELECT * INTO v_lote FROM public.eleicao_cabo_import_lotes WHERE id=p_lote_id FOR UPDATE;
  IF v_lote.id IS NULL OR NOT (SELECT public.is_client_member(v_lote.client_id)) THEN
    RAISE EXCEPTION 'Lote nao encontrado';
  END IF;
  IF v_lote.status <> 'analisado' THEN RAISE EXCEPTION 'Este lote nao pode ser confirmado'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_lote.client_id::text));
  UPDATE public.eleicao_cabo_import_lotes SET status='confirmando' WHERE id=p_lote_id;

  FOR v_item IN
    SELECT * FROM public.eleicao_cabo_import_itens
    WHERE lote_id=p_lote_id AND classificacao IN ('elegivel','cadastro_sem_contrato')
    ORDER BY numero_linha FOR UPDATE
  LOOP
    v_existing := NULL;
    SELECT p.* INTO v_existing
    FROM public.eleicao_pessoas p
    WHERE p.client_id=v_lote.client_id AND (
      (v_item.cpf_normalizado IS NOT NULL AND public.eleicao_cabo_import_digits(p.cpf)=v_item.cpf_normalizado)
      OR (v_item.telefone_normalizado IS NOT NULL AND public.eleicao_cabo_import_digits(p.telefone)=v_item.telefone_normalizado)
    )
    ORDER BY (p.arquivado_em IS NULL) DESC,p.created_at DESC LIMIT 1 FOR UPDATE;

    IF v_existing.id IS NOT NULL AND v_existing.arquivado_em IS NULL
      AND NOT coalesce(v_existing.is_voluntario,false)
      AND coalesce(v_existing.valor_contratacao,0)>0
      AND (v_existing.contrato_fim IS NULL OR v_existing.contrato_fim >= v_lote.data_inicio) THEN
      UPDATE public.eleicao_cabo_import_itens SET
        classificacao='duplicado_contrato_ativo',motivo='Contrato ativo identificado na confirmacao',
        pessoa_existente_id=v_existing.id,valor_aplicado=0,processado_em=now()
      WHERE id=v_item.id;
      v_duplicados:=v_duplicados+1;
      CONTINUE;
    END IF;

    IF v_existing.id IS NOT NULL THEN
      UPDATE public.eleicao_pessoas SET
        nome=coalesce(nullif(v_item.nome,''),nome),
        cpf=coalesce(v_item.cpf_normalizado,cpf),
        telefone=coalesce(v_item.telefone_normalizado,telefone),
        endereco=coalesce(v_item.endereco,endereco),
        bairro=coalesce(v_item.bairro,bairro),
        parent_id=coalesce(v_lote.parent_id_padrao,parent_id),
        escopo=v_lote.escopo_padrao,regiao=v_lote.regiao_padrao,cidade=v_lote.cidade_padrao,
        valor_contratacao=v_lote.valor_unitario,is_voluntario=false,
        contrato_inicio=v_lote.data_inicio,contrato_fim=v_lote.data_fim,
        importacao_lote_id=v_lote.id,
        arquivado_em=NULL,arquivado_por=NULL,arquivamento_motivo=NULL,arquivamento_lote_id=NULL
      WHERE id=v_existing.id RETURNING id INTO v_pessoa_id;
    ELSE
      INSERT INTO public.eleicao_pessoas(
        client_id,tipo,escopo,regiao,cidade,nome,telefone,endereco,bairro,parent_id,
        cpf,valor_contratacao,is_voluntario,created_by,contrato_inicio,contrato_fim,importacao_lote_id
      ) VALUES (
        v_lote.client_id,'cabo',v_lote.escopo_padrao,v_lote.regiao_padrao,
        v_lote.cidade_padrao,v_item.nome,
        coalesce(v_item.telefone_normalizado,v_item.cpf_normalizado),
        coalesce(v_item.endereco,'Nao informado'),v_item.bairro,v_lote.parent_id_padrao,
        v_item.cpf_normalizado,v_lote.valor_unitario,false,(SELECT auth.uid()),
        v_lote.data_inicio,v_lote.data_fim,v_lote.id
      ) RETURNING id INTO v_pessoa_id;
    END IF;

    UPDATE public.eleicao_cabo_import_itens SET
      classificacao='confirmado',motivo='Contratacao confirmada',pessoa_existente_id=v_pessoa_id,
      valor_aplicado=v_lote.valor_unitario,processado_em=now()
    WHERE id=v_item.id;
    v_confirmados:=v_confirmados+1;
  END LOOP;

  UPDATE public.eleicao_cabo_import_lotes SET
    status='confirmado',total_elegiveis=v_confirmados,
    total_duplicados=total_duplicados+v_duplicados,
    custo_confirmado=v_confirmados*valor_unitario,confirmado_em=now()
  WHERE id=p_lote_id;

  RETURN jsonb_build_object(
    'lote_id',p_lote_id,'confirmados',v_confirmados,'duplicados_na_confirmacao',v_duplicados,
    'custo_confirmado',v_confirmados*v_lote.valor_unitario
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_digits(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_analisar(uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_confirmar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_digits(text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_analisar(uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_confirmar(uuid) TO authenticated;

NOTIFY pgrst,'reload schema';
