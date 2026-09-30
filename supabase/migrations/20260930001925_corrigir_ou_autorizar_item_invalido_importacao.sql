-- Permite corrigir uma linha invalida de um lote ja confirmado ou autorizar,
-- de forma explicita e auditada, a contratacao sem telefone.

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_corrigir_item_invalido(
  p_lote_id uuid,
  p_item_id bigint,
  p_nome text,
  p_cpf text,
  p_telefone text,
  p_autorizar_sem_telefone boolean,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lote public.eleicao_cabo_import_lotes%ROWTYPE;
  v_item public.eleicao_cabo_import_itens%ROWTYPE;
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_cpf text := nullif(public.eleicao_cabo_import_digits(p_cpf), '');
  v_telefone text := public.tele_phone_key(p_telefone);
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_pessoa_id uuid;
  v_total integer;
  v_invalidos integer;
  v_custo numeric;
BEGIN
  SELECT l.*
  INTO v_lote
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id = p_lote_id
  FOR UPDATE;

  SELECT i.*
  INTO v_item
  FROM public.eleicao_cabo_import_itens i
  WHERE i.id = p_item_id
    AND i.lote_id = p_lote_id
  FOR UPDATE;

  IF v_lote.id IS NULL OR v_item.id IS NULL
    OR NOT (SELECT public.is_client_member(v_lote.client_id)) THEN
    RAISE EXCEPTION 'Lote ou linha nao encontrado';
  END IF;
  IF v_lote.status <> 'confirmado' THEN
    RAISE EXCEPTION 'O lote precisa estar confirmado';
  END IF;
  IF v_item.classificacao <> 'dados_invalidos' THEN
    RAISE EXCEPTION 'Esta linha nao esta pendente como dados invalidos';
  END IF;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Informe o nome';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da correcao ou autorizacao';
  END IF;
  IF v_cpf IS NOT NULL AND length(v_cpf) <> 11 THEN
    RAISE EXCEPTION 'CPF deve possuir 11 digitos';
  END IF;

  IF coalesce(p_autorizar_sem_telefone, false) THEN
    v_telefone := NULL;
  ELSIF v_telefone IS NULL OR length(v_telefone) < 10 THEN
    RAISE EXCEPTION 'Informe um telefone valido com DDD ou autorize o cadastro sem telefone';
  END IF;

  IF v_lote.parent_id_padrao IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.eleicao_pessoas responsavel
    WHERE responsavel.id = v_lote.parent_id_padrao
      AND responsavel.client_id = v_lote.client_id
      AND responsavel.arquivado_em IS NULL
      AND responsavel.tipo::text IN ('coordenador', 'lider')
  ) THEN
    RAISE EXCEPTION 'O responsavel do lote nao esta ativo';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_lote.client_id::text)
  );

  IF EXISTS (
    SELECT 1
    FROM public.eleicao_pessoas p
    WHERE p.client_id = v_lote.client_id
      AND p.arquivado_em IS NULL
      AND (
        (v_telefone IS NOT NULL AND public.tele_phone_key(p.telefone) = v_telefone)
        OR (v_cpf IS NOT NULL
          AND public.eleicao_cabo_import_digits(p.cpf) = v_cpf)
      )
  ) THEN
    RAISE EXCEPTION 'O CPF ou telefone informado ja pertence a outro cadastro ativo';
  END IF;

  INSERT INTO public.eleicao_pessoas(
    client_id, tipo, escopo, regiao, cidade, nome, telefone, endereco, bairro,
    parent_id, cpf, valor_contratacao, is_voluntario, created_by,
    contrato_inicio, contrato_fim, importacao_lote_id
  ) VALUES (
    v_lote.client_id, 'cabo', v_lote.escopo_padrao, v_lote.regiao_padrao,
    v_lote.cidade_padrao, v_nome, v_telefone,
    coalesce(v_item.endereco, 'Nao informado'), v_item.bairro,
    v_lote.parent_id_padrao, v_cpf, v_lote.valor_unitario, false,
    (SELECT auth.uid()), v_lote.data_inicio, v_lote.data_fim, v_lote.id
  )
  RETURNING id INTO v_pessoa_id;

  UPDATE public.eleicao_cabo_import_itens
  SET nome = v_nome,
      cpf_normalizado = v_cpf,
      telefone_normalizado = v_telefone,
      sem_telefone_autorizado = coalesce(p_autorizar_sem_telefone, false),
      classificacao = 'confirmado',
      motivo = CASE
        WHEN coalesce(p_autorizar_sem_telefone, false)
          THEN 'Contratacao sem telefone autorizada: ' || v_motivo
        ELSE 'Contratacao confirmada apos correcao: ' || v_motivo
      END,
      pessoa_existente_id = v_pessoa_id,
      valor_aplicado = v_lote.valor_unitario,
      processado_em = now(),
      correcao_dados = jsonb_build_object(
        'nome_original', v_item.nome,
        'cpf_original', v_item.cpf_normalizado,
        'telefone_original', v_item.telefone_normalizado,
        'nome_corrigido', v_nome,
        'cpf_corrigido', v_cpf,
        'telefone_corrigido', v_telefone,
        'sem_telefone_autorizado', coalesce(p_autorizar_sem_telefone, false)
      ),
      correcao_motivo = v_motivo,
      corrigido_em = now(),
      corrigido_por = (SELECT auth.uid())
  WHERE id = v_item.id;

  SELECT count(*)::integer, coalesce(sum(p.valor_contratacao), 0)
  INTO v_total, v_custo
  FROM public.eleicao_pessoas p
  WHERE p.client_id = v_lote.client_id
    AND p.importacao_lote_id = v_lote.id
    AND p.arquivado_em IS NULL
    AND NOT coalesce(p.is_voluntario, false)
    AND coalesce(p.valor_contratacao, 0) > 0;

  SELECT count(*)::integer
  INTO v_invalidos
  FROM public.eleicao_cabo_import_itens i
  WHERE i.lote_id = v_lote.id
    AND i.classificacao IN ('conflito_identidade', 'dados_invalidos');

  UPDATE public.eleicao_cabo_import_lotes
  SET total_elegiveis = v_total,
      total_invalidos = v_invalidos,
      custo_confirmado = v_custo
  WHERE id = v_lote.id;

  RETURN jsonb_build_object(
    'item_id', v_item.id,
    'pessoa_id', v_pessoa_id,
    'contratado', true,
    'sem_telefone', coalesce(p_autorizar_sem_telefone, false),
    'valor', v_lote.valor_unitario
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_corrigir_item_invalido(
  uuid, bigint, text, text, text, boolean, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_corrigir_item_invalido(
  uuid, bigint, text, text, text, boolean, text
) TO authenticated;

COMMENT ON FUNCTION public.eleicao_cabo_import_corrigir_item_invalido(
  uuid, bigint, text, text, text, boolean, text
) IS 'Corrige ou autoriza sem telefone uma linha invalida de lote confirmado, criando contrato com auditoria.';

NOTIFY pgrst, 'reload schema';
