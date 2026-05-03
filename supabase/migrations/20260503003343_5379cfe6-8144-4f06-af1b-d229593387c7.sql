-- 76: ensure_pessoa_from_supporter
CREATE OR REPLACE FUNCTION public.ensure_pessoa_from_supporter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE extracted_phone text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.pessoas WHERE supporter_id = NEW.id) THEN RETURN NEW; END IF;
  extracted_phone := NULLIF(regexp_replace(COALESCE(substring(NEW.notes from 'Tel: ([^|]+)'), ''), '\s+$', ''), '');
  INSERT INTO public.pessoas (client_id, nome, telefone, tipo_pessoa, nivel_apoio, origem_contato, supporter_id, notas_internas)
  VALUES (NEW.client_id, NEW.name, extracted_phone, 'apoiador'::public.tipo_pessoa, 'apoiador'::public.nivel_apoio,
    'formulario'::public.origem_contato, NEW.id, NEW.notes);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'ensure_pessoa_from_supporter failed for supporter %, error: %', NEW.id, SQLERRM;
  RAISE;
END; $$;

CREATE TRIGGER ensure_pessoa_from_supporter_on_insert
AFTER INSERT ON public.supporters
FOR EACH ROW EXECUTE FUNCTION public.ensure_pessoa_from_supporter();

-- 78: ensure_account_supporter com normalização (versão sem unaccent ainda)
CREATE OR REPLACE FUNCTION public.ensure_account_supporter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_redes jsonb := '[]'::jsonb; v_normalized_name text;
BEGIN
  IF NEW.supporter_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.instagram_username IS NOT NULL AND NEW.instagram_username <> '' THEN
    v_redes := v_redes || jsonb_build_object('plataforma','instagram','usuario',NEW.instagram_username);
  END IF;
  IF NEW.facebook_username IS NOT NULL AND NEW.facebook_username <> '' THEN
    v_redes := v_redes || jsonb_build_object('plataforma','facebook','usuario',NEW.facebook_username);
  END IF;
  IF jsonb_array_length(v_redes) = 0 THEN RETURN NEW; END IF;
  v_normalized_name := lower(regexp_replace(translate(trim(NEW.name),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'), '\s+', ' ', 'g'));
  SELECT s.id INTO v_id FROM public.supporters s
  WHERE s.client_id = NEW.client_id
    AND lower(regexp_replace(translate(trim(s.name),
      'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
      'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'), '\s+', ' ', 'g')) = v_normalized_name
  ORDER BY s.created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    v_id := public.ensure_supporter_for_entity(NEW.client_id, NEW.name, v_redes);
  ELSE
    INSERT INTO public.supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
    SELECT v_id,
      COALESCE(rede->>'plataforma', rede->>'platform'),
      COALESCE(rede->>'usuario', rede->>'username', rede->>'handle'),
      COALESCE(rede->>'usuario', rede->>'username', rede->>'handle')
    FROM jsonb_array_elements(v_redes) AS rede
    WHERE COALESCE(rede->>'plataforma', rede->>'platform') IS NOT NULL
      AND COALESCE(rede->>'usuario', rede->>'username', rede->>'handle') IS NOT NULL
      AND COALESCE(rede->>'usuario', rede->>'username', rede->>'handle') <> ''
    ON CONFLICT DO NOTHING;
  END IF;
  NEW.supporter_id := v_id;
  RETURN NEW;
END; $$;

-- 79: sync pessoa from supporter account
CREATE OR REPLACE FUNCTION public.sync_pessoa_from_supporter_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.supporter_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.pessoas
  SET cidade = COALESCE(cidade, NEW.city),
    bairro = COALESCE(bairro, NEW.neighborhood),
    email = COALESCE(email, NEW.email),
    updated_at = now()
  WHERE supporter_id = NEW.supporter_id
    AND ((cidade IS NULL AND NEW.city IS NOT NULL)
      OR (bairro IS NULL AND NEW.neighborhood IS NOT NULL)
      OR (email IS NULL AND NEW.email IS NOT NULL));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'sync_pessoa_from_supporter_account: %', SQLERRM;
  RETURN NEW;
END; $$;

-- 80: phone in supporter_accounts + sync upgrade
ALTER TABLE public.supporter_accounts ADD COLUMN IF NOT EXISTS phone text;

CREATE OR REPLACE FUNCTION public.sync_pessoa_from_supporter_account()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.supporter_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.pessoas
  SET cidade = COALESCE(cidade, NEW.city),
    bairro = COALESCE(bairro, NEW.neighborhood),
    email = COALESCE(email, NEW.email),
    telefone = COALESCE(telefone, NULLIF(regexp_replace(COALESCE(NEW.phone,''), '\D', '', 'g'), '')),
    updated_at = now()
  WHERE supporter_id = NEW.supporter_id
    AND ((cidade IS NULL AND NEW.city IS NOT NULL)
      OR (bairro IS NULL AND NEW.neighborhood IS NOT NULL)
      OR (email IS NULL AND NEW.email IS NOT NULL)
      OR (telefone IS NULL AND NEW.phone IS NOT NULL));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'sync_pessoa_from_supporter_account: %', SQLERRM;
  RETURN NEW;
END; $$;

CREATE TRIGGER sync_pessoa_from_supporter_account_trigger
AFTER INSERT OR UPDATE OF city, neighborhood, email, phone, supporter_id
ON public.supporter_accounts
FOR EACH ROW EXECUTE FUNCTION public.sync_pessoa_from_supporter_account();

-- 81: normalize_br_phone + triggers + cron + resume function
CREATE OR REPLACE FUNCTION public.normalize_br_phone(p_raw text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE digits text; ddd text; local_part text;
BEGIN
  IF p_raw IS NULL THEN RETURN NULL; END IF;
  digits := regexp_replace(p_raw, '\D', '', 'g');
  IF digits = '' THEN RETURN NULL; END IF;
  IF length(digits) = 13 AND left(digits, 2) = '55' THEN digits := substring(digits from 3);
  ELSIF length(digits) = 12 AND left(digits, 2) = '55' THEN digits := substring(digits from 3);
  END IF;
  IF length(digits) NOT IN (10, 11) THEN RETURN digits; END IF;
  ddd := left(digits, 2);
  local_part := substring(digits from 3);
  IF length(local_part) = 8 AND left(local_part, 1) IN ('6','7','8','9') THEN
    local_part := '9' || local_part;
  END IF;
  RETURN '55' || ddd || local_part;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_normalize_telefone()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.telefone IS NOT NULL THEN
    NEW.telefone := public.normalize_br_phone(NEW.telefone);
  END IF;
  RETURN NEW;
END; $$;

-- Skip cron job for now since it's project-specific (uses different supabase_url)
-- Will be configured in a later batch

-- 87: normalize_person_name + unaccent + improved auto_create_engagement_action
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;

CREATE OR REPLACE FUNCTION public.normalize_person_name(p_name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF p_name IS NULL THEN RETURN NULL; END IF;
  RETURN regexp_replace(lower(public.unaccent(p_name)), '\s+', ' ', 'g');
END; $$;

CREATE OR REPLACE FUNCTION public.auto_create_engagement_action()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_supporter_id UUID; v_profile_id UUID; v_is_registered BOOLEAN := false; v_norm_author text;
BEGIN
  IF NEW.is_page_owner = true THEN RETURN NEW; END IF;
  IF NEW.platform_user_id IS NULL OR NEW.platform_user_id = '' THEN RETURN NEW; END IF;
  IF NEW.text = '__post_stub__' THEN RETURN NEW; END IF;
  SELECT sp.supporter_id, sp.id INTO v_supporter_id, v_profile_id
  FROM supporter_profiles sp
  WHERE sp.platform = NEW.platform AND sp.platform_user_id = NEW.platform_user_id LIMIT 1;
  IF v_supporter_id IS NULL AND NEW.author_name IS NOT NULL THEN
    SELECT sp.supporter_id, sp.id INTO v_supporter_id, v_profile_id
    FROM supporter_profiles sp
    WHERE sp.platform = NEW.platform
      AND LOWER(TRIM(BOTH '@' FROM COALESCE(sp.platform_username, ''))) = LOWER(TRIM(BOTH '@' FROM NEW.platform_user_id))
    LIMIT 1;
  END IF;
  IF v_supporter_id IS NULL AND NEW.author_name IS NOT NULL THEN
    v_norm_author := public.normalize_person_name(NEW.author_name);
    IF v_norm_author IS NOT NULL AND length(v_norm_author) >= 5 THEN
      SELECT s.id, sp.id INTO v_supporter_id, v_profile_id
      FROM supporters s
      JOIN supporter_profiles sp ON sp.supporter_id = s.id AND sp.platform = NEW.platform
      WHERE s.client_id = NEW.client_id
        AND public.normalize_person_name(s.name) = v_norm_author
      ORDER BY CASE WHEN sp.platform_user_id IS NULL OR sp.platform_user_id !~ '^\d+$' THEN 0 ELSE 1 END,
        sp.created_at ASC LIMIT 1;
      IF v_profile_id IS NOT NULL THEN
        UPDATE supporter_profiles
        SET platform_user_id = NEW.platform_user_id,
            platform_username = COALESCE(NEW.author_name, platform_username)
        WHERE id = v_profile_id AND (platform_user_id IS DISTINCT FROM NEW.platform_user_id);
      END IF;
    END IF;
  END IF;
  IF v_supporter_id IS NULL THEN RETURN NEW; END IF;
  SELECT EXISTS(
    SELECT 1 FROM pessoas WHERE supporter_id = v_supporter_id
    UNION ALL SELECT 1 FROM funcionarios WHERE supporter_id = v_supporter_id
    UNION ALL SELECT 1 FROM supporter_accounts WHERE supporter_id = v_supporter_id
  ) INTO v_is_registered;
  IF NOT v_is_registered THEN RETURN NEW; END IF;
  INSERT INTO engagement_actions (client_id, supporter_id, platform, platform_user_id, platform_username,
    action_type, comment_id, post_id, action_date)
  VALUES (NEW.client_id, v_supporter_id, COALESCE(NEW.platform, 'facebook'),
    NEW.platform_user_id, NEW.author_name, 'comment', NEW.comment_id, NEW.post_id,
    COALESCE(NEW.comment_created_time, NEW.created_at, NOW()))
  ON CONFLICT DO NOTHING;
  PERFORM calculate_engagement_score(v_supporter_id);
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.link_orphan_engagement_actions(p_client_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_linked INTEGER := 0; v_step INTEGER := 0;
BEGIN
  UPDATE engagement_actions ea SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id AND ea.supporter_id IS NULL
    AND ea.platform_user_id IS NOT NULL AND sp.platform = ea.platform
    AND sp.platform_user_id = ea.platform_user_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_linked := v_linked + v_step;

  UPDATE engagement_actions ea SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id AND ea.supporter_id IS NULL
    AND ea.platform_username IS NOT NULL AND sp.platform = ea.platform
    AND sp.platform_username IS NOT NULL
    AND LOWER(TRIM(BOTH '@' FROM sp.platform_username)) = LOWER(TRIM(BOTH '@' FROM ea.platform_username));
  GET DIAGNOSTICS v_step = ROW_COUNT; v_linked := v_linked + v_step;

  WITH cand AS (
    SELECT DISTINCT ea.platform, ea.platform_user_id, ea.platform_username,
      public.normalize_person_name(ea.platform_username) AS norm_name
    FROM engagement_actions ea
    WHERE ea.client_id = p_client_id AND ea.supporter_id IS NULL
      AND ea.platform_user_id IS NOT NULL AND ea.platform_username IS NOT NULL
      AND length(coalesce(ea.platform_username,'')) >= 5
  ), matches AS (
    SELECT DISTINCT ON (sp.id) sp.id AS profile_id,
      c.platform_user_id AS new_user_id, c.platform_username AS new_username
    FROM cand c
    JOIN supporters s ON s.client_id = p_client_id AND public.normalize_person_name(s.name) = c.norm_name
    JOIN supporter_profiles sp ON sp.supporter_id = s.id AND sp.platform = c.platform
    ORDER BY sp.id, CASE WHEN sp.platform_user_id IS NULL OR sp.platform_user_id !~ '^\d+$' THEN 0 ELSE 1 END
  )
  UPDATE supporter_profiles sp SET platform_user_id = m.new_user_id,
    platform_username = COALESCE(m.new_username, sp.platform_username)
  FROM matches m WHERE sp.id = m.profile_id AND sp.platform_user_id IS DISTINCT FROM m.new_user_id;

  UPDATE engagement_actions ea SET supporter_id = sp.supporter_id
  FROM supporter_profiles sp
  WHERE ea.client_id = p_client_id AND ea.supporter_id IS NULL
    AND ea.platform_user_id IS NOT NULL AND sp.platform = ea.platform
    AND sp.platform_user_id = ea.platform_user_id;
  GET DIAGNOSTICS v_step = ROW_COUNT; v_linked := v_linked + v_step;

  UPDATE supporters s SET last_interaction_date = sub.max_date, updated_at = NOW()
  FROM (SELECT ea.supporter_id, MAX(ea.action_date) AS max_date
    FROM engagement_actions ea WHERE ea.client_id = p_client_id AND ea.supporter_id IS NOT NULL
    GROUP BY ea.supporter_id) sub
  WHERE s.id = sub.supporter_id AND s.client_id = p_client_id
    AND (s.last_interaction_date IS NULL OR s.last_interaction_date < sub.max_date);

  PERFORM calculate_engagement_score(s.id) FROM supporters s WHERE s.client_id = p_client_id;
  RETURN v_linked;
END; $$;

-- 88: engagement_autoresolve_config + runs
CREATE TABLE public.engagement_autoresolve_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','weekly')),
  hour_utc smallint NOT NULL DEFAULT 11 CHECK (hour_utc BETWEEN 0 AND 23),
  weekday smallint NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6),
  resolve_invalid_ids boolean NOT NULL DEFAULT true,
  relink_orphans boolean NOT NULL DEFAULT true,
  last_run_at timestamptz, last_run_status text, last_run_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.engagement_autoresolve_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can view autoresolve config" ON public.engagement_autoresolve_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "Owner can insert autoresolve config" ON public.engagement_autoresolve_config FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "Owner can update autoresolve config" ON public.engagement_autoresolve_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "Owner can delete autoresolve config" ON public.engagement_autoresolve_config FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()) OR public.is_super_admin());
CREATE TRIGGER trg_autoresolve_config_updated_at BEFORE UPDATE ON public.engagement_autoresolve_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.engagement_autoresolve_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ran_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  linked_count integer NOT NULL DEFAULT 0,
  resolved_count integer NOT NULL DEFAULT 0,
  message text,
  triggered_by text NOT NULL DEFAULT 'cron'
);
CREATE INDEX idx_autoresolve_runs_client_ran ON public.engagement_autoresolve_runs(client_id, ran_at DESC);
ALTER TABLE public.engagement_autoresolve_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner can view autoresolve runs" ON public.engagement_autoresolve_runs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()) OR public.is_super_admin());

-- 89: CPF + dedup
CREATE OR REPLACE FUNCTION public.only_digits(input text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE WHEN input IS NULL THEN NULL
    ELSE NULLIF(regexp_replace(input, '[^0-9]', '', 'g'), '') END;
$$;

CREATE OR REPLACE FUNCTION public.is_valid_cpf(cpf text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text; i int; sum1 int := 0; sum2 int := 0; dig1 int; dig2 int;
BEGIN
  IF cpf IS NULL THEN RETURN true; END IF;
  d := public.only_digits(cpf);
  IF d IS NULL OR length(d) <> 11 THEN RETURN false; END IF;
  IF d ~ '^(\d)\1{10}$' THEN RETURN false; END IF;
  FOR i IN 1..9 LOOP sum1 := sum1 + (substr(d, i, 1)::int) * (11 - i); END LOOP;
  dig1 := (sum1 * 10) % 11;
  IF dig1 = 10 THEN dig1 := 0; END IF;
  IF dig1 <> substr(d, 10, 1)::int THEN RETURN false; END IF;
  FOR i IN 1..10 LOOP sum2 := sum2 + (substr(d, i, 1)::int) * (12 - i); END LOOP;
  dig2 := (sum2 * 10) % 11;
  IF dig2 = 10 THEN dig2 := 0; END IF;
  RETURN dig2 = substr(d, 11, 1)::int;
END; $$;

ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS cpf text;
CREATE OR REPLACE FUNCTION public.normalize_pessoa_dedup()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.cpf := public.only_digits(NEW.cpf);
  NEW.telefone := public.only_digits(NEW.telefone);
  IF NEW.cpf IS NOT NULL AND NOT public.is_valid_cpf(NEW.cpf) THEN
    RAISE EXCEPTION 'CPF inválido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_normalize_pessoa_dedup BEFORE INSERT OR UPDATE ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.normalize_pessoa_dedup();
CREATE UNIQUE INDEX pessoas_client_cpf_unique ON public.pessoas (client_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX pessoas_client_telefone_unique ON public.pessoas (client_id, telefone) WHERE telefone IS NOT NULL;

ALTER TABLE public.contratados ADD COLUMN IF NOT EXISTS cpf text;
CREATE OR REPLACE FUNCTION public.normalize_contratado_dedup()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.cpf := public.only_digits(NEW.cpf);
  NEW.telefone := public.only_digits(NEW.telefone);
  IF NEW.cpf IS NOT NULL AND NOT public.is_valid_cpf(NEW.cpf) THEN
    RAISE EXCEPTION 'CPF inválido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_normalize_contratado_dedup BEFORE INSERT OR UPDATE ON public.contratados
  FOR EACH ROW EXECUTE FUNCTION public.normalize_contratado_dedup();
CREATE UNIQUE INDEX contratados_client_cpf_unique ON public.contratados (client_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX contratados_client_telefone_unique ON public.contratados (client_id, telefone) WHERE telefone IS NOT NULL;

ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS cpf text;
CREATE OR REPLACE FUNCTION public.normalize_funcionario_dedup()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.cpf := public.only_digits(NEW.cpf);
  NEW.telefone := public.only_digits(NEW.telefone);
  IF NEW.cpf IS NOT NULL AND NOT public.is_valid_cpf(NEW.cpf) THEN
    RAISE EXCEPTION 'CPF inválido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_normalize_funcionario_dedup BEFORE INSERT OR UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.normalize_funcionario_dedup();
CREATE UNIQUE INDEX funcionarios_client_cpf_unique ON public.funcionarios (client_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX funcionarios_client_telefone_unique ON public.funcionarios (client_id, telefone) WHERE telefone IS NOT NULL;

ALTER TABLE public.supporter_accounts ADD COLUMN IF NOT EXISTS cpf text;
CREATE OR REPLACE FUNCTION public.normalize_supporter_account_dedup()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.cpf := public.only_digits(NEW.cpf);
  NEW.phone := public.only_digits(NEW.phone);
  IF NEW.cpf IS NOT NULL AND NOT public.is_valid_cpf(NEW.cpf) THEN
    RAISE EXCEPTION 'CPF inválido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_normalize_supporter_account_dedup BEFORE INSERT OR UPDATE ON public.supporter_accounts
  FOR EACH ROW EXECUTE FUNCTION public.normalize_supporter_account_dedup();
CREATE UNIQUE INDEX supporter_accounts_client_cpf_unique ON public.supporter_accounts (client_id, cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX supporter_accounts_client_phone_unique ON public.supporter_accounts (client_id, phone) WHERE phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_funcionario_referral_phone()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.referred_phone := public.only_digits(NEW.referred_phone);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_normalize_funcionario_referral_phone BEFORE INSERT OR UPDATE ON public.funcionario_referrals
  FOR EACH ROW EXECUTE FUNCTION public.normalize_funcionario_referral_phone();

-- 91: register_pessoa_public v3 with CPF
DROP FUNCTION IF EXISTS public.register_pessoa_public(uuid, text, text, text, text, text, text, tipo_pessoa, text, jsonb);
DROP FUNCTION IF EXISTS public.register_pessoa_public(uuid, text, text, text, text, text, text, tipo_pessoa, text, jsonb, date);

CREATE OR REPLACE FUNCTION public.register_pessoa_public(
  p_client_id uuid, p_nome text, p_telefone text,
  p_email text DEFAULT NULL, p_cidade text DEFAULT NULL, p_bairro text DEFAULT NULL,
  p_endereco text DEFAULT NULL, p_tipo_pessoa tipo_pessoa DEFAULT 'cidadao'::tipo_pessoa,
  p_notas text DEFAULT NULL, p_socials jsonb DEFAULT '[]'::jsonb,
  p_data_nascimento date DEFAULT NULL, p_cpf text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pessoa_id uuid; v_supporter_id uuid; v_social jsonb; v_has_socials boolean;
  v_cpf text; v_telefone text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN RAISE EXCEPTION 'Client not found'; END IF;
  v_cpf := public.only_digits(p_cpf);
  v_telefone := public.only_digits(p_telefone);
  IF v_cpf IS NOT NULL AND NOT public.is_valid_cpf(v_cpf) THEN
    RAISE EXCEPTION 'CPF inválido. Verifique os dígitos informados.' USING ERRCODE = '23514';
  END IF;
  IF v_cpf IS NOT NULL AND EXISTS (SELECT 1 FROM pessoas WHERE client_id = p_client_id AND cpf = v_cpf) THEN
    RAISE EXCEPTION 'Este CPF já está cadastrado.' USING ERRCODE = '23505';
  END IF;
  IF v_telefone IS NOT NULL AND EXISTS (SELECT 1 FROM pessoas WHERE client_id = p_client_id AND telefone = v_telefone) THEN
    RAISE EXCEPTION 'Este telefone já está cadastrado.' USING ERRCODE = '23505';
  END IF;
  v_has_socials := (jsonb_array_length(p_socials) > 0);
  IF v_has_socials THEN
    INSERT INTO supporters (client_id, name, classification, first_contact_date, engagement_score)
    VALUES (p_client_id, p_nome, 'neutro', NOW(), 0) RETURNING id INTO v_supporter_id;
    FOR v_social IN SELECT * FROM jsonb_array_elements(p_socials) LOOP
      INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
      VALUES (v_supporter_id, v_social->>'plataforma', v_social->>'usuario', v_social->>'usuario');
    END LOOP;
  END IF;
  INSERT INTO pessoas (client_id, nome, telefone, email, cidade, bairro, endereco,
    tipo_pessoa, nivel_apoio, origem_contato, notas_internas, supporter_id, data_nascimento, cpf)
  VALUES (p_client_id, p_nome, v_telefone, p_email, p_cidade, p_bairro, p_endereco,
    p_tipo_pessoa, 'simpatizante', 'formulario', p_notas, v_supporter_id, p_data_nascimento, v_cpf)
  RETURNING id INTO v_pessoa_id;
  IF v_has_socials THEN
    FOR v_social IN SELECT * FROM jsonb_array_elements(p_socials) LOOP
      INSERT INTO pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
      VALUES (v_pessoa_id, v_social->>'plataforma', v_social->>'usuario', v_social->>'url_perfil');
    END LOOP;
  END IF;
  RETURN v_pessoa_id;
END; $$;

-- 92: normalize_locality
CREATE OR REPLACE FUNCTION public.normalize_locality(p_input text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_clean text; v_word text; v_result text := ''; v_first boolean := true; v_lower text;
  v_minor text[] := ARRAY['de','da','do','das','dos','e','a','o','as','os','di','du'];
BEGIN
  IF p_input IS NULL THEN RETURN NULL; END IF;
  v_clean := btrim(regexp_replace(p_input, '\s+', ' ', 'g'));
  IF v_clean = '' THEN RETURN NULL; END IF;
  FOR v_word IN SELECT unnest(string_to_array(v_clean, ' ')) LOOP
    v_lower := lower(v_word);
    IF NOT v_first AND v_lower = ANY(v_minor) THEN
      v_result := v_result || ' ' || v_lower;
    ELSE
      v_result := v_result || CASE WHEN v_first THEN '' ELSE ' ' END
        || upper(substr(v_word, 1, 1)) || lower(substr(v_word, 2));
    END IF;
    v_first := false;
  END LOOP;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.trg_normalize_locality_fields()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.cidade := public.normalize_locality(NEW.cidade);
  NEW.bairro := public.normalize_locality(NEW.bairro);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_normalize_locality_pessoas BEFORE INSERT OR UPDATE OF cidade, bairro ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_locality_fields();
CREATE TRIGGER trg_normalize_locality_contratados BEFORE INSERT OR UPDATE OF cidade, bairro ON public.contratados
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_locality_fields();
CREATE TRIGGER trg_normalize_locality_indicados BEFORE INSERT OR UPDATE OF cidade, bairro ON public.contratado_indicados
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_locality_fields();
CREATE TRIGGER trg_normalize_locality_funcionarios BEFORE INSERT OR UPDATE OF cidade, bairro ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.trg_normalize_locality_fields();

-- 93: normalize_supporter_locality
CREATE OR REPLACE FUNCTION public.normalize_supporter_locality()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.city IS NOT NULL THEN NEW.city := public.normalize_locality(NEW.city); END IF;
  IF NEW.neighborhood IS NOT NULL THEN NEW.neighborhood := public.normalize_locality(NEW.neighborhood); END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_normalize_locality_supporter_accounts BEFORE INSERT OR UPDATE OF city, neighborhood ON public.supporter_accounts
  FOR EACH ROW EXECUTE FUNCTION public.normalize_supporter_locality();

CREATE POLICY "Client owner can update supporter_accounts" ON public.supporter_accounts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = supporter_accounts.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = supporter_accounts.client_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can select supporter_accounts" ON public.supporter_accounts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = supporter_accounts.client_id AND c.user_id = auth.uid()));

-- supporter_accounts birth_date + endereco
ALTER TABLE public.supporter_accounts
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS endereco text;

ALTER TABLE public.supporters
  ADD COLUMN IF NOT EXISTS cpf text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS birth_date date,
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS cidade text,
  ADD COLUMN IF NOT EXISTS bairro text;

CREATE OR REPLACE FUNCTION public.normalize_supporter_dedup()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.cpf := public.only_digits(NEW.cpf);
  NEW.telefone := public.only_digits(NEW.telefone);
  IF NEW.cpf IS NOT NULL AND NOT public.is_valid_cpf(NEW.cpf) THEN
    RAISE EXCEPTION 'CPF inválido' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_normalize_supporter_dedup BEFORE INSERT OR UPDATE ON public.supporters
  FOR EACH ROW EXECUTE FUNCTION public.normalize_supporter_dedup();

CREATE UNIQUE INDEX uniq_supporters_client_cpf ON public.supporters (client_id, cpf) WHERE cpf IS NOT NULL;

-- api_cache
CREATE TABLE public.api_cache (
  endpoint_key text PRIMARY KEY,
  source text NOT NULL,
  payload jsonb NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX idx_api_cache_source ON public.api_cache(source);
CREATE INDEX idx_api_cache_expires ON public.api_cache(expires_at);
ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_cache_public_read" ON public.api_cache FOR SELECT USING (true);