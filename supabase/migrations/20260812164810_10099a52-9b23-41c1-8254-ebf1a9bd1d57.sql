CREATE OR REPLACE FUNCTION public.eleicao_listar_regioes_distribuicao(_client_id uuid)
RETURNS TABLE(escopo text, regiao_key text, regiao_label text, coordenador_id uuid, coordenador_nome text, coordenador_telefone text, total_elegivel bigint, total_ja_enviado bigint, total_novos bigint, ultima_distribuicao_em timestamptz, ultimo_canal text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin() OR public.user_can_access_client(_client_id)) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.*,
      p.escopo::text AS esc,
      CASE WHEN p.escopo::text = 'campo_grande' THEN COALESCE(p.regiao,'') ELSE COALESCE(p.cidade,'') END AS r_key,
      CASE WHEN p.escopo::text = 'campo_grande' THEN COALESCE(NULLIF(p.regiao,''),'(sem região)') ELSE COALESCE(NULLIF(p.cidade,''),'(sem cidade)') END AS r_label
    FROM public.eleicao_pessoas p
    WHERE p.client_id = _client_id
  ),
  principais AS (
    SELECT DISTINCT ON (b.esc, b.r_key)
      b.id AS coord_id, b.nome AS coord_nome, b.telefone AS coord_telefone,
      b.esc AS escopo, b.r_key, b.r_label
    FROM base b
    WHERE COALESCE(NULLIF(regexp_replace(COALESCE(b.telefone,''), '\D', '', 'g'),''),'') <> ''
    ORDER BY b.esc, b.r_key,
      (b.tipo::text = 'coordenador' AND b.is_favorito_regiao = true) DESC,
      (b.is_favorito_regiao = true) DESC,
      (b.tipo::text = 'coordenador') DESC,
      (b.tipo::text = 'lider') DESC,
      b.nome ASC
  ),
  elegiveis AS (
    SELECT pr.coord_id, pr.r_key, pr.escopo, pe.id AS pessoa_id
    FROM principais pr
    JOIN base pe
      ON pe.esc = pr.escopo
     AND pe.r_key = pr.r_key
     AND pe.id <> pr.coord_id
     AND COALESCE(NULLIF(regexp_replace(COALESCE(pe.telefone,''), '\D', '', 'g'),''),'') <> ''
  ),
  ja_env AS (
    SELECT d.coordenador_id, d.pessoa_id
    FROM public.eleicao_contato_distribuicoes d
    WHERE d.client_id = _client_id
  ),
  ult AS (
    SELECT DISTINCT ON (l.coordenador_id) l.coordenador_id, l.created_at, l.canal
    FROM public.eleicao_contato_lotes l
    WHERE l.client_id = _client_id
    ORDER BY l.coordenador_id, l.created_at DESC
  )
  SELECT
    pr.escopo,
    pr.r_key,
    pr.r_label,
    pr.coord_id,
    pr.coord_nome,
    pr.coord_telefone,
    COUNT(DISTINCT e.pessoa_id)::bigint,
    COUNT(DISTINCT e.pessoa_id) FILTER (WHERE je.pessoa_id IS NOT NULL)::bigint,
    COUNT(DISTINCT e.pessoa_id) FILTER (WHERE je.pessoa_id IS NULL)::bigint,
    u.created_at,
    u.canal
  FROM principais pr
  LEFT JOIN elegiveis e ON e.coord_id = pr.coord_id
  LEFT JOIN ja_env je ON je.coordenador_id = pr.coord_id AND je.pessoa_id = e.pessoa_id
  LEFT JOIN ult u ON u.coordenador_id = pr.coord_id
  GROUP BY pr.escopo, pr.r_key, pr.r_label, pr.coord_id, pr.coord_nome, pr.coord_telefone, u.created_at, u.canal
  ORDER BY pr.escopo, pr.r_label;
END;
$$;