-- Esta excecao pertence somente ao fluxo administrativo de importacao. O
-- restante do cadastro eleitoral continua exigindo telefone normalmente.

ALTER TABLE public.eleicao_cabo_import_itens
  ADD COLUMN IF NOT EXISTS sem_telefone_autorizado boolean NOT NULL DEFAULT false;

ALTER TABLE public.eleicao_cabo_import_excecoes
  DROP CONSTRAINT IF EXISTS eleicao_cabo_import_excecoes_tipo_check;
ALTER TABLE public.eleicao_cabo_import_excecoes
  ADD CONSTRAINT eleicao_cabo_import_excecoes_tipo_check
  CHECK (tipo IN ('telefone_compartilhado', 'sem_telefone'));

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_exigir_nome_telefone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF nullif(btrim(coalesce(NEW.nome,'')),'') IS NULL THEN
    NEW.classificacao := 'dados_invalidos';
    NEW.motivo := 'Nome ausente';
    NEW.valor_aplicado := 0;
  ELSIF coalesce(length(public.tele_phone_key(NEW.telefone_normalizado)),0) < 10
    AND NOT NEW.sem_telefone_autorizado THEN
    NEW.classificacao := 'dados_invalidos';
    NEW.motivo := 'Telefone com DDD e obrigatorio';
    NEW.valor_aplicado := 0;
  ELSIF NEW.cpf_normalizado IS NOT NULL
    AND length(public.eleicao_cabo_import_digits(NEW.cpf_normalizado)) <> 11 THEN
    NEW.classificacao := 'dados_invalidos';
    NEW.motivo := 'CPF informado deve possuir 11 digitos';
    NEW.valor_aplicado := 0;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_analisar_excepcional(
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
  p_linhas jsonb,
  p_permitir_sem_telefone boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
  v_lote_id uuid;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;

  v_result := public.eleicao_cabo_import_analisar(
    p_client_id, p_nome, p_arquivo_nome, p_valor_unitario, p_data_inicio,
    p_data_fim, p_parent_id, p_escopo, p_regiao, p_cidade, p_linhas
  );
  v_lote_id := (v_result->'lote'->>'id')::uuid;

  IF p_permitir_sem_telefone THEN
    UPDATE public.eleicao_cabo_import_itens i
    SET sem_telefone_autorizado = true,
        classificacao = 'elegivel',
        motivo = 'Cadastro sem telefone autorizado nesta importacao',
        valor_aplicado = p_valor_unitario
    WHERE i.lote_id = v_lote_id
      AND i.client_id = p_client_id
      AND nullif(btrim(coalesce(i.nome, '')), '') IS NOT NULL
      AND public.tele_phone_key(i.telefone_normalizado) IS NULL
      AND (i.cpf_normalizado IS NULL OR length(i.cpf_normalizado) = 11)
      AND i.classificacao = 'dados_invalidos';

    UPDATE public.eleicao_cabo_import_lotes l
    SET total_elegiveis = s.elegiveis,
        total_duplicados = s.duplicados,
        total_invalidos = s.invalidos,
        custo_previsto = s.elegiveis * l.valor_unitario
    FROM (
      SELECT
        count(*) FILTER (WHERE classificacao IN ('elegivel','cadastro_sem_contrato'))::integer elegiveis,
        count(*) FILTER (WHERE classificacao IN ('duplicado_contrato_ativo','duplicado_no_arquivo'))::integer duplicados,
        count(*) FILTER (WHERE classificacao IN ('conflito_identidade','dados_invalidos'))::integer invalidos
      FROM public.eleicao_cabo_import_itens
      WHERE lote_id = v_lote_id
    ) s
    WHERE l.id = v_lote_id;
  END IF;

  SELECT jsonb_build_object(
    'lote', to_jsonb(l),
    'itens', coalesce((
      SELECT jsonb_agg(to_jsonb(i) ORDER BY i.numero_linha)
      FROM public.eleicao_cabo_import_itens i
      WHERE i.lote_id = l.id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id = v_lote_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_auditar_sem_telefone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.classificacao = 'confirmado'
    AND NEW.sem_telefone_autorizado
    AND (OLD.classificacao IS DISTINCT FROM NEW.classificacao
      OR OLD.pessoa_existente_id IS DISTINCT FROM NEW.pessoa_existente_id) THEN
    INSERT INTO public.eleicao_cabo_import_excecoes(
      client_id, lote_id, item_id, pessoa_criada_id, tipo, motivo, aprovado_por
    ) VALUES (
      NEW.client_id, NEW.lote_id, NEW.id, NEW.pessoa_existente_id,
      'sem_telefone', 'Cadastro sem telefone autorizado na aba de importacao',
      (SELECT auth.uid())
    ) ON CONFLICT (item_id, tipo) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- A confirmacao legada usava o CPF como fallback de telefone. Nesta fachada o
-- CPF e preservado nos dados originais, mas nunca e gravado como telefone.
CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_confirmar_excepcional(p_lote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_client_id uuid;
  v_result jsonb;
BEGIN
  SELECT l.client_id INTO v_client_id
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id = p_lote_id;
  IF v_client_id IS NULL OR NOT (SELECT public.is_client_member(v_client_id)) THEN
    RAISE EXCEPTION 'Lote nao encontrado';
  END IF;

  UPDATE public.eleicao_cabo_import_itens
  SET cpf_normalizado = NULL
  WHERE lote_id = p_lote_id
    AND sem_telefone_autorizado
    AND public.tele_phone_key(telefone_normalizado) IS NULL;

  v_result := public.eleicao_cabo_import_confirmar(p_lote_id);

  UPDATE public.eleicao_pessoas p
  SET telefone = NULL,
      cpf = public.eleicao_cabo_import_digits(i.dados_originais->>'cpf')
  FROM public.eleicao_cabo_import_itens i
  WHERE i.lote_id = p_lote_id
    AND i.pessoa_existente_id = p.id
    AND i.sem_telefone_autorizado;

  UPDATE public.eleicao_cabo_import_itens
  SET cpf_normalizado = public.eleicao_cabo_import_digits(dados_originais->>'cpf')
  WHERE lote_id = p_lote_id
    AND sem_telefone_autorizado;

  RETURN v_result;
END;
$$;

DROP TRIGGER IF EXISTS trg_eleicao_cabo_import_auditar_sem_telefone
  ON public.eleicao_cabo_import_itens;
CREATE TRIGGER trg_eleicao_cabo_import_auditar_sem_telefone
AFTER UPDATE OF classificacao, pessoa_existente_id
ON public.eleicao_cabo_import_itens
FOR EACH ROW EXECUTE FUNCTION public.eleicao_cabo_import_auditar_sem_telefone();

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_analisar_excepcional(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb,boolean
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_analisar_excepcional(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb,boolean
) TO authenticated;
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_confirmar_excepcional(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_confirmar_excepcional(uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_auditar_sem_telefone()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.eleicao_cabo_import_analisar_excepcional(
  uuid,text,text,numeric,date,date,uuid,text,text,text,jsonb,boolean
) IS 'Analisa cabos e permite, somente quando autorizado na importacao, cadastro sem telefone.';

NOTIFY pgrst, 'reload schema';
