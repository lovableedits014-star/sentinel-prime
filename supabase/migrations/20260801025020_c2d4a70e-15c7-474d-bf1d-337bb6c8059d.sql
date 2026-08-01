-- =========================================================
-- ETAPA 1: reconstrói supporters órfãos
-- =========================================================
INSERT INTO public.supporters (id, client_id, name, classification, first_contact_date, engagement_score)
SELECT DISTINCT ON (p.supporter_id) p.supporter_id, p.client_id, COALESCE(NULLIF(TRIM(p.nome), ''), 'Sem nome'), 'neutro', now(), 0
FROM public.pessoas p
WHERE p.supporter_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.supporters s WHERE s.id = p.supporter_id)
ORDER BY p.supporter_id, p.created_at NULLS LAST;

INSERT INTO public.supporters (id, client_id, name, classification, first_contact_date, engagement_score)
SELECT DISTINCT ON (f.supporter_id) f.supporter_id, f.client_id, COALESCE(NULLIF(TRIM(f.nome), ''), 'Sem nome'), 'neutro', now(), 0
FROM public.funcionarios f
WHERE f.supporter_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.supporters s WHERE s.id = f.supporter_id)
ORDER BY f.supporter_id;

INSERT INTO public.supporters (id, client_id, name, classification, first_contact_date, engagement_score)
SELECT DISTINCT ON (a.supporter_id) a.supporter_id, a.client_id, COALESCE(NULLIF(TRIM(a.name), ''), 'Sem nome'), 'neutro', now(), 0
FROM public.supporter_accounts a
WHERE a.supporter_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.supporters s WHERE s.id = a.supporter_id)
ORDER BY a.supporter_id;

-- remove perfis de facebook inúteis (share_XXX) — a URL segue em pessoa_social
DELETE FROM public.supporter_profiles
WHERE platform = 'facebook' AND platform_user_id ILIKE 'share\_%';

-- perfis ainda órfãos (supporter inexistente) não têm como ser recuperados
DELETE FROM public.supporter_profiles sp
WHERE NOT EXISTS (SELECT 1 FROM public.supporters s WHERE s.id = sp.supporter_id);

-- índice para casamento rápido plataforma+handle
CREATE INDEX IF NOT EXISTS idx_supporter_profiles_platform_uid
  ON public.supporter_profiles (platform, lower(platform_user_id));

-- =========================================================
-- ETAPA 2/3: RPCs da tela "Perfis do time"
-- =========================================================

-- garante supporter para uma pessoa
CREATE OR REPLACE FUNCTION public.engagement_ensure_pessoa_supporter(p_pessoa_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_p RECORD; v_sid uuid;
BEGIN
  SELECT id, client_id, nome, supporter_id INTO v_p FROM pessoas WHERE id = p_pessoa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pessoa não encontrada'; END IF;
  IF NOT public.is_client_member(v_p.client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  IF v_p.supporter_id IS NOT NULL AND EXISTS (SELECT 1 FROM supporters WHERE id = v_p.supporter_id) THEN
    RETURN v_p.supporter_id;
  END IF;

  IF v_p.supporter_id IS NOT NULL THEN
    INSERT INTO supporters (id, client_id, name, classification, first_contact_date, engagement_score)
    VALUES (v_p.supporter_id, v_p.client_id, COALESCE(NULLIF(TRIM(v_p.nome),''),'Sem nome'), 'neutro', now(), 0);
    RETURN v_p.supporter_id;
  END IF;

  INSERT INTO supporters (client_id, name, classification, first_contact_date, engagement_score)
  VALUES (v_p.client_id, COALESCE(NULLIF(TRIM(v_p.nome),''),'Sem nome'), 'neutro', now(), 0)
  RETURNING id INTO v_sid;
  UPDATE pessoas SET supporter_id = v_sid WHERE id = p_pessoa_id;
  RETURN v_sid;
END; $$;

-- cadastra/atualiza rede social de uma pessoa
CREATE OR REPLACE FUNCTION public.engagement_upsert_social(
  p_pessoa_id uuid,
  p_plataforma text,
  p_usuario text,
  p_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sid uuid; v_client uuid; v_handle text; v_existing uuid; v_relinked int := 0;
BEGIN
  v_handle := lower(trim(regexp_replace(COALESCE(p_usuario,''), '^@', '')));
  v_handle := regexp_replace(v_handle, '/+$', '');
  IF v_handle = '' THEN RAISE EXCEPTION 'Informe o usuário (@)'; END IF;
  IF p_plataforma NOT IN ('instagram','facebook') THEN RAISE EXCEPTION 'Plataforma inválida'; END IF;

  SELECT client_id INTO v_client FROM pessoas WHERE id = p_pessoa_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Pessoa não encontrada'; END IF;
  IF NOT public.is_client_member(v_client) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  v_sid := public.engagement_ensure_pessoa_supporter(p_pessoa_id);

  -- pessoa_social (fonte de verdade visual)
  SELECT id INTO v_existing FROM pessoa_social
   WHERE pessoa_id = p_pessoa_id AND plataforma = p_plataforma LIMIT 1;
  IF v_existing IS NULL THEN
    INSERT INTO pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
    VALUES (p_pessoa_id, p_plataforma, v_handle, p_url);
  ELSE
    UPDATE pessoa_social SET usuario = v_handle, url_perfil = COALESCE(p_url, url_perfil)
     WHERE id = v_existing;
  END IF;

  -- supporter_profiles (chave de cruzamento)
  SELECT id INTO v_existing FROM supporter_profiles
   WHERE supporter_id = v_sid AND platform = p_plataforma LIMIT 1;
  IF v_existing IS NULL THEN
    INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username, profile_picture_url)
    VALUES (v_sid, p_plataforma, v_handle, v_handle, NULL);
  ELSE
    UPDATE supporter_profiles
       SET platform_user_id = v_handle, platform_username = v_handle
     WHERE id = v_existing;
  END IF;

  -- reaproveita interações já captadas
  UPDATE engagement_actions ea SET supporter_id = v_sid
   WHERE ea.client_id = v_client AND ea.platform = p_plataforma
     AND lower(ea.platform_user_id) = v_handle
     AND (ea.supporter_id IS NULL OR ea.supporter_id <> v_sid);
  GET DIAGNOSTICS v_relinked = ROW_COUNT;

  RETURN jsonb_build_object('supporter_id', v_sid, 'handle', v_handle, 'relinked', v_relinked);
END; $$;

-- remove vínculo de rede social
CREATE OR REPLACE FUNCTION public.engagement_remove_social(p_pessoa_id uuid, p_plataforma text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_client uuid; v_sid uuid;
BEGIN
  SELECT client_id, supporter_id INTO v_client, v_sid FROM pessoas WHERE id = p_pessoa_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Pessoa não encontrada'; END IF;
  IF NOT public.is_client_member(v_client) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  DELETE FROM pessoa_social WHERE pessoa_id = p_pessoa_id AND plataforma = p_plataforma;
  IF v_sid IS NOT NULL THEN
    DELETE FROM supporter_profiles WHERE supporter_id = v_sid AND platform = p_plataforma;
  END IF;
  RETURN true;
END; $$;

-- lista autores de comentários do Facebook ainda não vinculados
CREATE OR REPLACE FUNCTION public.engagement_unlinked_authors(
  p_client_id uuid,
  p_platform text DEFAULT 'facebook',
  p_limit int DEFAULT 200
)
RETURNS TABLE (
  platform_user_id text,
  author_name text,
  author_profile_picture text,
  total_comments bigint,
  last_seen timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT c.platform_user_id::text,
         (array_agg(c.author_name ORDER BY c.created_at DESC))[1]::text,
         (array_agg(c.author_profile_picture ORDER BY c.created_at DESC))[1]::text,
         count(*)::bigint,
         max(c.created_at)
  FROM comments c
  WHERE c.client_id = p_client_id
    AND COALESCE(c.platform,'facebook') = p_platform
    AND c.is_page_owner = false
    AND c.platform_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM supporter_profiles sp
      WHERE sp.platform = p_platform
        AND lower(sp.platform_user_id) = lower(c.platform_user_id)
    )
  GROUP BY c.platform_user_id
  ORDER BY count(*) DESC, max(c.created_at) DESC
  LIMIT p_limit;
END; $$;

-- vincula um autor de comentário a uma pessoa cadastrada
CREATE OR REPLACE FUNCTION public.engagement_link_author(
  p_pessoa_id uuid,
  p_platform text,
  p_platform_user_id text,
  p_author_name text DEFAULT NULL,
  p_picture text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_client uuid; v_sid uuid; v_existing uuid; v_relinked int := 0;
BEGIN
  SELECT client_id INTO v_client FROM pessoas WHERE id = p_pessoa_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Pessoa não encontrada'; END IF;
  IF NOT public.is_client_member(v_client) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF COALESCE(p_platform_user_id,'') = '' THEN RAISE EXCEPTION 'Autor inválido'; END IF;

  v_sid := public.engagement_ensure_pessoa_supporter(p_pessoa_id);

  SELECT id INTO v_existing FROM supporter_profiles
   WHERE supporter_id = v_sid AND platform = p_platform LIMIT 1;
  IF v_existing IS NULL THEN
    INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username, profile_picture_url)
    VALUES (v_sid, p_platform, p_platform_user_id, NULLIF(p_author_name,''), p_picture);
  ELSE
    UPDATE supporter_profiles
       SET platform_user_id = p_platform_user_id,
           platform_username = COALESCE(NULLIF(p_author_name,''), platform_username),
           profile_picture_url = COALESCE(p_picture, profile_picture_url)
     WHERE id = v_existing;
  END IF;

  -- guarda também em pessoa_social para exibição
  IF NOT EXISTS (SELECT 1 FROM pessoa_social WHERE pessoa_id = p_pessoa_id AND plataforma = p_platform) THEN
    INSERT INTO pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
    VALUES (p_pessoa_id, p_platform, NULLIF(p_author_name,''), NULL);
  END IF;

  UPDATE engagement_actions ea SET supporter_id = v_sid
   WHERE ea.client_id = v_client AND ea.platform = p_platform
     AND ea.platform_user_id = p_platform_user_id
     AND (ea.supporter_id IS NULL OR ea.supporter_id <> v_sid);
  GET DIAGNOSTICS v_relinked = ROW_COUNT;

  RETURN jsonb_build_object('supporter_id', v_sid, 'relinked', v_relinked);
END; $$;

-- painel de perfis do time
CREATE OR REPLACE FUNCTION public.engagement_perfis_overview(
  p_client_id uuid,
  p_days int DEFAULT 30
)
RETURNS TABLE (
  pessoa_id uuid,
  nome text,
  tipo_pessoa text,
  telefone text,
  supporter_id uuid,
  instagram_handle text,
  facebook_key text,
  facebook_label text,
  instagram_comments bigint,
  facebook_comments bigint,
  other_actions bigint,
  last_interaction timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_since timestamptz;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  v_since := now() - (GREATEST(COALESCE(p_days,30),1) || ' days')::interval;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, p.nome, p.tipo_pessoa::text AS tipo, p.telefone, p.supporter_id,
      (SELECT lower(regexp_replace(coalesce(sp.platform_user_id,''), '^@', '')) FROM supporter_profiles sp
        WHERE sp.supporter_id = p.supporter_id AND sp.platform = 'instagram' LIMIT 1) AS ig,
      (SELECT sp.platform_user_id FROM supporter_profiles sp
        WHERE sp.supporter_id = p.supporter_id AND sp.platform = 'facebook' LIMIT 1) AS fb,
      (SELECT COALESCE(NULLIF(sp.platform_username,''), sp.platform_user_id) FROM supporter_profiles sp
        WHERE sp.supporter_id = p.supporter_id AND sp.platform = 'facebook' LIMIT 1) AS fb_label
    FROM pessoas p
    WHERE p.client_id = p_client_id
  )
  SELECT b.id, b.nome, b.tipo, b.telefone, b.supporter_id, b.ig, b.fb, b.fb_label,
    COALESCE((SELECT count(*) FROM comments c
      WHERE c.client_id = p_client_id AND c.platform = 'instagram' AND c.is_page_owner = false
        AND c.created_at >= v_since AND b.ig IS NOT NULL
        AND lower(c.platform_user_id) = b.ig), 0)::bigint,
    COALESCE((SELECT count(*) FROM comments c
      WHERE c.client_id = p_client_id AND COALESCE(c.platform,'facebook') = 'facebook' AND c.is_page_owner = false
        AND c.created_at >= v_since AND b.fb IS NOT NULL
        AND lower(c.platform_user_id) = lower(b.fb)), 0)::bigint,
    COALESCE((SELECT count(*) FROM engagement_actions ea
      WHERE ea.client_id = p_client_id AND ea.supporter_id = b.supporter_id
        AND ea.action_type <> 'comment' AND ea.action_date >= v_since), 0)::bigint,
    (SELECT max(c.created_at) FROM comments c
      WHERE c.client_id = p_client_id AND c.is_page_owner = false
        AND ((b.ig IS NOT NULL AND c.platform = 'instagram' AND lower(c.platform_user_id) = b.ig)
          OR (b.fb IS NOT NULL AND COALESCE(c.platform,'facebook') = 'facebook' AND lower(c.platform_user_id) = lower(b.fb))))
  FROM base b
  ORDER BY b.nome;
END; $$;

GRANT EXECUTE ON FUNCTION public.engagement_ensure_pessoa_supporter(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_upsert_social(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_remove_social(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_unlinked_authors(uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_link_author(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_perfis_overview(uuid, int) TO authenticated;