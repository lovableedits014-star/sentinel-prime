-- Auditoria financeira completa e bloqueio preventivo também por CPF.

CREATE OR REPLACE FUNCTION public.eleicao_pessoas_prevent_dup()
RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_phone text := public.tele_phone_key(NEW.telefone);
  v_cpf text := public.eleicao_cabo_import_digits(NEW.cpf);
  v_func_id uuid;
  v_duplicado record;
BEGIN
  IF NEW.arquivado_em IS NOT NULL THEN RETURN NEW; END IF;

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
      (v_phone IS NOT NULL AND public.tele_phone_key(p.telefone)=v_phone)
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
BEFORE INSERT OR UPDATE OF nome,telefone,cpf,tipo ON public.eleicao_pessoas
FOR EACH ROW EXECUTE FUNCTION public.eleicao_pessoas_prevent_dup();

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
    WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL
      AND public.tele_phone_key(p.telefone) IS NOT NULL
    GROUP BY public.tele_phone_key(p.telefone) HAVING count(*)>1
    UNION ALL
    SELECT 'cpf',public.eleicao_cabo_import_digits(p.cpf)
    FROM public.eleicao_pessoas p
    WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL
      AND length(public.eleicao_cabo_import_digits(p.cpf))=11
    GROUP BY public.eleicao_cabo_import_digits(p.cpf) HAVING count(*)>1
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
      WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL AND (
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

-- A correção nunca apaga contratos. O usuário escolhe qual cadastro manter e
-- os demais cabos são arquivados com autor, data e motivo para possível revisão.
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

  SELECT count(DISTINCT x)::integer INTO v_esperados
  FROM unnest(p_arquivar_ids) x;

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
    arquivado_em=now(),
    arquivado_por=(SELECT auth.uid()),
    arquivamento_motivo='Contrato duplicado: cadastro canônico mantido '||p_manter_id::text
  WHERE p.id=ANY(p_arquivar_ids) AND p.client_id=p_client_id;

  GET DIAGNOSTICS v_arquivados = ROW_COUNT;
  RETURN jsonb_build_object(
    'mantido_id',p_manter_id,
    'arquivados',v_arquivados,
    'reversivel',true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_resolver_contratos_duplicados(uuid,uuid,uuid[])
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_resolver_contratos_duplicados(uuid,uuid,uuid[])
  TO authenticated;

NOTIFY pgrst,'reload schema';
