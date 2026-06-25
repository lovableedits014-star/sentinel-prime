
-- 1) Adiciona escopo em eleicao_regioes para suportar interior
ALTER TABLE public.eleicao_regioes
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'campo_grande';

-- Garante unicidade por (client_id, escopo, value)
ALTER TABLE public.eleicao_regioes
  DROP CONSTRAINT IF EXISTS eleicao_regioes_client_id_value_key;
CREATE UNIQUE INDEX IF NOT EXISTS eleicao_regioes_client_escopo_value_unq
  ON public.eleicao_regioes (client_id, escopo, value);

-- 2) RPC: lista cidades do interior que têm coordenadores cadastrados mas sem principal
CREATE OR REPLACE FUNCTION public.eleicao_listar_cidades_interior_sem_principal(_client_id uuid)
RETURNS TABLE(cidade text, candidatos jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.user_can_access_client(_client_id)) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  WITH cidades AS (
    SELECT DISTINCT COALESCE(NULLIF(p.cidade,''),'') AS cidade
    FROM public.eleicao_pessoas p
    WHERE p.client_id = _client_id
      AND p.escopo::text = 'interior'
      AND p.tipo::text = 'coordenador'
      AND COALESCE(p.cidade,'') <> ''
  ),
  com_principal AS (
    SELECT DISTINCT COALESCE(p.cidade,'') AS cidade
    FROM public.eleicao_pessoas p
    WHERE p.client_id = _client_id
      AND p.escopo::text = 'interior'
      AND p.tipo::text = 'coordenador'
      AND p.is_favorito_regiao = true
  )
  SELECT c.cidade,
    (SELECT jsonb_agg(jsonb_build_object('id', x.id, 'nome', x.nome, 'telefone', x.telefone) ORDER BY x.nome)
     FROM public.eleicao_pessoas x
     WHERE x.client_id = _client_id
       AND x.escopo::text = 'interior'
       AND x.tipo::text = 'coordenador'
       AND COALESCE(x.cidade,'') = c.cidade
    ) AS candidatos
  FROM cidades c
  WHERE c.cidade NOT IN (SELECT cidade FROM com_principal)
  ORDER BY c.cidade;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eleicao_listar_cidades_interior_sem_principal(uuid) TO authenticated;

-- 3) RPC: define coordenador como principal da sua cidade/região (1 por cidade)
CREATE OR REPLACE FUNCTION public.eleicao_definir_principal_regiao(_client_id uuid, _coordenador_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_escopo text;
  v_chave text;
BEGIN
  IF NOT (public.is_super_admin() OR public.user_can_access_client(_client_id)) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT p.escopo::text,
    CASE WHEN p.escopo::text = 'campo_grande' THEN COALESCE(p.regiao,'') ELSE COALESCE(p.cidade,'') END
    INTO v_escopo, v_chave
  FROM public.eleicao_pessoas p
  WHERE p.id = _coordenador_id AND p.client_id = _client_id AND p.tipo::text = 'coordenador';

  IF v_escopo IS NULL THEN
    RAISE EXCEPTION 'coordenador não encontrado';
  END IF;

  -- Desmarca outros da mesma cidade/região
  UPDATE public.eleicao_pessoas
  SET is_favorito_regiao = false
  WHERE client_id = _client_id
    AND escopo::text = v_escopo
    AND tipo::text = 'coordenador'
    AND CASE WHEN escopo::text = 'campo_grande' THEN COALESCE(regiao,'') ELSE COALESCE(cidade,'') END = v_chave
    AND id <> _coordenador_id;

  UPDATE public.eleicao_pessoas
  SET is_favorito_regiao = true
  WHERE id = _coordenador_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.eleicao_definir_principal_regiao(uuid, uuid) TO authenticated;
