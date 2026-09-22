-- Explica o fator de cada bloqueio e permite corrigir uma tentativa recusada.
-- A contratacao so ocorre depois de uma nova varredura por CPF e telefone.

ALTER TABLE public.eleicao_cabo_import_itens
  ADD COLUMN IF NOT EXISTS correcao_dados jsonb,
  ADD COLUMN IF NOT EXISTS correcao_motivo text,
  ADD COLUMN IF NOT EXISTS corrigido_em timestamptz,
  ADD COLUMN IF NOT EXISTS corrigido_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

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

CREATE OR REPLACE FUNCTION public.eleicao_caso_duplicado_corrigir_contratar(
  p_item_id bigint,
  p_nome text,
  p_cpf text,
  p_telefone text,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_item public.eleicao_cabo_import_itens%ROWTYPE;
  v_lote public.eleicao_cabo_import_lotes%ROWTYPE;
  v_nome text:=nullif(btrim(p_nome),'');
  v_cpf text:=public.eleicao_cabo_import_digits(p_cpf);
  v_phone text:=public.tele_phone_key(p_telefone);
  v_matches integer;
  v_existing public.eleicao_pessoas%ROWTYPE;
  v_pessoa_id uuid;
BEGIN
  SELECT i.* INTO v_item
  FROM public.eleicao_cabo_import_itens i
  WHERE i.id=p_item_id
  FOR UPDATE;
  IF v_item.id IS NULL THEN RAISE EXCEPTION 'Caso nao encontrado'; END IF;
  IF NOT (SELECT public.is_client_member(v_item.client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;
  IF v_item.classificacao<>'duplicado_contrato_ativo' THEN
    RAISE EXCEPTION 'Este caso nao esta pendente como contrato duplicado';
  END IF;

  SELECT l.* INTO v_lote
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id=v_item.lote_id AND l.client_id=v_item.client_id
    AND l.status='confirmado'
  FOR UPDATE;
  IF v_lote.id IS NULL THEN RAISE EXCEPTION 'Lote confirmado nao encontrado'; END IF;
  IF v_nome IS NULL THEN RAISE EXCEPTION 'Informe o nome'; END IF;
  IF v_phone IS NULL OR length(v_phone)<10 THEN
    RAISE EXCEPTION 'Informe um telefone valido com DDD';
  END IF;
  IF v_cpf IS NOT NULL AND length(v_cpf)<>11 THEN
    RAISE EXCEPTION 'CPF deve possuir 11 digitos';
  END IF;
  IF nullif(btrim(coalesce(p_motivo,'')),'') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da correcao';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_item.client_id::text)
  );

  SELECT count(DISTINCT p.id)::integer INTO v_matches
  FROM public.eleicao_pessoas p
  WHERE p.client_id=v_item.client_id AND p.arquivado_em IS NULL
    AND (
      public.tele_phone_key(p.telefone)=v_phone
      OR (v_cpf IS NOT NULL AND public.eleicao_cabo_import_digits(p.cpf)=v_cpf)
    );
  IF v_matches>1 THEN
    RAISE EXCEPTION 'CPF e telefone corrigidos pertencem a cadastros diferentes';
  END IF;

  SELECT p.* INTO v_existing
  FROM public.eleicao_pessoas p
  WHERE p.client_id=v_item.client_id AND p.arquivado_em IS NULL
    AND (
      public.tele_phone_key(p.telefone)=v_phone
      OR (v_cpf IS NOT NULL AND public.eleicao_cabo_import_digits(p.cpf)=v_cpf)
    )
  LIMIT 1 FOR UPDATE;

  IF v_existing.id IS NOT NULL
    AND NOT coalesce(v_existing.is_voluntario,false)
    AND coalesce(v_existing.valor_contratacao,0)>0
    AND (v_existing.contrato_fim IS NULL OR v_existing.contrato_fim>=v_lote.data_inicio) THEN
    RAISE EXCEPTION 'A correcao ainda coincide com o contrato ativo de %',v_existing.nome;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.eleicao_pessoas SET
      nome=v_nome,cpf=coalesce(v_cpf,cpf),telefone=v_phone,
      parent_id=v_lote.parent_id_padrao,
      escopo=v_lote.escopo_padrao,regiao=v_lote.regiao_padrao,cidade=v_lote.cidade_padrao,
      valor_contratacao=v_lote.valor_unitario,is_voluntario=false,
      contrato_inicio=v_lote.data_inicio,contrato_fim=v_lote.data_fim,
      importacao_lote_id=v_lote.id,
      arquivado_em=NULL,arquivado_por=NULL,arquivamento_motivo=NULL,arquivamento_lote_id=NULL
    WHERE id=v_existing.id
    RETURNING id INTO v_pessoa_id;
  ELSE
    INSERT INTO public.eleicao_pessoas(
      client_id,tipo,escopo,regiao,cidade,nome,telefone,endereco,bairro,parent_id,
      cpf,valor_contratacao,is_voluntario,created_by,contrato_inicio,contrato_fim,
      importacao_lote_id
    ) VALUES (
      v_lote.client_id,'cabo',v_lote.escopo_padrao,v_lote.regiao_padrao,
      v_lote.cidade_padrao,v_nome,v_phone,
      coalesce(v_item.endereco,'Nao informado'),v_item.bairro,v_lote.parent_id_padrao,
      v_cpf,v_lote.valor_unitario,false,(SELECT auth.uid()),
      v_lote.data_inicio,v_lote.data_fim,v_lote.id
    ) RETURNING id INTO v_pessoa_id;
  END IF;

  UPDATE public.eleicao_cabo_import_itens SET
    correcao_dados=jsonb_build_object(
      'nome_original',v_item.nome,
      'cpf_original',v_item.cpf_normalizado,
      'telefone_original',v_item.telefone_normalizado,
      'pessoa_que_causou_bloqueio_id',v_item.pessoa_existente_id,
      'nome_corrigido',v_nome,
      'cpf_corrigido',v_cpf,
      'telefone_corrigido',v_phone
    ),
    correcao_motivo=btrim(p_motivo),corrigido_em=now(),corrigido_por=(SELECT auth.uid()),
    nome=v_nome,cpf_normalizado=v_cpf,telefone_normalizado=v_phone,
    classificacao='confirmado',motivo='Contratacao confirmada apos correcao auditada',
    pessoa_existente_id=v_pessoa_id,valor_aplicado=v_lote.valor_unitario,processado_em=now()
  WHERE id=v_item.id;

  UPDATE public.eleicao_cabo_import_lotes SET
    total_elegiveis=total_elegiveis+1,
    total_duplicados=greatest(total_duplicados-1,0),
    custo_confirmado=custo_confirmado+valor_unitario
  WHERE id=v_lote.id;

  RETURN jsonb_build_object(
    'item_id',v_item.id,'pessoa_id',v_pessoa_id,
    'contratado',true,'valor',v_lote.valor_unitario
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_casos_duplicados_ativos(uuid)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_caso_duplicado_corrigir_contratar(
  bigint,text,text,text,text
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_casos_duplicados_ativos(uuid)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_caso_duplicado_corrigir_contratar(
  bigint,text,text,text,text
) TO authenticated;

NOTIFY pgrst,'reload schema';
