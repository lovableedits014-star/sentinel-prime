-- 1. Ligação com apoiador para estrutura eleitoral e contratados
ALTER TABLE public.eleicao_pessoas ADD COLUMN IF NOT EXISTS supporter_id uuid REFERENCES public.supporters(id) ON DELETE SET NULL;
ALTER TABLE public.contratados ADD COLUMN IF NOT EXISTS supporter_id uuid REFERENCES public.supporters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_supporter ON public.eleicao_pessoas(supporter_id);
CREATE INDEX IF NOT EXISTS idx_contratados_supporter ON public.contratados(supporter_id);

-- 2. Garante supporter para qualquer origem
CREATE OR REPLACE FUNCTION public.engagement_ensure_entity_supporter(p_origem text, p_ref uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_client uuid; v_nome text; v_tel text; v_sid uuid;
BEGIN
  IF p_origem = 'pessoas' THEN
    SELECT client_id, nome, telefone, supporter_id INTO v_client, v_nome, v_tel, v_sid FROM pessoas WHERE id = p_ref;
  ELSIF p_origem = 'funcionarios' THEN
    SELECT client_id, nome, telefone, supporter_id INTO v_client, v_nome, v_tel, v_sid FROM funcionarios WHERE id = p_ref;
  ELSIF p_origem = 'eleicao_pessoas' THEN
    SELECT client_id, nome, telefone, supporter_id INTO v_client, v_nome, v_tel, v_sid FROM eleicao_pessoas WHERE id = p_ref;
  ELSIF p_origem = 'contratados' THEN
    SELECT client_id, nome, telefone, supporter_id INTO v_client, v_nome, v_tel, v_sid FROM contratados WHERE id = p_ref;
  ELSIF p_origem = 'supporter_accounts' THEN
    SELECT client_id, name, phone, supporter_id INTO v_client, v_nome, v_tel, v_sid FROM supporter_accounts WHERE id = p_ref;
  ELSE
    RAISE EXCEPTION 'Origem inválida: %', p_origem;
  END IF;

  IF v_client IS NULL THEN RAISE EXCEPTION 'Cadastro não encontrado'; END IF;
  IF NOT public.is_client_member(v_client) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  IF v_sid IS NOT NULL AND EXISTS (SELECT 1 FROM supporters WHERE id = v_sid) THEN
    RETURN v_sid;
  END IF;
  v_sid := NULL;

  IF public.normalize_br_phone(v_tel) IS NOT NULL THEN
    SELECT s.id INTO v_sid FROM supporters s
     WHERE s.client_id = v_client
       AND public.normalize_br_phone(s.telefone) = public.normalize_br_phone(v_tel)
     LIMIT 1;
  END IF;

  IF v_sid IS NULL AND COALESCE(TRIM(v_nome), '') <> '' THEN
    SELECT s.id INTO v_sid FROM supporters s
     WHERE s.client_id = v_client
       AND public.normalize_person_name(s.name) = public.normalize_person_name(v_nome)
     LIMIT 1;
  END IF;

  IF v_sid IS NULL THEN
    INSERT INTO supporters (client_id, name, classification, first_contact_date, engagement_score, telefone)
    VALUES (v_client, COALESCE(NULLIF(TRIM(v_nome), ''), 'Sem nome'), 'neutro', now(), 0, v_tel)
    RETURNING id INTO v_sid;
  END IF;

  EXECUTE format('UPDATE public.%I SET supporter_id = $1 WHERE id = $2', p_origem) USING v_sid, p_ref;
  RETURN v_sid;
END $$;

-- 3. Redes sociais por origem
CREATE OR REPLACE FUNCTION public.engagement_entity_upsert_social(
  p_origem text, p_ref uuid, p_plataforma text, p_usuario text, p_url text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_sid uuid; v_client uuid; v_handle text; v_existing uuid; v_relinked int := 0;
BEGIN
  IF p_plataforma NOT IN ('instagram','facebook') THEN RAISE EXCEPTION 'Plataforma inválida'; END IF;
  v_handle := lower(regexp_replace(regexp_replace(TRIM(COALESCE(p_usuario,'')), '^@', ''), '/+$', ''));
  IF v_handle = '' THEN RAISE EXCEPTION 'Informe o usuário (@)'; END IF;

  v_sid := public.engagement_ensure_entity_supporter(p_origem, p_ref);
  SELECT client_id INTO v_client FROM supporters WHERE id = v_sid;

  SELECT id INTO v_existing FROM supporter_profiles
   WHERE supporter_id = v_sid AND platform = p_plataforma LIMIT 1;
  IF v_existing IS NULL THEN
    INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
    VALUES (v_sid, p_plataforma, v_handle, v_handle);
  ELSE
    UPDATE supporter_profiles SET platform_user_id = v_handle, platform_username = v_handle
     WHERE id = v_existing;
  END IF;

  IF p_origem = 'pessoas' THEN
    SELECT id INTO v_existing FROM pessoa_social WHERE pessoa_id = p_ref AND plataforma = p_plataforma LIMIT 1;
    IF v_existing IS NULL THEN
      INSERT INTO pessoa_social (pessoa_id, plataforma, usuario, url_perfil) VALUES (p_ref, p_plataforma, v_handle, p_url);
    ELSE
      UPDATE pessoa_social SET usuario = v_handle, url_perfil = COALESCE(p_url, url_perfil) WHERE id = v_existing;
    END IF;
  END IF;

  UPDATE engagement_actions ea SET supporter_id = v_sid
   WHERE ea.client_id = v_client AND ea.platform = p_plataforma
     AND lower(ea.platform_user_id) = v_handle
     AND (ea.supporter_id IS NULL OR ea.supporter_id <> v_sid);
  GET DIAGNOSTICS v_relinked = ROW_COUNT;

  RETURN jsonb_build_object('supporter_id', v_sid, 'handle', v_handle, 'relinked', v_relinked);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_entity_link_author(
  p_origem text, p_ref uuid, p_platform text, p_platform_user_id text,
  p_author_name text DEFAULT NULL, p_picture text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_sid uuid; v_client uuid; v_existing uuid; v_relinked int := 0;
BEGIN
  IF COALESCE(p_platform_user_id,'') = '' THEN RAISE EXCEPTION 'Autor inválido'; END IF;
  v_sid := public.engagement_ensure_entity_supporter(p_origem, p_ref);
  SELECT client_id INTO v_client FROM supporters WHERE id = v_sid;

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

  IF p_origem = 'pessoas' AND NOT EXISTS (
    SELECT 1 FROM pessoa_social WHERE pessoa_id = p_ref AND plataforma = p_platform
  ) THEN
    INSERT INTO pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
    VALUES (p_ref, p_platform, NULLIF(p_author_name,''), NULL);
  END IF;

  UPDATE engagement_actions ea SET supporter_id = v_sid
   WHERE ea.client_id = v_client AND ea.platform = p_platform
     AND ea.platform_user_id = p_platform_user_id
     AND (ea.supporter_id IS NULL OR ea.supporter_id <> v_sid);
  GET DIAGNOSTICS v_relinked = ROW_COUNT;

  RETURN jsonb_build_object('supporter_id', v_sid, 'relinked', v_relinked);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_entity_remove_social(p_origem text, p_ref uuid, p_plataforma text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_client uuid; v_sid uuid;
BEGIN
  IF p_origem NOT IN ('pessoas','funcionarios','eleicao_pessoas','contratados','supporter_accounts') THEN
    RAISE EXCEPTION 'Origem inválida: %', p_origem;
  END IF;
  EXECUTE format('SELECT client_id, supporter_id FROM public.%I WHERE id = $1', p_origem)
    INTO v_client, v_sid USING p_ref;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Cadastro não encontrado'; END IF;
  IF NOT public.is_client_member(v_client) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  IF p_origem = 'pessoas' THEN
    DELETE FROM pessoa_social WHERE pessoa_id = p_ref AND plataforma = p_plataforma;
  END IF;
  IF v_sid IS NOT NULL THEN
    DELETE FROM supporter_profiles WHERE supporter_id = v_sid AND platform = p_plataforma;
  END IF;
  RETURN true;
END $$;

-- 4. Visão unificada do time
CREATE OR REPLACE FUNCTION public.engagement_time_overview(p_client_id uuid, p_days integer DEFAULT 30)
RETURNS TABLE(
  ref_id uuid, origem text, cargo text, nome text, telefone text, supporter_id uuid,
  regiao text, cidade text, instagram_handle text, facebook_key text, facebook_label text,
  instagram_comments bigint, facebook_comments bigint, other_actions bigint,
  last_interaction timestamp with time zone,
  missoes_abertas bigint, missoes_concluidas bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_since timestamptz;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  v_since := now() - (GREATEST(COALESCE(p_days,30),1) || ' days')::interval;

  RETURN QUERY
  WITH ent AS (
    SELECT f.id AS ref_id, 'funcionarios'::text AS origem, 'funcionario'::text AS cargo, 1 AS prio,
           f.nome, f.telefone, f.supporter_id, f.bairro AS regiao, f.cidade
      FROM funcionarios f WHERE f.client_id = p_client_id
    UNION ALL
    SELECT ep.id, 'eleicao_pessoas', ep.tipo::text,
           CASE ep.tipo::text WHEN 'coordenador' THEN 2 WHEN 'lider' THEN 3 ELSE 4 END,
           ep.nome, ep.telefone, ep.supporter_id,
           COALESCE(NULLIF(ep.regiao,''), NULLIF(ep.bairro,'')), ep.cidade
      FROM eleicao_pessoas ep WHERE ep.client_id = p_client_id
    UNION ALL
    SELECT c.id, 'contratados', 'contratado', 5, c.nome, c.telefone, c.supporter_id, c.bairro, c.cidade
      FROM contratados c WHERE c.client_id = p_client_id
    UNION ALL
    SELECT p.id, 'pessoas', COALESCE(p.tipo_pessoa::text,'apoiador'), 6,
           p.nome, p.telefone, p.supporter_id, p.bairro, p.cidade
      FROM pessoas p WHERE p.client_id = p_client_id
    UNION ALL
    SELECT sa.id, 'supporter_accounts', 'portal', 7, sa.name, sa.phone, sa.supporter_id,
           sa.neighborhood, sa.city
      FROM supporter_accounts sa WHERE sa.client_id = p_client_id
  ), dedup AS (
    SELECT e.*, row_number() OVER (
      PARTITION BY COALESCE(public.normalize_br_phone(e.telefone), 'n:' || COALESCE(public.normalize_person_name(e.nome),'?'))
      ORDER BY e.prio, e.nome
    ) AS rn
    FROM ent e
  ), base AS (
    SELECT d.ref_id, d.origem, d.cargo, d.nome, d.telefone, d.supporter_id, d.regiao, d.cidade,
      (SELECT lower(regexp_replace(COALESCE(sp.platform_user_id,''), '^@', '')) FROM supporter_profiles sp
        WHERE sp.supporter_id = d.supporter_id AND sp.platform = 'instagram' LIMIT 1) AS ig,
      (SELECT sp.platform_user_id FROM supporter_profiles sp
        WHERE sp.supporter_id = d.supporter_id AND sp.platform = 'facebook' LIMIT 1) AS fb,
      (SELECT COALESCE(NULLIF(sp.platform_username,''), sp.platform_user_id) FROM supporter_profiles sp
        WHERE sp.supporter_id = d.supporter_id AND sp.platform = 'facebook' LIMIT 1) AS fb_label,
      public.normalize_br_phone(d.telefone) AS phone_norm
    FROM dedup d WHERE d.rn = 1
  )
  SELECT b.ref_id, b.origem, b.cargo, b.nome, b.telefone, b.supporter_id, b.regiao, b.cidade,
    b.ig, b.fb, b.fb_label,
    COALESCE((SELECT count(*) FROM comments c
      WHERE c.client_id = p_client_id AND c.platform = 'instagram' AND c.is_page_owner = false
        AND c.created_at >= v_since AND b.ig IS NOT NULL AND b.ig <> ''
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
        AND ((b.ig IS NOT NULL AND b.ig <> '' AND c.platform = 'instagram' AND lower(c.platform_user_id) = b.ig)
          OR (b.fb IS NOT NULL AND COALESCE(c.platform,'facebook') = 'facebook' AND lower(c.platform_user_id) = lower(b.fb)))),
    COALESCE((SELECT count(DISTINCT me.mission_id) FROM mission_events me
      JOIN mission_participants mp ON mp.id = me.participant_id
      WHERE me.client_id = p_client_id AND me.created_at >= v_since
        AND b.phone_norm IS NOT NULL AND public.normalize_br_phone(mp.phone_e164) = b.phone_norm), 0)::bigint,
    COALESCE((SELECT count(DISTINCT me.mission_id) FROM mission_events me
      JOIN mission_participants mp ON mp.id = me.participant_id
      WHERE me.client_id = p_client_id AND me.created_at >= v_since
        AND me.event_type IN ('declared_done','click_facebook','click_instagram','click_avulso')
        AND b.phone_norm IS NOT NULL AND public.normalize_br_phone(mp.phone_e164) = b.phone_norm), 0)::bigint
  FROM base b
  ORDER BY b.nome;
END $$;

-- 5. Busca do time (autocomplete)
CREATE OR REPLACE FUNCTION public.engagement_buscar_time(p_client_id uuid, p_termo text, p_limit integer DEFAULT 20)
RETURNS TABLE(
  ref_id uuid, origem text, cargo text, nome text, telefone text, cidade text, regiao text,
  supporter_id uuid, instagram_handle text, facebook_key text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_termo text; v_digits text;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  v_termo := public.normalize_person_name(COALESCE(p_termo,''));
  v_digits := public.only_digits(COALESCE(p_termo,''));
  IF COALESCE(v_termo,'') = '' AND COALESCE(v_digits,'') = '' THEN RETURN; END IF;

  RETURN QUERY
  WITH ent AS (
    SELECT f.id AS ref_id, 'funcionarios'::text AS origem, 'funcionario'::text AS cargo, 1 AS prio,
           f.nome, f.telefone, f.cidade, f.bairro AS regiao, f.supporter_id
      FROM funcionarios f WHERE f.client_id = p_client_id
    UNION ALL
    SELECT ep.id, 'eleicao_pessoas', ep.tipo::text,
           CASE ep.tipo::text WHEN 'coordenador' THEN 2 WHEN 'lider' THEN 3 ELSE 4 END,
           ep.nome, ep.telefone, ep.cidade, COALESCE(NULLIF(ep.regiao,''), NULLIF(ep.bairro,'')), ep.supporter_id
      FROM eleicao_pessoas ep WHERE ep.client_id = p_client_id
    UNION ALL
    SELECT c.id, 'contratados', 'contratado', 5, c.nome, c.telefone, c.cidade, c.bairro, c.supporter_id
      FROM contratados c WHERE c.client_id = p_client_id
    UNION ALL
    SELECT p.id, 'pessoas', COALESCE(p.tipo_pessoa::text,'apoiador'), 6, p.nome, p.telefone, p.cidade, p.bairro, p.supporter_id
      FROM pessoas p WHERE p.client_id = p_client_id
    UNION ALL
    SELECT sa.id, 'supporter_accounts', 'portal', 7, sa.name, sa.phone, sa.city, sa.neighborhood, sa.supporter_id
      FROM supporter_accounts sa WHERE sa.client_id = p_client_id
  ), hit AS (
    SELECT e.*,
      CASE
        WHEN COALESCE(v_termo,'') <> '' AND public.normalize_person_name(e.nome) LIKE v_termo || '%' THEN 0
        WHEN COALESCE(v_termo,'') <> '' AND public.normalize_person_name(e.nome) LIKE '%' || v_termo || '%' THEN 1
        ELSE 2
      END AS score
    FROM ent e
    WHERE (COALESCE(v_termo,'') <> '' AND public.normalize_person_name(e.nome) LIKE '%' || v_termo || '%')
       OR (length(COALESCE(v_digits,'')) >= 4 AND public.only_digits(COALESCE(e.telefone,'')) LIKE '%' || v_digits || '%')
  ), dedup AS (
    SELECT h.*, row_number() OVER (
      PARTITION BY COALESCE(public.normalize_br_phone(h.telefone), 'n:' || COALESCE(public.normalize_person_name(h.nome),'?'))
      ORDER BY h.prio, h.score
    ) AS rn
    FROM hit h
  )
  SELECT d.ref_id, d.origem, d.cargo, d.nome, d.telefone, d.cidade, d.regiao, d.supporter_id,
    (SELECT lower(regexp_replace(COALESCE(sp.platform_user_id,''), '^@','')) FROM supporter_profiles sp
      WHERE sp.supporter_id = d.supporter_id AND sp.platform='instagram' LIMIT 1),
    (SELECT sp.platform_user_id FROM supporter_profiles sp
      WHERE sp.supporter_id = d.supporter_id AND sp.platform='facebook' LIMIT 1)
  FROM dedup d WHERE d.rn = 1
  ORDER BY d.score, d.prio, d.nome
  LIMIT GREATEST(COALESCE(p_limit,20), 1);
END $$;

-- 6. Alteração de cargo movendo o cadastro
CREATE OR REPLACE FUNCTION public.engagement_alterar_cargo(
  p_origem text, p_ref uuid, p_novo_cargo text,
  p_telefone text DEFAULT NULL, p_cidade text DEFAULT NULL, p_regiao text DEFAULT NULL,
  p_orfaos text DEFAULT 'avulso'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_client uuid; v_nome text; v_tel text; v_cidade text; v_regiao text; v_endereco text;
  v_email text; v_sid uuid; v_dest text; v_new_id uuid; v_cargo_atual text;
  v_orfaos int := 0; v_kept boolean := false; v_motivo text; v_escopo text; v_valuable boolean := false;
BEGIN
  IF p_novo_cargo NOT IN ('funcionario','coordenador','lider','cabo','apoiador','eleitor','lideranca',
                          'jornalista','influenciador','voluntario','cidadao','liderado','indicado') THEN
    RAISE EXCEPTION 'Cargo inválido: %', p_novo_cargo;
  END IF;

  IF p_origem = 'pessoas' THEN
    SELECT client_id, nome, telefone, cidade, bairro, endereco, email, supporter_id, COALESCE(tipo_pessoa::text,'apoiador')
      INTO v_client, v_nome, v_tel, v_cidade, v_regiao, v_endereco, v_email, v_sid, v_cargo_atual
      FROM pessoas WHERE id = p_ref;
  ELSIF p_origem = 'funcionarios' THEN
    SELECT client_id, nome, telefone, cidade, bairro, endereco, email, supporter_id, 'funcionario'
      INTO v_client, v_nome, v_tel, v_cidade, v_regiao, v_endereco, v_email, v_sid, v_cargo_atual
      FROM funcionarios WHERE id = p_ref;
  ELSIF p_origem = 'eleicao_pessoas' THEN
    SELECT client_id, nome, telefone, cidade, COALESCE(NULLIF(regiao,''), bairro), endereco, email, supporter_id, tipo::text
      INTO v_client, v_nome, v_tel, v_cidade, v_regiao, v_endereco, v_email, v_sid, v_cargo_atual
      FROM eleicao_pessoas WHERE id = p_ref;
  ELSIF p_origem = 'contratados' THEN
    SELECT client_id, nome, telefone, cidade, bairro, endereco, email, supporter_id, 'contratado'
      INTO v_client, v_nome, v_tel, v_cidade, v_regiao, v_endereco, v_email, v_sid, v_cargo_atual
      FROM contratados WHERE id = p_ref;
  ELSIF p_origem = 'supporter_accounts' THEN
    SELECT client_id, name, phone, city, neighborhood, endereco, email, supporter_id, 'portal'
      INTO v_client, v_nome, v_tel, v_cidade, v_regiao, v_endereco, v_email, v_sid, v_cargo_atual
      FROM supporter_accounts WHERE id = p_ref;
  ELSE
    RAISE EXCEPTION 'Origem inválida: %', p_origem;
  END IF;

  IF v_client IS NULL THEN RAISE EXCEPTION 'Cadastro não encontrado'; END IF;
  IF NOT public.is_client_member(v_client) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  v_tel := COALESCE(NULLIF(TRIM(COALESCE(p_telefone,'')),''), v_tel);
  v_cidade := COALESCE(NULLIF(TRIM(COALESCE(p_cidade,'')),''), v_cidade);
  v_regiao := COALESCE(NULLIF(TRIM(COALESCE(p_regiao,'')),''), v_regiao);
  v_endereco := COALESCE(NULLIF(TRIM(COALESCE(v_endereco,'')),''), v_regiao, v_cidade);

  v_dest := CASE
    WHEN p_novo_cargo = 'funcionario' THEN 'funcionarios'
    WHEN p_novo_cargo IN ('coordenador','lider','cabo') THEN 'eleicao_pessoas'
    ELSE 'pessoas' END;

  IF v_dest IN ('funcionarios','eleicao_pessoas') AND length(public.only_digits(COALESCE(v_tel,''))) < 10 THEN
    RAISE EXCEPTION 'TELEFONE_OBRIGATORIO';
  END IF;

  -- garante o vínculo de apoiador antes de mover (preserva histórico/redes)
  v_sid := public.engagement_ensure_entity_supporter(p_origem, p_ref);

  -- subordinados na estrutura eleitoral
  IF p_origem = 'eleicao_pessoas' AND (v_dest <> 'eleicao_pessoas' OR p_novo_cargo <> v_cargo_atual) THEN
    SELECT count(*) INTO v_orfaos FROM eleicao_pessoas WHERE parent_id = p_ref;
    IF v_orfaos > 0 THEN
      IF COALESCE(p_orfaos,'avulso') = 'bloquear' THEN
        RAISE EXCEPTION 'TEM_SUBORDINADOS:%', v_orfaos;
      END IF;
      IF v_dest <> 'eleicao_pessoas' OR p_novo_cargo = 'cabo' THEN
        UPDATE eleicao_pessoas SET parent_id = NULL WHERE parent_id = p_ref;
      ELSE
        v_orfaos := 0;
      END IF;
    END IF;
  END IF;

  -- mesma tabela: apenas troca o tipo
  IF v_dest = p_origem THEN
    IF v_dest = 'pessoas' THEN
      UPDATE pessoas SET tipo_pessoa = p_novo_cargo::tipo_pessoa,
        telefone = COALESCE(v_tel, telefone), cidade = COALESCE(v_cidade, cidade), bairro = COALESCE(v_regiao, bairro)
       WHERE id = p_ref;
    ELSIF v_dest = 'eleicao_pessoas' THEN
      UPDATE eleicao_pessoas SET tipo = p_novo_cargo::eleicao_tipo,
        telefone = COALESCE(v_tel, telefone), cidade = COALESCE(v_cidade, cidade),
        regiao = COALESCE(v_regiao, regiao)
       WHERE id = p_ref;
    END IF;
    v_new_id := p_ref;
  ELSE
    v_escopo := CASE WHEN public.normalize_person_name(COALESCE(v_cidade,'')) IN ('campo grande','') THEN 'campo_grande' ELSE 'interior' END;

    IF v_dest = 'funcionarios' THEN
      INSERT INTO funcionarios (client_id, nome, telefone, email, cidade, bairro, endereco, supporter_id, status)
      VALUES (v_client, v_nome, v_tel, v_email, v_cidade, v_regiao, v_endereco, v_sid, 'ativo')
      RETURNING id INTO v_new_id;
    ELSIF v_dest = 'eleicao_pessoas' THEN
      INSERT INTO eleicao_pessoas (client_id, tipo, escopo, nome, telefone, email, cidade, regiao, bairro, endereco, supporter_id, created_by)
      VALUES (v_client, p_novo_cargo::eleicao_tipo, v_escopo::eleicao_escopo, v_nome, v_tel, v_email,
              v_cidade, v_regiao, v_regiao, COALESCE(v_endereco, v_regiao, v_cidade, v_nome), v_sid, auth.uid())
      RETURNING id INTO v_new_id;
    ELSE
      INSERT INTO pessoas (client_id, nome, telefone, email, cidade, bairro, endereco, tipo_pessoa, supporter_id)
      VALUES (v_client, v_nome, v_tel, v_email, v_cidade, v_regiao, v_endereco, p_novo_cargo::tipo_pessoa, v_sid)
      RETURNING id INTO v_new_id;
    END IF;

    -- histórico que não pode ser transferido impede a remoção da origem
    IF p_origem = 'eleicao_pessoas' THEN
      SELECT EXISTS (SELECT 1 FROM eleicao_indicados WHERE indicador_id = p_ref)
          OR EXISTS (SELECT 1 FROM eleicao_contato_lotes WHERE coordenador_id = p_ref)
          OR EXISTS (SELECT 1 FROM eleicao_contato_distribuicoes WHERE pessoa_id = p_ref OR coordenador_id = p_ref)
        INTO v_valuable;
      IF v_valuable THEN
        v_motivo := 'Mantido na estrutura eleitoral porque possui indicações ou listas de contato vinculadas.';
      ELSE
        DELETE FROM eleicao_pessoas WHERE id = p_ref;
      END IF;
    ELSIF p_origem = 'pessoas' THEN
      SELECT EXISTS (SELECT 1 FROM interacoes_pessoa WHERE pessoa_id = p_ref)
          OR EXISTS (SELECT 1 FROM timeline_pessoa WHERE pessoa_id = p_ref)
          OR EXISTS (SELECT 1 FROM funcionario_referrals WHERE pessoa_id = p_ref)
          OR EXISTS (SELECT 1 FROM pessoas WHERE lider_id = p_ref)
        INTO v_valuable;
      IF v_valuable THEN
        v_motivo := 'Cadastro anterior mantido porque possui histórico de interações/indicações vinculado.';
      ELSE
        DELETE FROM pessoa_social WHERE pessoa_id = p_ref;
        DELETE FROM pessoas_tags WHERE pessoa_id = p_ref;
        DELETE FROM pessoas WHERE id = p_ref;
      END IF;
    ELSIF p_origem = 'funcionarios' THEN
      SELECT EXISTS (SELECT 1 FROM funcionario_checkins WHERE funcionario_id = p_ref)
          OR EXISTS (SELECT 1 FROM acao_externa_funcionarios WHERE funcionario_id = p_ref)
          OR EXISTS (SELECT 1 FROM funcionario_referrals WHERE funcionario_id = p_ref)
          OR EXISTS (SELECT 1 FROM eleicao_pessoas WHERE funcionario_id = p_ref)
        INTO v_valuable;
      IF v_valuable THEN
        v_motivo := 'Cadastro de funcionário mantido porque possui check-ins/ações vinculados.';
      ELSE
        DELETE FROM funcionarios WHERE id = p_ref;
      END IF;
    ELSE
      v_motivo := 'A conta de origem (portal/contrato) foi preservada.';
    END IF;
    v_kept := v_motivo IS NOT NULL;
  END IF;

  IF auth.uid() IS NOT NULL THEN
    INSERT INTO action_logs (client_id, user_id, action, status, details)
    VALUES (v_client, auth.uid(), 'engagement_alterar_cargo', 'success',
      jsonb_build_object('origem', p_origem, 'ref', p_ref, 'cargo_anterior', v_cargo_atual,
        'novo_cargo', p_novo_cargo, 'novo_id', v_new_id, 'destino', v_dest,
        'orfaos_desvinculados', v_orfaos, 'origem_preservada', v_kept, 'nome', v_nome));
  END IF;

  RETURN jsonb_build_object('ok', true, 'origem', v_dest, 'ref_id', v_new_id,
    'cargo_anterior', v_cargo_atual, 'novo_cargo', p_novo_cargo,
    'orfaos_desvinculados', v_orfaos, 'origem_preservada', v_kept, 'motivo', v_motivo,
    'supporter_id', v_sid);
END $$;

GRANT EXECUTE ON FUNCTION public.engagement_ensure_entity_supporter(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_entity_upsert_social(text, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_entity_link_author(text, uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_entity_remove_social(text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_time_overview(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_buscar_time(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engagement_alterar_cargo(text, uuid, text, text, text, text, text) TO authenticated;