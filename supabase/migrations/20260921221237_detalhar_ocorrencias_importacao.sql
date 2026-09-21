-- Retorna as ocorrências de um lote com os dados do cadastro que provocou o
-- bloqueio. O JSONB mantém a resposta em uma linha e evita o limite padrão do
-- PostgREST, enquanto a validação do cliente impede acesso entre campanhas.

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_ocorrencias(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_client_id uuid;
  v_result jsonb;
BEGIN
  SELECT l.client_id INTO v_client_id
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id=p_lote_id;

  IF v_client_id IS NULL OR NOT (SELECT public.is_client_member(v_client_id)) THEN
    RAISE EXCEPTION 'Lote nao encontrado';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'numero_linha',i.numero_linha,
    'nome',i.nome,
    'cpf_normalizado',i.cpf_normalizado,
    'telefone_normalizado',i.telefone_normalizado,
    'classificacao',i.classificacao,
    'motivo',i.motivo,
    'valor_aplicado',i.valor_aplicado,
    'pessoa_existente_id',i.pessoa_existente_id,
    'duplicado',CASE WHEN existente.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id',existente.id,
      'nome',existente.nome,
      'tipo',existente.tipo::text,
      'telefone',existente.telefone,
      'cpf',existente.cpf,
      'responsavel_id',responsavel.id,
      'responsavel_nome',responsavel.nome,
      'responsavel_tipo',responsavel.tipo::text,
      'valor_contratacao',existente.valor_contratacao,
      'is_voluntario',existente.is_voluntario,
      'contrato_inicio',existente.contrato_inicio,
      'contrato_fim',existente.contrato_fim,
      'importacao_lote_id',existente.importacao_lote_id
    ) END
  ) ORDER BY i.numero_linha),'[]'::jsonb)
  INTO v_result
  FROM public.eleicao_cabo_import_itens i
  LEFT JOIN public.eleicao_pessoas existente
    ON existente.id=i.pessoa_existente_id
    AND existente.client_id=v_client_id
  LEFT JOIN public.eleicao_pessoas responsavel
    ON responsavel.id=existente.parent_id
    AND responsavel.client_id=v_client_id
  WHERE i.lote_id=p_lote_id
    AND i.client_id=v_client_id
    AND i.classificacao IN (
      'duplicado_contrato_ativo','duplicado_no_arquivo',
      'conflito_identidade','dados_invalidos'
    );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_ocorrencias(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_ocorrencias(uuid)
  TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
