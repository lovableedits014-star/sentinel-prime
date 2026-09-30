-- Cabos criados por importacao continuam vinculados ao lote para auditoria,
-- mas podem ter um responsavel individual diferente do responsavel padrao.
-- A localizacao passa a ser herdada do responsavel efetivo da pessoa.

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_herdar_local_pessoa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_lote public.eleicao_cabo_import_lotes%ROWTYPE;
  v_parent public.eleicao_pessoas%ROWTYPE;
BEGIN
  IF NEW.importacao_lote_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.*
  INTO v_lote
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id = NEW.importacao_lote_id
    AND l.client_id = NEW.client_id;

  IF v_lote.id IS NULL THEN
    RAISE EXCEPTION 'Lote de importacao invalido';
  END IF;

  -- Na criacao, o lote fornece o responsavel padrao. Depois disso, uma edicao
  -- individual de parent_id deve ser preservada.
  NEW.parent_id := coalesce(NEW.parent_id, v_lote.parent_id_padrao);

  SELECT p.*
  INTO v_parent
  FROM public.eleicao_pessoas p
  WHERE p.id = NEW.parent_id
    AND p.client_id = NEW.client_id
    AND p.arquivado_em IS NULL
    AND p.tipo::text IN ('coordenador', 'lider');

  IF v_parent.id IS NULL THEN
    RAISE EXCEPTION 'Responsavel do cabo importado invalido';
  END IF;

  NEW.escopo := v_parent.escopo;
  NEW.regiao := CASE
    WHEN v_parent.escopo::text = 'campo_grande' THEN v_parent.regiao
  END;
  NEW.cidade := CASE
    WHEN v_parent.escopo::text = 'interior' THEN v_parent.cidade
  END;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_editar_contrato(
  p_lote_id uuid,
  p_item_id bigint,
  p_nome text,
  p_cpf text,
  p_telefone text,
  p_valor numeric,
  p_parent_id uuid,
  p_inicio date,
  p_fim date,
  p_ativo boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_client uuid;
  v_pessoa uuid;
  v_total integer;
  v_custo numeric;
  v_atualizados integer;
  v_parent_efetivo uuid;
BEGIN
  SELECT l.client_id, i.pessoa_existente_id
  INTO v_client, v_pessoa
  FROM public.eleicao_cabo_import_lotes l
  JOIN public.eleicao_cabo_import_itens i
    ON i.lote_id = l.id
   AND i.id = p_item_id
  WHERE l.id = p_lote_id
  FOR UPDATE OF l, i;

  IF v_client IS NULL OR NOT (SELECT public.is_client_member(v_client)) THEN
    RAISE EXCEPTION 'Lote ou item nao encontrado' USING ERRCODE = '42501';
  END IF;
  IF v_pessoa IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.eleicao_pessoas p
    WHERE p.id = v_pessoa
      AND p.client_id = v_client
      AND p.importacao_lote_id = p_lote_id
  ) THEN
    RAISE EXCEPTION 'Este registro pertence a outro lote e esta disponivel apenas para consulta';
  END IF;
  IF nullif(btrim(p_nome), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'Informe um valor maior que zero';
  END IF;
  IF p_fim IS NOT NULL AND p_fim < p_inicio THEN
    RAISE EXCEPTION 'Periodo invalido';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.eleicao_pessoas r
    WHERE r.id = p_parent_id
      AND r.client_id = v_client
      AND r.tipo::text IN ('coordenador', 'lider')
      AND r.arquivado_em IS NULL
  ) THEN
    RAISE EXCEPTION 'Responsavel invalido';
  END IF;

  UPDATE public.eleicao_pessoas
  SET nome = btrim(p_nome),
      cpf = nullif(public.eleicao_cabo_import_digits(p_cpf), ''),
      telefone = coalesce(
        nullif(public.eleicao_cabo_import_digits(p_telefone), ''),
        telefone
      ),
      valor_contratacao = p_valor,
      parent_id = p_parent_id,
      contrato_inicio = p_inicio,
      contrato_fim = p_fim,
      is_voluntario = false,
      arquivado_em = CASE
        WHEN p_ativo THEN NULL
        ELSE coalesce(arquivado_em, now())
      END,
      arquivado_por = CASE
        WHEN p_ativo THEN NULL
        ELSE (SELECT auth.uid())
      END,
      arquivamento_motivo = CASE
        WHEN p_ativo THEN NULL
        ELSE 'Excluido no gerenciamento do lote de importacao'
      END,
      arquivamento_lote_id = CASE
        WHEN p_ativo THEN NULL
        ELSE p_lote_id
      END
  WHERE id = v_pessoa
    AND client_id = v_client
  RETURNING parent_id INTO v_parent_efetivo;

  GET DIAGNOSTICS v_atualizados = ROW_COUNT;
  IF v_atualizados <> 1 THEN
    RAISE EXCEPTION 'O contrato nao foi atualizado' USING ERRCODE = '42501';
  END IF;
  IF v_parent_efetivo IS DISTINCT FROM p_parent_id THEN
    RAISE EXCEPTION 'O responsavel selecionado nao foi aplicado';
  END IF;

  UPDATE public.eleicao_cabo_import_itens
  SET nome = btrim(p_nome),
      cpf_normalizado = nullif(public.eleicao_cabo_import_digits(p_cpf), ''),
      telefone_normalizado = nullif(
        public.eleicao_cabo_import_digits(p_telefone),
        ''
      ),
      valor_aplicado = CASE WHEN p_ativo THEN p_valor ELSE 0 END,
      motivo = CASE
        WHEN p_ativo THEN 'Contrato editado e ativo'
        ELSE 'Contrato arquivado manualmente'
      END
  WHERE id = p_item_id
    AND lote_id = p_lote_id
    AND client_id = v_client;

  SELECT count(*)::integer, coalesce(sum(valor_contratacao), 0)
  INTO v_total, v_custo
  FROM public.eleicao_pessoas
  WHERE client_id = v_client
    AND importacao_lote_id = p_lote_id
    AND arquivado_em IS NULL
    AND NOT coalesce(is_voluntario, false)
    AND coalesce(valor_contratacao, 0) > 0;

  UPDATE public.eleicao_cabo_import_lotes
  SET total_elegiveis = v_total,
      custo_confirmado = v_custo
  WHERE id = p_lote_id
    AND client_id = v_client;

  RETURN jsonb_build_object(
    'pessoa_id', v_pessoa,
    'responsavel_id', v_parent_efetivo,
    'ativo', p_ativo,
    'contratos_ativos', v_total,
    'custo', v_custo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_editar_contrato(
  uuid, bigint, text, text, text, numeric, uuid, date, date, boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_editar_contrato(
  uuid, bigint, text, text, text, numeric, uuid, date, date, boolean
) TO authenticated, service_role;

COMMENT ON FUNCTION public.eleicao_cabo_import_herdar_local_pessoa() IS
  'Preserva o responsavel individual do cabo importado e herda sua localizacao.';

NOTIFY pgrst, 'reload schema';
