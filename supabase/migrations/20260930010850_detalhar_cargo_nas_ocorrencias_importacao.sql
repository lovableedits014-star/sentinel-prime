-- Explicita o cargo do cadastro que bloqueou a linha no gerenciamento do lote.

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_contratos(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client uuid;
  v_result jsonb;
BEGIN
  SELECT client_id INTO v_client
  FROM public.eleicao_cabo_import_lotes
  WHERE id = p_lote_id;

  IF v_client IS NULL OR NOT (SELECT public.is_client_member(v_client)) THEN
    RAISE EXCEPTION 'Lote nao encontrado' USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'item_id', i.id,
    'numero_linha', i.numero_linha,
    'classificacao', i.classificacao,
    'motivo', i.motivo,
    'nome_importado', i.nome,
    'cpf_importado', i.cpf_normalizado,
    'telefone_importado', i.telefone_normalizado,
    'pessoa_id', CASE WHEN p.importacao_lote_id = p_lote_id THEN p.id END,
    'nome', CASE WHEN p.importacao_lote_id = p_lote_id THEN p.nome ELSE i.nome END,
    'cpf', CASE WHEN p.importacao_lote_id = p_lote_id THEN p.cpf ELSE i.cpf_normalizado END,
    'telefone', CASE WHEN p.importacao_lote_id = p_lote_id THEN p.telefone ELSE i.telefone_normalizado END,
    'valor', CASE WHEN p.importacao_lote_id = p_lote_id THEN p.valor_contratacao END,
    'contrato_inicio', p.contrato_inicio,
    'contrato_fim', p.contrato_fim,
    'responsavel_id', p.parent_id,
    'responsavel_nome', r.nome,
    'arquivado_em', p.arquivado_em,
    'pertence_ao_lote', (p.importacao_lote_id = p_lote_id),
    'lote_contrato_id', p.importacao_lote_id,
    'lote_contrato_nome', origem.nome,
    'conflito_pessoa_id', CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN p.id END,
    'conflito_nome', CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN p.nome END,
    'conflito_tipo', CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN p.tipo::text END,
    'conflito_telefone', CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN p.telefone END,
    'conflito_cpf', CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN p.cpf END,
    'conflito_responsavel', CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN r.nome END,
    'conflito_responsavel_tipo', CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN r.tipo::text END,
    'repetido_no_arquivo', CASE WHEN repetido.id IS NULL THEN NULL ELSE jsonb_build_object(
      'item_id', repetido.id,
      'numero_linha', repetido.numero_linha,
      'nome', repetido.nome,
      'cpf', repetido.cpf_normalizado,
      'telefone', repetido.telefone_normalizado
    ) END
  ) ORDER BY i.numero_linha), '[]'::jsonb)
  INTO v_result
  FROM public.eleicao_cabo_import_itens i
  LEFT JOIN public.eleicao_pessoas p
    ON p.id = i.pessoa_existente_id AND p.client_id = v_client
  LEFT JOIN public.eleicao_pessoas r
    ON r.id = p.parent_id AND r.client_id = v_client
  LEFT JOIN public.eleicao_cabo_import_lotes origem
    ON origem.id = p.importacao_lote_id
  LEFT JOIN LATERAL (
    SELECT anterior.id, anterior.numero_linha, anterior.nome,
      anterior.cpf_normalizado, anterior.telefone_normalizado
    FROM public.eleicao_cabo_import_itens anterior
    WHERE i.classificacao = 'duplicado_no_arquivo'
      AND anterior.lote_id = i.lote_id
      AND anterior.client_id = i.client_id
      AND anterior.numero_linha < i.numero_linha
      AND (
        (i.cpf_normalizado IS NOT NULL
          AND anterior.cpf_normalizado = i.cpf_normalizado)
        OR (i.telefone_normalizado IS NOT NULL
          AND anterior.telefone_normalizado = i.telefone_normalizado)
      )
    ORDER BY anterior.numero_linha
    LIMIT 1
  ) repetido ON true
  WHERE i.lote_id = p_lote_id
    AND i.client_id = v_client;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_contratos(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_contratos(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.eleicao_cabo_import_contratos(uuid) IS
  'Lista contratos e ocorrencias do lote com linha repetida, cargo do conflito e responsavel.';

NOTIFY pgrst, 'reload schema';
