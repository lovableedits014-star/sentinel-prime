-- A aprovacao de telefone compartilhado e uma resolucao do conflito, nao uma
-- duplicidade financeira. A auditoria global deve respeitar essa decisao.

CREATE OR REPLACE FUNCTION public.eleicao_auditar_duplicidades(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;

  WITH chaves AS (
    SELECT 'telefone'::text tipo,public.tele_phone_key(p.telefone) chave
    FROM public.eleicao_pessoas p
    WHERE p.client_id=p_client_id
      AND p.arquivado_em IS NULL
      AND NOT p.telefone_compartilhado_autorizado
      AND public.tele_phone_key(p.telefone) IS NOT NULL
    GROUP BY public.tele_phone_key(p.telefone)
    HAVING count(*)>1
    UNION ALL
    SELECT 'cpf',public.eleicao_cabo_import_digits(p.cpf)
    FROM public.eleicao_pessoas p
    WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL
      AND length(public.eleicao_cabo_import_digits(p.cpf))=11
    GROUP BY public.eleicao_cabo_import_digits(p.cpf)
    HAVING count(*)>1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tipo',c.tipo,'chave',c.chave,'cadastros',(
      SELECT jsonb_agg(jsonb_build_object(
        'id',p.id,'nome',p.nome,'tipo',p.tipo::text,'telefone',p.telefone,
        'responsavel_id',coalesce(pai.id,
          CASE WHEN p.tipo::text IN ('coordenador','lider') THEN p.id END),
        'responsavel_nome',coalesce(pai.nome,
          CASE WHEN p.tipo::text IN ('coordenador','lider') THEN p.nome END),
        'responsavel_tipo',coalesce(pai.tipo::text,
          CASE WHEN p.tipo::text IN ('coordenador','lider') THEN p.tipo::text END),
        'valor_contratacao',p.valor_contratacao,'is_voluntario',p.is_voluntario,
        'contrato_inicio',p.contrato_inicio,'contrato_fim',p.contrato_fim,
        'importacao_lote_id',p.importacao_lote_id,
        'importacao_lote_nome',lote.nome,
        'contrato_ativo',(
          NOT coalesce(p.is_voluntario,false)
          AND coalesce(p.valor_contratacao,0)>0
          AND (p.contrato_fim IS NULL OR p.contrato_fim>=current_date)
        )
      ) ORDER BY p.nome,p.id)
      FROM public.eleicao_pessoas p
      LEFT JOIN public.eleicao_pessoas pai
        ON pai.id=p.parent_id AND pai.client_id=p_client_id
        AND pai.arquivado_em IS NULL
        AND pai.tipo::text IN ('coordenador','lider')
      LEFT JOIN public.eleicao_cabo_import_lotes lote
        ON lote.id=p.importacao_lote_id AND lote.client_id=p_client_id
      WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL
        AND (c.tipo<>'telefone' OR NOT p.telefone_compartilhado_autorizado)
        AND (
          (c.tipo='telefone' AND public.tele_phone_key(p.telefone)=c.chave)
          OR (c.tipo='cpf' AND public.eleicao_cabo_import_digits(p.cpf)=c.chave)
        )
    )
  ) ORDER BY c.tipo,c.chave),'[]'::jsonb)
  INTO v_result FROM chaves c;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_auditar_duplicidades(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_auditar_duplicidades(uuid)
  TO authenticated,service_role;

-- Defesa adicional: mesmo uma chamada direta da RPC destrutiva nao pode
-- arquivar uma das pessoas ligadas por uma excecao de telefone compartilhado.
CREATE OR REPLACE FUNCTION public.eleicao_resolver_contratos_duplicados(
  p_client_id uuid,
  p_manter_id uuid,
  p_arquivar_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_manter public.eleicao_pessoas%ROWTYPE;
  v_esperados integer;
  v_validos integer;
  v_arquivados integer;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;
  IF p_arquivar_ids IS NULL OR cardinality(p_arquivar_ids)=0
    OR p_manter_id=ANY(p_arquivar_ids) THEN
    RAISE EXCEPTION 'Selecao de contratos invalida';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_client_id::text));

  SELECT p.* INTO v_manter
  FROM public.eleicao_pessoas p
  WHERE p.id=p_manter_id AND p.client_id=p_client_id
    AND p.arquivado_em IS NULL
    AND NOT coalesce(p.is_voluntario,false)
    AND coalesce(p.valor_contratacao,0)>0
    AND (p.contrato_fim IS NULL OR p.contrato_fim>=current_date)
  FOR UPDATE;
  IF v_manter.id IS NULL THEN RAISE EXCEPTION 'Contrato a manter nao esta ativo'; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.eleicao_cabo_import_excecoes e
    WHERE e.client_id=p_client_id
      AND e.tipo='telefone_compartilhado'
      AND (
        (e.pessoa_criada_id=p_manter_id AND e.pessoa_conflitante_id=ANY(p_arquivar_ids))
        OR (e.pessoa_conflitante_id=p_manter_id AND e.pessoa_criada_id=ANY(p_arquivar_ids))
      )
  ) THEN
    RAISE EXCEPTION 'Estas pessoas possuem telefone compartilhado aprovado; nenhum contrato foi arquivado'
      USING ERRCODE='23514';
  END IF;

  SELECT count(DISTINCT x)::integer INTO v_esperados FROM unnest(p_arquivar_ids) x;
  SELECT count(*)::integer INTO v_validos
  FROM public.eleicao_pessoas p
  WHERE p.id=ANY(p_arquivar_ids) AND p.client_id=p_client_id
    AND p.arquivado_em IS NULL AND p.tipo::text='cabo'
    AND NOT coalesce(p.is_voluntario,false)
    AND coalesce(p.valor_contratacao,0)>0
    AND (p.contrato_fim IS NULL OR p.contrato_fim>=current_date)
    AND (
      (public.tele_phone_key(v_manter.telefone) IS NOT NULL
        AND public.tele_phone_key(p.telefone)=public.tele_phone_key(v_manter.telefone))
      OR (length(public.eleicao_cabo_import_digits(v_manter.cpf))=11
        AND public.eleicao_cabo_import_digits(p.cpf)=public.eleicao_cabo_import_digits(v_manter.cpf))
    );
  IF v_validos<>v_esperados THEN
    RAISE EXCEPTION 'Um ou mais cadastros nao pertencem ao mesmo conflito ativo';
  END IF;

  UPDATE public.eleicao_pessoas p SET
    arquivado_em=now(), arquivado_por=(SELECT auth.uid()),
    arquivamento_motivo='Contrato duplicado: cadastro canonico mantido '||p_manter_id::text
  WHERE p.id=ANY(p_arquivar_ids) AND p.client_id=p_client_id;

  GET DIAGNOSTICS v_arquivados = ROW_COUNT;
  RETURN jsonb_build_object('mantido_id',p_manter_id,'arquivados',v_arquivados,'reversivel',true);
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_resolver_contratos_duplicados(uuid,uuid,uuid[])
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_resolver_contratos_duplicados(uuid,uuid,uuid[])
  TO authenticated;

NOTIFY pgrst,'reload schema';
