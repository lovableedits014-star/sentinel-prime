-- Nome e telefone sao obrigatorios. CPF e endereco continuam opcionais.
-- A normalizacao do nome permite explicar quando a coincidencia principal foi
-- o conjunto nome + telefone, sem deixar de bloquear telefone ou CPF isolados.

CREATE OR REPLACE FUNCTION public.eleicao_nome_key(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = '' AS $$
  SELECT nullif(regexp_replace(
    pg_catalog.translate(pg_catalog.lower(pg_catalog.btrim(coalesce(p_value,''))),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]','','g'
  ),'');
$$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_exigir_nome_telefone()
RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF nullif(btrim(coalesce(NEW.nome,'')),'') IS NULL THEN
    NEW.classificacao:='dados_invalidos';
    NEW.motivo:='Nome ausente';
    NEW.valor_aplicado:=0;
  ELSIF coalesce(length(public.tele_phone_key(NEW.telefone_normalizado)),0)<10 THEN
    NEW.classificacao:='dados_invalidos';
    NEW.motivo:='Telefone com DDD e obrigatorio';
    NEW.valor_aplicado:=0;
  ELSIF NEW.cpf_normalizado IS NOT NULL
    AND length(public.eleicao_cabo_import_digits(NEW.cpf_normalizado))<>11 THEN
    NEW.classificacao:='dados_invalidos';
    NEW.motivo:='CPF informado deve possuir 11 digitos';
    NEW.valor_aplicado:=0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eleicao_cabo_import_exigir_nome_telefone
  ON public.eleicao_cabo_import_itens;
CREATE TRIGGER trg_eleicao_cabo_import_exigir_nome_telefone
BEFORE INSERT OR UPDATE OF nome,telefone_normalizado,cpf_normalizado,classificacao
ON public.eleicao_cabo_import_itens
FOR EACH ROW EXECUTE FUNCTION public.eleicao_cabo_import_exigir_nome_telefone();

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
    AND i.classificacao='duplicado_contrato_ativo';

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_nome_key(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_exigir_nome_telefone()
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_casos_duplicados_ativos(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_nome_key(text)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_casos_duplicados_ativos(uuid)
  TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
