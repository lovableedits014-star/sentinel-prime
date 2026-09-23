-- Permite retirar da Central os casos de duplicidade que ja foram conferidos,
-- sem apagar a tentativa de importacao nem alterar o contrato existente.

ALTER TABLE public.eleicao_cabo_import_itens
  ADD COLUMN IF NOT EXISTS duplicado_arquivado_em timestamptz,
  ADD COLUMN IF NOT EXISTS duplicado_arquivado_por uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicado_arquivamento_motivo text;

CREATE INDEX IF NOT EXISTS idx_eleicao_import_duplicados_pendentes
  ON public.eleicao_cabo_import_itens(client_id, created_at DESC)
  WHERE classificacao = 'duplicado_contrato_ativo'
    AND duplicado_arquivado_em IS NULL;

CREATE OR REPLACE FUNCTION public.eleicao_casos_duplicados_arquivar(
  p_client_id uuid,
  p_item_ids bigint[],
  p_motivo text DEFAULT 'Duplicidade conferida manualmente'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_arquivados integer := 0;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(pg_catalog.array_length(p_item_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um caso para arquivar' USING ERRCODE = '22023';
  END IF;

  UPDATE public.eleicao_cabo_import_itens i
  SET duplicado_arquivado_em = pg_catalog.now(),
      duplicado_arquivado_por = (SELECT auth.uid()),
      duplicado_arquivamento_motivo = COALESCE(
        NULLIF(pg_catalog.btrim(p_motivo), ''),
        'Duplicidade conferida manualmente'
      )
  WHERE i.client_id = p_client_id
    AND i.id = ANY(p_item_ids)
    AND i.classificacao = 'duplicado_contrato_ativo'
    AND i.duplicado_arquivado_em IS NULL;
  GET DIAGNOSTICS v_arquivados = ROW_COUNT;

  RETURN jsonb_build_object('arquivados', v_arquivados);
END;
$$;

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
    'cadastro_existente_cpf',existente.cpf,
    'fatores_duplicidade',to_jsonb(array_remove(ARRAY[
      CASE WHEN public.tele_phone_key(i.telefone_normalizado) IS NOT NULL
        AND public.tele_phone_key(i.telefone_normalizado)=public.tele_phone_key(existente.telefone)
        AND public.eleicao_nome_key(i.nome)=public.eleicao_nome_key(existente.nome)
        THEN 'nome_telefone' END,
      CASE WHEN public.tele_phone_key(i.telefone_normalizado) IS NOT NULL
        AND public.tele_phone_key(i.telefone_normalizado)=public.tele_phone_key(existente.telefone)
        AND public.eleicao_nome_key(i.nome) IS DISTINCT FROM public.eleicao_nome_key(existente.nome)
        THEN 'telefone' END,
      CASE WHEN length(public.eleicao_cabo_import_digits(i.cpf_normalizado))=11
        AND public.eleicao_cabo_import_digits(i.cpf_normalizado)=public.eleicao_cabo_import_digits(existente.cpf)
        THEN 'cpf' END
    ],NULL)),
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
    AND i.classificacao='duplicado_contrato_ativo'
    AND i.duplicado_arquivado_em IS NULL;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_casos_duplicados_arquivar(uuid,bigint[],text)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_casos_duplicados_ativos(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_casos_duplicados_arquivar(uuid,bigint[],text)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_casos_duplicados_ativos(uuid)
  TO authenticated,service_role;

COMMENT ON COLUMN public.eleicao_cabo_import_itens.duplicado_arquivado_em IS
  'Data em que uma tentativa recusada foi conferida e retirada da Central de duplicados.';

NOTIFY pgrst,'reload schema';
