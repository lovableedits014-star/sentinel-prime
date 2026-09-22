-- Separa contratos ativos de repeticoes internas da planilha. Antes, ambos
-- alimentavam total_duplicados, embora somente o primeiro represente risco de
-- pagamento em duplicidade.

ALTER TABLE public.eleicao_cabo_import_lotes
  ADD COLUMN IF NOT EXISTS total_repetidos_arquivo integer NOT NULL DEFAULT 0
    CHECK (total_repetidos_arquivo >= 0);

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_separar_contadores()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  SELECT
    count(*) FILTER (WHERE i.classificacao='duplicado_contrato_ativo')::integer,
    count(*) FILTER (WHERE i.classificacao='duplicado_no_arquivo')::integer
  INTO NEW.total_duplicados,NEW.total_repetidos_arquivo
  FROM public.eleicao_cabo_import_itens i
  WHERE i.lote_id=NEW.id AND i.client_id=NEW.client_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eleicao_cabo_import_separar_contadores
  ON public.eleicao_cabo_import_lotes;
CREATE TRIGGER trg_eleicao_cabo_import_separar_contadores
BEFORE UPDATE OF total_duplicados ON public.eleicao_cabo_import_lotes
FOR EACH ROW EXECUTE FUNCTION public.eleicao_cabo_import_separar_contadores();

-- Corrige os lotes historicos sem apagar nenhuma ocorrencia.
UPDATE public.eleicao_cabo_import_lotes l SET
  total_duplicados=s.contratos_ativos,
  total_repetidos_arquivo=s.repetidos_arquivo
FROM (
  SELECT i.lote_id,
    count(*) FILTER (WHERE i.classificacao='duplicado_contrato_ativo')::integer contratos_ativos,
    count(*) FILTER (WHERE i.classificacao='duplicado_no_arquivo')::integer repetidos_arquivo
  FROM public.eleicao_cabo_import_itens i
  GROUP BY i.lote_id
) s
WHERE l.id=s.lote_id;

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
    'lote_nome',l.nome,
    'arquivo_nome',l.arquivo_nome,
    'data_tentativa',coalesce(i.processado_em,i.created_at,l.created_at),
    'responsavel_tentativa_id',tentativa_resp.id,
    'responsavel_tentativa_nome',tentativa_resp.nome,
    'responsavel_tentativa_tipo',tentativa_resp.tipo::text,
    'numero_linha',i.numero_linha,
    'nome',i.nome,
    'cpf_normalizado',i.cpf_normalizado,
    'telefone_normalizado',i.telefone_normalizado,
    'classificacao',i.classificacao,
    'motivo',i.motivo,
    'valor_aplicado',i.valor_aplicado,
    'pessoa_existente_id',existente.id,
    'duplicado',CASE WHEN i.classificacao<>'duplicado_contrato_ativo'
      OR existente.id IS NULL THEN NULL ELSE jsonb_build_object(
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
      ) END,
    'repetido_no_arquivo',CASE WHEN origem_arquivo.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id',origem_arquivo.id,
        'numero_linha',origem_arquivo.numero_linha,
        'nome',origem_arquivo.nome,
        'cpf_normalizado',origem_arquivo.cpf_normalizado,
        'telefone_normalizado',origem_arquivo.telefone_normalizado
      ) END
  ) ORDER BY i.numero_linha),'[]'::jsonb)
  INTO v_result
  FROM public.eleicao_cabo_import_itens i
  JOIN public.eleicao_cabo_import_lotes l
    ON l.id=i.lote_id AND l.client_id=v_client_id
  LEFT JOIN public.eleicao_pessoas tentativa_resp
    ON tentativa_resp.id=l.parent_id_padrao
    AND tentativa_resp.client_id=v_client_id
  LEFT JOIN LATERAL (
    SELECT p.*
    FROM public.eleicao_pessoas p
    WHERE i.classificacao='duplicado_contrato_ativo'
      AND p.client_id=v_client_id
      AND (
        p.id=i.pessoa_existente_id
        OR (i.cpf_normalizado IS NOT NULL
          AND public.eleicao_cabo_import_digits(p.cpf)=i.cpf_normalizado)
        OR (i.telefone_normalizado IS NOT NULL
          AND public.eleicao_cabo_import_digits(p.telefone)=i.telefone_normalizado)
      )
    ORDER BY
      (p.id=i.pessoa_existente_id) DESC,
      (p.arquivado_em IS NULL
        AND NOT coalesce(p.is_voluntario,false)
        AND coalesce(p.valor_contratacao,0)>0) DESC,
      p.created_at DESC
    LIMIT 1
  ) existente ON true
  LEFT JOIN public.eleicao_pessoas responsavel
    ON responsavel.id=existente.parent_id
    AND responsavel.client_id=v_client_id
  LEFT JOIN LATERAL (
    SELECT anterior.id,anterior.numero_linha,anterior.nome,
      anterior.cpf_normalizado,anterior.telefone_normalizado
    FROM public.eleicao_cabo_import_itens anterior
    WHERE i.classificacao='duplicado_no_arquivo'
      AND anterior.lote_id=i.lote_id
      AND anterior.client_id=i.client_id
      AND anterior.numero_linha<i.numero_linha
      AND (
        (i.cpf_normalizado IS NOT NULL
          AND anterior.cpf_normalizado=i.cpf_normalizado)
        OR (i.telefone_normalizado IS NOT NULL
          AND anterior.telefone_normalizado=i.telefone_normalizado)
      )
    ORDER BY anterior.numero_linha
    LIMIT 1
  ) origem_arquivo ON true
  WHERE i.lote_id=p_lote_id
    AND i.client_id=v_client_id
    AND i.classificacao IN (
      'duplicado_contrato_ativo','duplicado_no_arquivo',
      'conflito_identidade','dados_invalidos'
    );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_separar_contadores()
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_ocorrencias(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_ocorrencias(uuid)
  TO authenticated,service_role;

COMMENT ON COLUMN public.eleicao_cabo_import_lotes.total_duplicados IS
  'Quantidade de tentativas recusadas porque ja existe contrato ativo.';
COMMENT ON COLUMN public.eleicao_cabo_import_lotes.total_repetidos_arquivo IS
  'Quantidade de linhas repetidas dentro da propria planilha.';

NOTIFY pgrst,'reload schema';
