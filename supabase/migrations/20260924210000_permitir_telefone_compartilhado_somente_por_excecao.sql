-- Mantem a deduplicacao global, mas permite que a RPC de aprovacao manual
-- crie uma segunda pessoa quando duas pessoas realmente compartilham telefone.

ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS telefone_compartilhado_autorizado boolean NOT NULL DEFAULT false;

DROP INDEX IF EXISTS public.idx_eleicao_pessoas_unique_phone;

CREATE UNIQUE INDEX IF NOT EXISTS idx_eleicao_pessoas_unique_phone
  ON public.eleicao_pessoas(client_id, public.tele_phone_key(telefone))
  WHERE telefone IS NOT NULL
    AND arquivado_em IS NULL
    AND NOT telefone_compartilhado_autorizado;

CREATE OR REPLACE FUNCTION public.eleicao_pessoas_prevent_dup()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_phone text := public.tele_phone_key(NEW.telefone);
  v_cpf text := public.eleicao_cabo_import_digits(NEW.cpf);
  v_func_id uuid;
  v_duplicado record;
  v_excecao_autorizada boolean := false;
BEGIN
  IF NEW.arquivado_em IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.telefone_compartilhado_autorizado THEN
    SELECT EXISTS(
      SELECT 1
      FROM public.eleicao_cabo_import_excecoes e
      JOIN public.eleicao_cabo_import_itens i ON i.id=e.item_id AND i.lote_id=e.lote_id
      WHERE e.client_id=NEW.client_id
        AND e.lote_id=NEW.importacao_lote_id
        AND e.tipo='telefone_compartilhado'
        AND (e.pessoa_criada_id IS NULL OR e.pessoa_criada_id=NEW.id)
        AND public.tele_phone_key(i.telefone_normalizado)=v_phone
        AND public.eleicao_nome_key(i.nome)=public.eleicao_nome_key(NEW.nome)
    ) INTO v_excecao_autorizada;

    IF NOT v_excecao_autorizada THEN
      RAISE EXCEPTION 'Telefone compartilhado so pode ser autorizado pela ocorrencia da importacao.'
        USING ERRCODE='42501';
    END IF;
  END IF;

  IF v_phone IS NOT NULL THEN
    SELECT f.id INTO v_func_id
    FROM public.funcionarios f
    WHERE f.client_id=NEW.client_id
      AND public.tele_phone_key(f.telefone)=v_phone
    LIMIT 1;

    IF v_func_id IS NOT NULL THEN
      IF NEW.funcionario_id IS NULL THEN
        NEW.funcionario_id:=v_func_id;
      ELSIF NEW.funcionario_id<>v_func_id THEN
        RAISE EXCEPTION 'Telefone pertence a outro funcionario. Vincule ao funcionario correto.'
          USING ERRCODE='23505';
      END IF;
    END IF;
  END IF;

  SELECT p.id,p.nome,p.tipo::text tipo INTO v_duplicado
  FROM public.eleicao_pessoas p
  WHERE p.client_id=NEW.client_id AND p.id<>NEW.id
    AND p.arquivado_em IS NULL
    AND (
      (NOT NEW.telefone_compartilhado_autorizado
        AND v_phone IS NOT NULL AND public.tele_phone_key(p.telefone)=v_phone)
      OR (length(v_cpf)=11 AND public.eleicao_cabo_import_digits(p.cpf)=v_cpf)
    )
  ORDER BY p.created_at LIMIT 1;

  IF v_duplicado.id IS NOT NULL THEN
    RAISE EXCEPTION 'Pessoa ja cadastrada para % (%) neste cliente. CPF ou telefone duplicado.',
      v_duplicado.nome,v_duplicado.tipo USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_eleicao_pessoas_prevent_dup ON public.eleicao_pessoas;
CREATE TRIGGER trg_eleicao_pessoas_prevent_dup
BEFORE INSERT OR UPDATE OF nome,telefone,cpf,tipo,telefone_compartilhado_autorizado
ON public.eleicao_pessoas
FOR EACH ROW EXECUTE FUNCTION public.eleicao_pessoas_prevent_dup();

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_aprovar_telefone_compartilhado(
  p_lote_id uuid,p_item_id bigint,p_motivo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_lote public.eleicao_cabo_import_lotes%ROWTYPE;
  v_item public.eleicao_cabo_import_itens%ROWTYPE;
  v_conflito uuid; v_nova uuid; v_total int; v_custo numeric;
BEGIN
  SELECT * INTO v_lote FROM public.eleicao_cabo_import_lotes WHERE id=p_lote_id FOR UPDATE;
  SELECT * INTO v_item FROM public.eleicao_cabo_import_itens
    WHERE id=p_item_id AND lote_id=p_lote_id FOR UPDATE;
  IF v_lote.id IS NULL OR v_item.id IS NULL
    OR NOT(SELECT public.is_client_member(v_lote.client_id)) THEN
    RAISE EXCEPTION 'Item nao encontrado';
  END IF;
  IF v_item.classificacao NOT IN('duplicado_no_arquivo','duplicado_contrato_ativo') THEN
    RAISE EXCEPTION 'Este item nao e uma duplicidade aprovavel';
  END IF;
  IF nullif(btrim(coalesce(p_motivo,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da aprovacao manual';
  END IF;
  IF v_item.telefone_normalizado IS NULL THEN
    RAISE EXCEPTION 'O item nao possui telefone valido';
  END IF;

  SELECT p.id INTO v_conflito
  FROM public.eleicao_pessoas p
  WHERE p.client_id=v_lote.client_id
    AND p.arquivado_em IS NULL
    AND public.tele_phone_key(p.telefone)=public.tele_phone_key(v_item.telefone_normalizado)
  ORDER BY p.created_at LIMIT 1;
  IF v_conflito IS NULL THEN RAISE EXCEPTION 'O telefone conflitante nao foi encontrado'; END IF;
  IF EXISTS(SELECT 1 FROM public.eleicao_pessoas p WHERE p.id=v_conflito
    AND public.eleicao_nome_key(p.nome)=public.eleicao_nome_key(v_item.nome)) THEN
    RAISE EXCEPTION 'O nome e o telefone pertencem ao mesmo cadastro; edite o contrato existente';
  END IF;
  IF v_item.cpf_normalizado IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.eleicao_pessoas p
    WHERE p.client_id=v_lote.client_id
      AND public.eleicao_cabo_import_digits(p.cpf)=v_item.cpf_normalizado
  ) THEN
    RAISE EXCEPTION 'CPF ja cadastrado. A excecao permite compartilhar somente o telefone';
  END IF;

  INSERT INTO public.eleicao_cabo_import_excecoes(
    client_id,lote_id,item_id,pessoa_conflitante_id,tipo,motivo
  ) VALUES(
    v_lote.client_id,p_lote_id,p_item_id,v_conflito,'telefone_compartilhado',btrim(p_motivo)
  );

  INSERT INTO public.eleicao_pessoas(
    client_id,tipo,escopo,regiao,cidade,nome,telefone,endereco,bairro,parent_id,
    cpf,valor_contratacao,is_voluntario,created_by,contrato_inicio,contrato_fim,
    importacao_lote_id,telefone_compartilhado_autorizado
  ) VALUES(
    v_lote.client_id,'cabo',v_lote.escopo_padrao,v_lote.regiao_padrao,v_lote.cidade_padrao,
    v_item.nome,v_item.telefone_normalizado,coalesce(v_item.endereco,'Nao informado'),
    v_item.bairro,v_lote.parent_id_padrao,v_item.cpf_normalizado,v_lote.valor_unitario,false,
    (SELECT auth.uid()),v_lote.data_inicio,v_lote.data_fim,v_lote.id,true
  ) RETURNING id INTO v_nova;

  UPDATE public.eleicao_cabo_import_excecoes SET pessoa_criada_id=v_nova
  WHERE item_id=p_item_id AND tipo='telefone_compartilhado';
  UPDATE public.eleicao_cabo_import_itens SET pessoa_existente_id=v_nova,classificacao='confirmado',
    motivo='Telefone compartilhado aprovado manualmente: '||btrim(p_motivo),
    valor_aplicado=v_lote.valor_unitario,processado_em=now()
  WHERE id=v_item.id;

  SELECT count(*)::int,coalesce(sum(valor_contratacao),0) INTO v_total,v_custo
  FROM public.eleicao_pessoas
  WHERE client_id=v_lote.client_id AND importacao_lote_id=p_lote_id
    AND arquivado_em IS NULL AND NOT coalesce(is_voluntario,false)
    AND coalesce(valor_contratacao,0)>0;
  UPDATE public.eleicao_cabo_import_lotes SET total_elegiveis=v_total,custo_confirmado=v_custo,
    total_repetidos_arquivo=(SELECT count(*) FROM public.eleicao_cabo_import_itens
      WHERE lote_id=p_lote_id AND classificacao='duplicado_no_arquivo'),
    total_duplicados=(SELECT count(*) FROM public.eleicao_cabo_import_itens
      WHERE lote_id=p_lote_id AND classificacao='duplicado_contrato_ativo')
  WHERE id=p_lote_id;
  RETURN jsonb_build_object('pessoa_id',v_nova,'contratos_ativos',v_total,'custo',v_custo);
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_aprovar_telefone_compartilhado(uuid,bigint,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_aprovar_telefone_compartilhado(uuid,bigint,text)
  TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
