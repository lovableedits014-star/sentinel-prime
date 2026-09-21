-- Telefones podem chegar como 67999999999 ou 5567999999999. Ambos precisam
-- representar a mesma pessoa em importacoes, formularios e cadastros manuais.

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_digits(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = '' AS $$
  SELECT CASE
    WHEN nullif(regexp_replace(coalesce(p_value,''),'[^0-9]','','g'),'') IS NULL THEN NULL
    WHEN length(regexp_replace(coalesce(p_value,''),'[^0-9]','','g')) > 11
      THEN right(regexp_replace(coalesce(p_value,''),'[^0-9]','','g'),11)
    ELSE regexp_replace(coalesce(p_value,''),'[^0-9]','','g')
  END;
$$;

-- O indice funcional foi criado com o resultado antigo da funcao e precisa
-- ser reconstruido depois da normalizacao canonica.
REINDEX INDEX public.idx_eleicao_pessoas_telefone_normalizado_import;

CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_phone_key_canonical
  ON public.eleicao_pessoas(client_id,public.tele_phone_key(telefone))
  WHERE telefone IS NOT NULL AND arquivado_em IS NULL;

-- Bloqueia novas duplicidades canonicas em qualquer papel da Eleicao. Registros
-- arquivados podem ser reaproveitados pela importacao, por isso nao bloqueiam.
CREATE OR REPLACE FUNCTION public.eleicao_pessoas_prevent_dup()
RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_phone text := public.tele_phone_key(NEW.telefone);
  v_func_id uuid;
  v_duplicado record;
BEGIN
  IF NEW.arquivado_em IS NOT NULL OR v_phone IS NULL THEN RETURN NEW; END IF;

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

  SELECT p.id,p.nome,p.tipo::text tipo INTO v_duplicado
  FROM public.eleicao_pessoas p
  WHERE p.client_id=NEW.client_id AND p.id<>NEW.id
    AND p.arquivado_em IS NULL
    AND public.tele_phone_key(p.telefone)=v_phone
  ORDER BY p.created_at LIMIT 1;

  IF v_duplicado.id IS NOT NULL THEN
    RAISE EXCEPTION 'Telefone ja cadastrado para % (%) neste cliente.',
      v_duplicado.nome,v_duplicado.tipo USING ERRCODE='23505';
  END IF;
  RETURN NEW;
END;
$$;

-- Varredura completa e auditavel dos cadastros ativos duplicados no cliente.
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
        'responsavel_id',p.parent_id,'responsavel_nome',pai.nome,
        'valor_contratacao',p.valor_contratacao,'is_voluntario',p.is_voluntario,
        'contrato_fim',p.contrato_fim
      ) ORDER BY p.nome,p.id)
      FROM public.eleicao_pessoas p
      LEFT JOIN public.eleicao_pessoas pai
        ON pai.id=p.parent_id AND pai.client_id=p_client_id
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

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_digits(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_auditar_duplicidades(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_digits(text)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_auditar_duplicidades(uuid)
  TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
