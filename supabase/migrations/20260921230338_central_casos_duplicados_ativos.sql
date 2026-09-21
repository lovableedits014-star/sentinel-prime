-- Central de casos recusados porque a pessoa já possuía contrato ativo.
-- Retorna uma única linha JSONB para não sofrer paginação do PostgREST.

CREATE OR REPLACE FUNCTION public.eleicao_casos_duplicados_ativos(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,
    'data_tentativa',coalesce(i.processado_em,i.created_at),
    'lote_id',l.id,
    'lote_nome',l.nome,
    'arquivo_nome',l.arquivo_nome,
    'numero_linha',i.numero_linha,
    'nome_tentativa',i.nome,
    'cpf_tentativa',i.cpf_normalizado,
    'telefone_tentativa',i.telefone_normalizado,
    'responsavel_tentativa_id',tentativa_resp.id,
    'responsavel_tentativa_nome',tentativa_resp.nome,
    'responsavel_tentativa_tipo',tentativa_resp.tipo::text,
    'cadastro_existente_id',existente.id,
    'cadastro_existente_nome',existente.nome,
    'cadastro_existente_tipo',existente.tipo::text,
    'cadastro_existente_telefone',existente.telefone,
    'responsavel_existente_id',existente_resp.id,
    'responsavel_existente_nome',existente_resp.nome,
    'responsavel_existente_tipo',existente_resp.tipo::text,
    'valor_contratacao',existente.valor_contratacao,
    'contrato_inicio',existente.contrato_inicio,
    'contrato_fim',existente.contrato_fim,
    'motivo',i.motivo
  ) ORDER BY coalesce(i.processado_em,i.created_at) DESC,i.id DESC),'[]'::jsonb)
  INTO v_result
  FROM public.eleicao_cabo_import_itens i
  JOIN public.eleicao_cabo_import_lotes l
    ON l.id=i.lote_id AND l.client_id=p_client_id AND l.status='confirmado'
  JOIN public.eleicao_pessoas existente
    ON existente.id=i.pessoa_existente_id AND existente.client_id=p_client_id
    AND existente.arquivado_em IS NULL
    AND NOT coalesce(existente.is_voluntario,false)
    AND coalesce(existente.valor_contratacao,0)>0
    AND (existente.contrato_fim IS NULL OR existente.contrato_fim>=current_date)
  LEFT JOIN public.eleicao_pessoas tentativa_resp
    ON tentativa_resp.id=l.parent_id_padrao AND tentativa_resp.client_id=p_client_id
  LEFT JOIN public.eleicao_pessoas existente_resp
    ON existente_resp.id=existente.parent_id AND existente_resp.client_id=p_client_id
  WHERE i.client_id=p_client_id
    AND i.classificacao='duplicado_contrato_ativo';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_casos_duplicados_ativos(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_casos_duplicados_ativos(uuid)
  TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
