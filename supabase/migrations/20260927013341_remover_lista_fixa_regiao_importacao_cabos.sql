-- A primeira versao desta RPC foi aplicada com uma lista fixa de regioes de
-- Campo Grande. O arquivo da migration antiga foi corrigido depois, mas
-- migrations ja executadas nao rodam novamente. Mantemos a implementacao
-- anterior com outro nome e publicamos uma fachada que valida o responsavel,
-- nao o nome da regiao.
--
-- A implementacao anterior recebe "centro" apenas para atravessar a validacao
-- legada. Antes do INSERT, trg_eleicao_cabo_import_herdar_local_lote substitui
-- esse valor pela regiao real do responsavel.

ALTER FUNCTION public.eleicao_cabo_import_analisar(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb
) RENAME TO eleicao_cabo_import_analisar_legado_regiao_fixa;

CREATE FUNCTION public.eleicao_cabo_import_analisar(
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_escopo text;
  v_regiao text;
  v_cidade text;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;

  SELECT responsavel.escopo::text, responsavel.regiao, responsavel.cidade
  INTO v_escopo, v_regiao, v_cidade
  FROM public.eleicao_pessoas responsavel
  WHERE responsavel.id = p_parent_id
    AND responsavel.client_id = p_client_id
    AND responsavel.arquivado_em IS NULL
    AND responsavel.tipo::text IN ('coordenador', 'lider');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Responsavel padrao invalido';
  END IF;
  IF v_escopo = 'campo_grande'
    AND nullif(btrim(coalesce(v_regiao, '')), '') IS NULL THEN
    RAISE EXCEPTION 'O responsavel selecionado nao possui regiao cadastrada';
  END IF;
  IF v_escopo = 'interior'
    AND nullif(btrim(coalesce(v_cidade, '')), '') IS NULL THEN
    RAISE EXCEPTION 'O responsavel selecionado nao possui cidade cadastrada';
  END IF;

  RETURN public.eleicao_cabo_import_analisar_legado_regiao_fixa(
    p_client_id,
    p_nome,
    p_arquivo_nome,
    p_valor_unitario,
    p_data_inicio,
    p_data_fim,
    p_parent_id,
    v_escopo,
    CASE WHEN v_escopo = 'campo_grande' THEN 'centro' ELSE NULL END,
    CASE WHEN v_escopo = 'interior' THEN v_cidade ELSE NULL END,
    p_linhas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_analisar(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_analisar(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb
) TO authenticated;

-- A implementacao legada e detalhe interno da fachada e nao deve ficar
-- exposta como uma segunda RPC no PostgREST.
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_analisar_legado_regiao_fixa(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb
) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
