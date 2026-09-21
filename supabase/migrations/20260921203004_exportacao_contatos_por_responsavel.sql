-- Exportacao de contatos da arvore de um coordenador ou lider.
-- O retorno em JSONB e uma unica linha para nao sofrer o limite de 1000 linhas
-- configurado no PostgREST.

ALTER TABLE public.eleicao_cabo_export_lotes
  ADD COLUMN IF NOT EXISTS responsavel_id uuid
    REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipos_exportados text[],
  ADD COLUMN IF NOT EXISTS tag text;

CREATE INDEX IF NOT EXISTS idx_cabo_export_lotes_responsavel
  ON public.eleicao_cabo_export_lotes(client_id,responsavel_id,created_at DESC)
  WHERE responsavel_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.eleicao_responsaveis_exportacao(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',p.id,'nome',p.nome,'tipo',p.tipo::text
  ) ORDER BY p.nome,p.id),'[]'::jsonb)
  INTO v_result
  FROM public.eleicao_pessoas p
  WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL
    AND p.tipo::text IN ('coordenador','lider');
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.eleicao_contatos_exportar_hierarquia(
  p_client_id uuid,
  p_responsavel_id uuid DEFAULT NULL,
  p_incluir_cabos boolean DEFAULT true,
  p_incluir_lideres boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;
  IF NOT p_incluir_cabos AND NOT p_incluir_lideres THEN
    RAISE EXCEPTION 'Selecione pelo menos um tipo de contato';
  END IF;
  IF p_responsavel_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.eleicao_pessoas p
    WHERE p.id=p_responsavel_id AND p.client_id=p_client_id
      AND p.arquivado_em IS NULL AND p.tipo::text IN ('coordenador','lider')
  ) THEN
    RAISE EXCEPTION 'Coordenador ou lider invalido';
  END IF;

  WITH RECURSIVE arvore AS (
    SELECT p.id,0 nivel,ARRAY[p.id] caminho
    FROM public.eleicao_pessoas p
    WHERE p_responsavel_id IS NOT NULL AND p.id=p_responsavel_id
      AND p.client_id=p_client_id AND p.arquivado_em IS NULL
    UNION ALL
    SELECT filho.id,a.nivel+1,a.caminho||filho.id
    FROM arvore a
    JOIN public.eleicao_pessoas filho
      ON filho.parent_id=a.id AND filho.client_id=p_client_id
    WHERE filho.arquivado_em IS NULL AND a.nivel<20
      AND NOT filho.id=ANY(a.caminho)
  ), elegiveis AS (
    SELECT p.id pessoa_id,p.nome,p.telefone,p.bairro,p.tipo::text tipo,
      p.escopo::text escopo,
      CASE WHEN p.escopo::text='campo_grande' THEN coalesce(p.regiao,'')
        ELSE coalesce(p.cidade,'') END regiao_key,
      CASE WHEN p.escopo::text='campo_grande' THEN coalesce(nullif(p.regiao,''),'(sem regiao)')
        ELSE coalesce(nullif(p.cidade,''),'(sem cidade)') END regiao_label,
      public.tele_phone_key(p.telefone) phone_key,p.created_at
    FROM public.eleicao_pessoas p
    WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL
      AND (p_responsavel_id IS NULL OR EXISTS (
        SELECT 1 FROM arvore a WHERE a.id=p.id AND a.nivel>0
      ))
      AND ((p_incluir_cabos AND p.tipo::text='cabo')
        OR (p_incluir_lideres AND p.tipo::text='lider'))
      AND NOT coalesce(p.is_voluntario,false)
      AND coalesce(p.valor_contratacao,0)>0
      AND public.tele_phone_key(p.telefone) IS NOT NULL
  ), unicos AS (
    SELECT DISTINCT ON(e.phone_key) e.*
    FROM elegiveis e
    ORDER BY e.phone_key,e.created_at DESC,e.pessoa_id
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'pessoa_id',u.pessoa_id,'nome',u.nome,'telefone',u.telefone,
    'bairro',u.bairro,'tipo',u.tipo,'escopo',u.escopo,
    'regiao_key',u.regiao_key,'regiao_label',u.regiao_label
  ) ORDER BY u.nome,u.pessoa_id),'[]'::jsonb)
  INTO v_result FROM unicos u;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_contatos_exportar_hierarquia(uuid,uuid,boolean,boolean)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_responsaveis_exportacao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_contatos_exportar_hierarquia(uuid,uuid,boolean,boolean)
  TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_responsaveis_exportacao(uuid)
  TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
