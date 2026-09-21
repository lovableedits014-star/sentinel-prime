-- O responsavel define toda a localizacao da importacao. A interface apenas
-- exibe o valor herdado; estes triggers garantem a regra no banco tambem.

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_herdar_local_lote()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_parent public.eleicao_pessoas%ROWTYPE;
BEGIN
  IF NEW.parent_id_padrao IS NULL THEN
    RAISE EXCEPTION 'Selecione o lider ou coordenador responsavel';
  END IF;

  SELECT p.* INTO v_parent
  FROM public.eleicao_pessoas p
  WHERE p.id=NEW.parent_id_padrao
    AND p.client_id=NEW.client_id
    AND p.arquivado_em IS NULL
    AND p.tipo::text IN ('coordenador','lider');

  IF v_parent.id IS NULL THEN RAISE EXCEPTION 'Responsavel padrao invalido'; END IF;
  IF v_parent.escopo::text='campo_grande' AND nullif(btrim(coalesce(v_parent.regiao,'')),'') IS NULL THEN
    RAISE EXCEPTION 'O responsavel selecionado nao possui regiao cadastrada';
  END IF;
  IF v_parent.escopo::text='interior' AND nullif(btrim(coalesce(v_parent.cidade,'')),'') IS NULL THEN
    RAISE EXCEPTION 'O responsavel selecionado nao possui cidade cadastrada';
  END IF;

  NEW.escopo_padrao:=v_parent.escopo;
  NEW.regiao_padrao:=CASE WHEN v_parent.escopo::text='campo_grande' THEN v_parent.regiao END;
  NEW.cidade_padrao:=CASE WHEN v_parent.escopo::text='interior' THEN v_parent.cidade END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eleicao_cabo_import_herdar_local_lote
  ON public.eleicao_cabo_import_lotes;
CREATE TRIGGER trg_eleicao_cabo_import_herdar_local_lote
BEFORE INSERT OR UPDATE OF parent_id_padrao,client_id,escopo_padrao,regiao_padrao,cidade_padrao
ON public.eleicao_cabo_import_lotes
FOR EACH ROW EXECUTE FUNCTION public.eleicao_cabo_import_herdar_local_lote();

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_herdar_local_pessoa()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_lote public.eleicao_cabo_import_lotes%ROWTYPE;
BEGIN
  IF NEW.importacao_lote_id IS NULL THEN RETURN NEW; END IF;

  SELECT l.* INTO v_lote
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id=NEW.importacao_lote_id AND l.client_id=NEW.client_id;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote de importacao invalido'; END IF;

  NEW.parent_id:=v_lote.parent_id_padrao;
  NEW.escopo:=v_lote.escopo_padrao;
  NEW.regiao:=v_lote.regiao_padrao;
  NEW.cidade:=v_lote.cidade_padrao;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eleicao_cabo_import_herdar_local_pessoa
  ON public.eleicao_pessoas;
CREATE TRIGGER trg_eleicao_cabo_import_herdar_local_pessoa
BEFORE INSERT OR UPDATE OF importacao_lote_id,parent_id,escopo,regiao,cidade
ON public.eleicao_pessoas
FOR EACH ROW
WHEN (NEW.importacao_lote_id IS NOT NULL)
EXECUTE FUNCTION public.eleicao_cabo_import_herdar_local_pessoa();

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_herdar_local_lote() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_herdar_local_pessoa() FROM PUBLIC,anon;

NOTIFY pgrst,'reload schema';
