-- 54: custom_themes
CREATE TABLE public.custom_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL,
  keywords text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage custom_themes" ON public.custom_themes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = custom_themes.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = custom_themes.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can view custom_themes" ON public.custom_themes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = custom_themes.client_id AND tm.user_id = auth.uid()));

-- 55: whatsapp bridge per client
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_bridge_url text,
  ADD COLUMN IF NOT EXISTS whatsapp_bridge_api_key text;

-- 57: register_pessoa_public com data_nascimento
CREATE OR REPLACE FUNCTION public.register_pessoa_public(
  p_client_id uuid, p_nome text, p_telefone text,
  p_email text DEFAULT NULL, p_cidade text DEFAULT NULL,
  p_bairro text DEFAULT NULL, p_endereco text DEFAULT NULL,
  p_tipo_pessoa tipo_pessoa DEFAULT 'cidadao', p_notas text DEFAULT NULL,
  p_socials jsonb DEFAULT '[]'::jsonb, p_data_nascimento date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pessoa_id uuid; v_supporter_id uuid; v_social jsonb; v_has_socials boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN RAISE EXCEPTION 'Client not found'; END IF;
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
    tipo_pessoa, nivel_apoio, origem_contato, notas_internas, supporter_id, data_nascimento)
  VALUES (p_client_id, p_nome, p_telefone, p_email, p_cidade, p_bairro, p_endereco,
    p_tipo_pessoa, 'simpatizante', 'formulario', p_notas, v_supporter_id, p_data_nascimento)
  RETURNING id INTO v_pessoa_id;
  IF v_has_socials THEN
    FOR v_social IN SELECT * FROM jsonb_array_elements(p_socials) LOOP
      INSERT INTO pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
      VALUES (v_pessoa_id, v_social->>'plataforma', v_social->>'usuario', v_social->>'url_perfil');
    END LOOP;
  END IF;
  RETURN v_pessoa_id;
END; $$;

-- 60: whatsapp_instances overhaul
ALTER TABLE public.whatsapp_instances ALTER COLUMN instance_name DROP NOT NULL;
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS apelido TEXT,
  ADD COLUMN IF NOT EXISTS bridge_url TEXT,
  ADD COLUMN IF NOT EXISTS bridge_api_key TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_health_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_send_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS messages_sent_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS messages_sent_today_date DATE NOT NULL DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS total_sent BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_failed BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS connected_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;
UPDATE public.whatsapp_instances SET apelido = COALESCE(NULLIF(apelido, ''), instance_name, 'Chip Principal') WHERE apelido IS NULL OR apelido = '';
ALTER TABLE public.whatsapp_instances ALTER COLUMN apelido SET DEFAULT 'Nova Instância';

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_client ON public.whatsapp_instances(client_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_pool ON public.whatsapp_instances(client_id, is_active, status);

CREATE TRIGGER update_whatsapp_instances_updated_at BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.whatsapp_instance_send_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  dispatch_id UUID,
  success BOOLEAN NOT NULL, error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_send_log_instance_time ON public.whatsapp_instance_send_log(instance_id, sent_at DESC);
CREATE INDEX idx_send_log_client_time ON public.whatsapp_instance_send_log(client_id, sent_at DESC);
ALTER TABLE public.whatsapp_instance_send_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can view send logs" ON public.whatsapp_instance_send_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_instance_send_log.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert send logs" ON public.whatsapp_instance_send_log FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_instance_send_log.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can view send logs" ON public.whatsapp_instance_send_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = whatsapp_instance_send_log.client_id AND tm.user_id = auth.uid()));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS whatsapp_window_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS whatsapp_window_start TIME NOT NULL DEFAULT '08:00:00',
  ADD COLUMN IF NOT EXISTS whatsapp_window_end TIME NOT NULL DEFAULT '22:00:00',
  ADD COLUMN IF NOT EXISTS whatsapp_rotation_strategy TEXT NOT NULL DEFAULT 'health_random',
  ADD COLUMN IF NOT EXISTS whatsapp_inter_instance_delay_min INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS whatsapp_inter_instance_delay_max INTEGER NOT NULL DEFAULT 3;

ALTER TABLE public.whatsapp_dispatches
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pause_reason TEXT;

CREATE OR REPLACE FUNCTION public.pick_healthy_whatsapp_instance(p_client_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_chosen_id UUID;
BEGIN
  WITH candidates AS (
    SELECT i.id,
      LEAST(1.0, EXTRACT(EPOCH FROM (now() - COALESCE(i.last_send_at, now() - INTERVAL '1 day'))) / 60.0) AS rest_score,
      COALESCE((SELECT CASE WHEN COUNT(*) = 0 THEN 1.0
        ELSE SUM(CASE WHEN success THEN 1.0 ELSE 0.0 END) / COUNT(*)::numeric END
        FROM whatsapp_instance_send_log l WHERE l.instance_id = i.id AND l.sent_at >= now() - INTERVAL '24 hours'), 1.0) AS success_rate
    FROM whatsapp_instances i
    WHERE i.client_id = p_client_id AND i.is_active = true AND i.status = 'connected'
      AND i.bridge_url IS NOT NULL AND i.bridge_api_key IS NOT NULL
  )
  SELECT id INTO v_chosen_id FROM candidates ORDER BY (rest_score * 0.7 + success_rate * 0.3) DESC, random() LIMIT 1;
  IF v_chosen_id IS NOT NULL THEN UPDATE whatsapp_instances SET last_send_at = now() WHERE id = v_chosen_id; END IF;
  RETURN v_chosen_id;
END; $$;

CREATE OR REPLACE FUNCTION public.log_whatsapp_send(
  p_instance_id UUID, p_client_id UUID, p_dispatch_id UUID,
  p_success BOOLEAN, p_error_message TEXT DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO whatsapp_instance_send_log (instance_id, client_id, dispatch_id, success, error_message)
  VALUES (p_instance_id, p_client_id, p_dispatch_id, p_success, p_error_message);
  UPDATE whatsapp_instances
  SET total_sent = total_sent + CASE WHEN p_success THEN 1 ELSE 0 END,
    total_failed = total_failed + CASE WHEN p_success THEN 0 ELSE 1 END,
    consecutive_failures = CASE WHEN p_success THEN 0 ELSE consecutive_failures + 1 END,
    messages_sent_today = CASE WHEN messages_sent_today_date = CURRENT_DATE
      THEN messages_sent_today + CASE WHEN p_success THEN 1 ELSE 0 END
      ELSE CASE WHEN p_success THEN 1 ELSE 0 END END,
    messages_sent_today_date = CURRENT_DATE,
    last_send_at = now(), updated_at = now()
  WHERE id = p_instance_id;
END; $$;

-- 61: multi-instance + is_primary
ALTER TABLE public.whatsapp_instances DROP CONSTRAINT IF EXISTS whatsapp_instances_client_id_key;
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX whatsapp_instances_one_primary_per_client
  ON public.whatsapp_instances (client_id) WHERE is_primary = true;

CREATE OR REPLACE FUNCTION public.ensure_single_primary_whatsapp_instance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.whatsapp_instances SET is_primary = false
    WHERE client_id = NEW.client_id AND id <> NEW.id AND is_primary = true;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ensure_single_primary_whatsapp
  BEFORE INSERT OR UPDATE OF is_primary ON public.whatsapp_instances
  FOR EACH ROW WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION public.ensure_single_primary_whatsapp_instance();

CREATE OR REPLACE FUNCTION public.promote_next_primary_whatsapp_instance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.is_primary = true THEN
    UPDATE public.whatsapp_instances SET is_primary = true
    WHERE id = (SELECT id FROM public.whatsapp_instances
      WHERE client_id = OLD.client_id ORDER BY created_at ASC LIMIT 1);
  END IF;
  RETURN OLD;
END; $$;

CREATE TRIGGER trg_promote_next_primary_whatsapp
  AFTER DELETE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.promote_next_primary_whatsapp_instance();

-- 62: refined auto_create_engagement_action + auto-create supporter
CREATE OR REPLACE FUNCTION public.auto_create_engagement_action()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_supporter_id UUID; v_is_registered BOOLEAN := false;
BEGIN
  IF NEW.is_page_owner = true THEN RETURN NEW; END IF;
  IF NEW.platform_user_id IS NULL OR NEW.platform_user_id = '' THEN RETURN NEW; END IF;
  IF NEW.text = '__post_stub__' THEN RETURN NEW; END IF;
  SELECT sp.supporter_id INTO v_supporter_id FROM supporter_profiles sp
   WHERE sp.platform = NEW.platform AND sp.platform_user_id = NEW.platform_user_id LIMIT 1;
  IF v_supporter_id IS NULL AND NEW.author_name IS NOT NULL THEN
    SELECT sp.supporter_id INTO v_supporter_id FROM supporter_profiles sp
     WHERE sp.platform = NEW.platform
       AND LOWER(TRIM(BOTH '@' FROM COALESCE(sp.platform_username, ''))) = LOWER(TRIM(BOTH '@' FROM NEW.platform_user_id))
     LIMIT 1;
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

CREATE OR REPLACE FUNCTION public.ensure_supporter_for_entity(
  p_client_id uuid, p_nome text, p_redes jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_supporter_id uuid; v_rede jsonb; v_plat text; v_user text;
BEGIN
  IF p_redes IS NULL OR jsonb_array_length(p_redes) = 0 THEN RETURN NULL; END IF;
  INSERT INTO supporters (client_id, name, classification, first_contact_date, engagement_score)
  VALUES (p_client_id, p_nome, 'neutro', NOW(), 0) RETURNING id INTO v_supporter_id;
  FOR v_rede IN SELECT * FROM jsonb_array_elements(p_redes) LOOP
    v_plat := COALESCE(v_rede->>'plataforma', v_rede->>'platform');
    v_user := COALESCE(v_rede->>'usuario', v_rede->>'username', v_rede->>'handle');
    IF v_plat IS NOT NULL AND v_user IS NOT NULL AND v_user <> '' THEN
      INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
      VALUES (v_supporter_id, v_plat, v_user, v_user) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
  RETURN v_supporter_id;
END; $$;

CREATE OR REPLACE FUNCTION public.ensure_funcionario_supporter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NEW.supporter_id IS NULL AND NEW.redes_sociais IS NOT NULL
     AND jsonb_array_length(NEW.redes_sociais) > 0 THEN
    v_id := public.ensure_supporter_for_entity(NEW.client_id, NEW.nome, NEW.redes_sociais);
    NEW.supporter_id := v_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ensure_funcionario_supporter
  BEFORE INSERT OR UPDATE OF redes_sociais ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.ensure_funcionario_supporter();

CREATE OR REPLACE FUNCTION public.ensure_account_supporter()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_redes jsonb := '[]'::jsonb;
BEGIN
  IF NEW.supporter_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.instagram_username IS NOT NULL AND NEW.instagram_username <> '' THEN
    v_redes := v_redes || jsonb_build_object('plataforma','instagram','usuario',NEW.instagram_username);
  END IF;
  IF NEW.facebook_username IS NOT NULL AND NEW.facebook_username <> '' THEN
    v_redes := v_redes || jsonb_build_object('plataforma','facebook','usuario',NEW.facebook_username);
  END IF;
  IF jsonb_array_length(v_redes) > 0 THEN
    v_id := public.ensure_supporter_for_entity(NEW.client_id, NEW.name, v_redes);
    NEW.supporter_id := v_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ensure_account_supporter
  BEFORE INSERT OR UPDATE OF instagram_username, facebook_username ON public.supporter_accounts
  FOR EACH ROW EXECUTE FUNCTION public.ensure_account_supporter();

-- 63: lider_invite_tokens
CREATE TABLE public.lider_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  used_at timestamptz,
  used_by_contratado_id uuid REFERENCES public.contratados(id) ON DELETE SET NULL,
  note text
);
CREATE INDEX idx_lider_invite_tokens_client ON public.lider_invite_tokens(client_id);
CREATE INDEX idx_lider_invite_tokens_token ON public.lider_invite_tokens(token);
ALTER TABLE public.lider_invite_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owners insert invite tokens" ON public.lider_invite_tokens FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));
CREATE POLICY "Client owners select invite tokens" ON public.lider_invite_tokens FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));
CREATE POLICY "Client owners update invite tokens" ON public.lider_invite_tokens FOR UPDATE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()))
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));
CREATE POLICY "Client owners delete invite tokens" ON public.lider_invite_tokens FOR DELETE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));
CREATE POLICY "Anyone can validate token" ON public.lider_invite_tokens FOR SELECT USING (true);

-- 65: campaign_frames
CREATE TABLE public.campaign_frames (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, image_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_frames_client ON public.campaign_frames(client_id, is_active, display_order);
ALTER TABLE public.campaign_frames ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active campaign frames" ON public.campaign_frames FOR SELECT USING (is_active = true);
CREATE POLICY "Client owner can view all own frames" ON public.campaign_frames FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can insert frames" ON public.campaign_frames FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can update frames" ON public.campaign_frames FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can delete frames" ON public.campaign_frames FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid()));
CREATE TRIGGER trg_campaign_frames_updated_at BEFORE UPDATE ON public.campaign_frames
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-frames', 'campaign-frames', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Public can read campaign frame files" ON storage.objects FOR SELECT USING (bucket_id = 'campaign-frames');
CREATE POLICY "Client owners can upload campaign frame files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-frames' AND EXISTS (SELECT 1 FROM public.clients c WHERE c.user_id = auth.uid()));
CREATE POLICY "Client owners can update campaign frame files" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'campaign-frames' AND EXISTS (SELECT 1 FROM public.clients c WHERE c.user_id = auth.uid()));
CREATE POLICY "Client owners can delete campaign frame files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-frames' AND EXISTS (SELECT 1 FROM public.clients c WHERE c.user_id = auth.uid()));

-- 67: composition + assets bucket
ALTER TABLE public.campaign_frames
  ADD COLUMN IF NOT EXISTS composition jsonb,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'composition';

INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-frame-assets', 'campaign-frame-assets', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Anyone can view campaign frame assets" ON storage.objects FOR SELECT USING (bucket_id = 'campaign-frame-assets');
CREATE POLICY "Authenticated upload campaign frame assets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'campaign-frame-assets');
CREATE POLICY "Authenticated update campaign frame assets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'campaign-frame-assets');
CREATE POLICY "Authenticated delete campaign frame assets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'campaign-frame-assets');

-- 68: presença obrigatória + notifications
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS presenca_obrigatoria boolean NOT NULL DEFAULT false;
ALTER TABLE public.contratados ADD COLUMN IF NOT EXISTS presenca_obrigatoria boolean NOT NULL DEFAULT false;
ALTER TABLE public.supporter_accounts ADD COLUMN IF NOT EXISTS presenca_obrigatoria boolean NOT NULL DEFAULT false;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS presence_absence_days_threshold integer NOT NULL DEFAULT 3;

CREATE TABLE public.presence_absence_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  person_type text NOT NULL CHECK (person_type IN ('funcionario','lider','liderado','apoiador')),
  person_id uuid NOT NULL, person_name text NOT NULL, telefone text,
  days_absent integer NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  whatsapp_status text NOT NULL DEFAULT 'pending', whatsapp_error text,
  UNIQUE (client_id, person_type, person_id)
);
CREATE INDEX idx_presence_notif_client ON public.presence_absence_notifications(client_id);
ALTER TABLE public.presence_absence_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can view presence notifications" ON public.presence_absence_notifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can delete presence notifications" ON public.presence_absence_notifications FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients c WHERE c.id = client_id AND c.user_id = auth.uid()));
CREATE POLICY "Team members can view presence notifications" ON public.presence_absence_notifications FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = presence_absence_notifications.client_id AND tm.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.get_presence_overview(p_client_id uuid)
RETURNS TABLE (person_type text, person_id uuid, nome text, telefone text, email text,
  presenca_obrigatoria boolean, last_checkin_date date, days_since_checkin integer, notified_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT 'funcionario'::text AS person_type, f.id AS person_id, f.nome, f.telefone, f.email, f.presenca_obrigatoria,
      (SELECT MAX(c.checkin_date) FROM funcionario_checkins c WHERE c.funcionario_id = f.id) AS last_checkin_date
    FROM funcionarios f WHERE f.client_id = p_client_id AND f.status = 'ativo'
    UNION ALL
    SELECT CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END, c.id, c.nome, c.telefone, c.email, c.presenca_obrigatoria,
      (SELECT MAX(ck.checkin_date) FROM contratado_checkins ck WHERE ck.contratado_id = c.id)
    FROM contratados c WHERE c.client_id = p_client_id AND c.status = 'ativo'
    UNION ALL
    SELECT 'apoiador'::text, sa.id, sa.name,
      (SELECT p.telefone FROM pessoas p WHERE p.client_id = p_client_id AND p.email = sa.email LIMIT 1),
      sa.email, sa.presenca_obrigatoria,
      (SELECT MAX(sc.checkin_date) FROM supporter_checkins sc WHERE sc.supporter_account_id = sa.id)
    FROM supporter_accounts sa WHERE sa.client_id = p_client_id
  )
  SELECT b.person_type, b.person_id, b.nome, b.telefone, b.email, b.presenca_obrigatoria, b.last_checkin_date,
    CASE WHEN b.last_checkin_date IS NULL THEN 9999
      ELSE (CURRENT_DATE - b.last_checkin_date)::integer END,
    n.sent_at
  FROM base b
  LEFT JOIN presence_absence_notifications n
    ON n.client_id = p_client_id AND n.person_type = b.person_type AND n.person_id = b.person_id;
$$;

ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS presence_absence_message_template text NOT NULL DEFAULT
'Olá, {nome}! 👋

Notamos que você não acessou o portal da campanha *{campanha}* há {dias} dias.

O seu acesso diário é muito importante: é nele que você confirma sua presença e recebe as missões para interagir nas redes sociais. 🙌

Lembre-se: o registro precisa ser feito *todos os dias*. Conto com você!';

-- 71: whatsapp_confirmado em funcionarios + supporter_accounts
ALTER TABLE public.supporter_accounts ADD COLUMN IF NOT EXISTS whatsapp_confirmado boolean NOT NULL DEFAULT false;
ALTER TABLE public.funcionarios ADD COLUMN IF NOT EXISTS whatsapp_confirmado boolean NOT NULL DEFAULT false;

-- 73: whatsapp_phone_variants + confirm_whatsapp_by_phone
CREATE OR REPLACE FUNCTION public.whatsapp_phone_variants(p_phone text)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v_digits text; v_no_country text; v_variants text[] := ARRAY[]::text[];
BEGIN
  v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  IF v_digits = '' THEN RETURN ARRAY[]::text[]; END IF;
  v_variants := array_append(v_variants, v_digits);
  IF left(v_digits, 2) = '55' AND length(v_digits) > 11 THEN
    v_no_country := substring(v_digits from 3);
    v_variants := array_append(v_variants, v_no_country);
  ELSE
    v_no_country := v_digits;
    IF length(v_no_country) >= 10 THEN v_variants := array_append(v_variants, '55' || v_no_country); END IF;
  END IF;
  IF length(v_no_country) = 11 AND substring(v_no_country from 3 for 1) = '9' THEN
    v_variants := array_append(v_variants, substring(v_no_country from 1 for 2) || substring(v_no_country from 4));
    v_variants := array_append(v_variants, '55' || substring(v_no_country from 1 for 2) || substring(v_no_country from 4));
  ELSIF length(v_no_country) = 10 THEN
    v_variants := array_append(v_variants, substring(v_no_country from 1 for 2) || '9' || substring(v_no_country from 3));
    v_variants := array_append(v_variants, '55' || substring(v_no_country from 1 for 2) || '9' || substring(v_no_country from 3));
  END IF;
  RETURN ARRAY(SELECT DISTINCT v FROM unnest(v_variants) AS v WHERE length(v) >= 10);
END; $$;

CREATE OR REPLACE FUNCTION public.confirm_whatsapp_by_phone(p_client_id uuid, p_phone text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_digits text; v_variants text[]; v_pessoa_count int := 0;
  v_account_count int := 0; v_func_count int := 0; v_contr_count int := 0;
BEGIN
  v_digits := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
  v_variants := public.whatsapp_phone_variants(p_phone);
  IF COALESCE(array_length(v_variants, 1), 0) = 0 THEN
    RETURN jsonb_build_object('matched', false, 'reason', 'phone too short');
  END IF;
  WITH updated AS (
    UPDATE pessoas SET whatsapp_confirmado = true, updated_at = NOW()
    WHERE client_id = p_client_id AND whatsapp_confirmado = false
      AND telefone IS NOT NULL
      AND public.whatsapp_phone_variants(telefone) && v_variants
    RETURNING id
  ) SELECT COUNT(*) INTO v_pessoa_count FROM updated;
  IF v_pessoa_count > 0 THEN
    INSERT INTO interacoes_pessoa (client_id, pessoa_id, tipo_interacao, descricao, criado_por)
    SELECT p_client_id, p.id, 'whatsapp',
      'WhatsApp confirmado automaticamente — mensagem recebida no número oficial.',
      '00000000-0000-0000-0000-000000000000'::uuid
    FROM pessoas p WHERE p.client_id = p_client_id
      AND p.telefone IS NOT NULL
      AND public.whatsapp_phone_variants(p.telefone) && v_variants
      AND p.whatsapp_confirmado = true;
  END IF;
  UPDATE supporter_accounts sa SET whatsapp_confirmado = true, updated_at = NOW()
  WHERE sa.client_id = p_client_id AND sa.whatsapp_confirmado = false
    AND EXISTS (SELECT 1 FROM pessoas p WHERE p.client_id = p_client_id
      AND p.supporter_id = sa.supporter_id AND p.telefone IS NOT NULL
      AND public.whatsapp_phone_variants(p.telefone) && v_variants);
  GET DIAGNOSTICS v_account_count = ROW_COUNT;
  UPDATE funcionarios SET whatsapp_confirmado = true, updated_at = NOW()
  WHERE client_id = p_client_id AND whatsapp_confirmado = false
    AND telefone IS NOT NULL AND public.whatsapp_phone_variants(telefone) && v_variants;
  GET DIAGNOSTICS v_func_count = ROW_COUNT;
  UPDATE contratados SET whatsapp_confirmado = true, updated_at = NOW()
  WHERE client_id = p_client_id AND whatsapp_confirmado = false
    AND telefone IS NOT NULL AND public.whatsapp_phone_variants(telefone) && v_variants;
  GET DIAGNOSTICS v_contr_count = ROW_COUNT;
  RETURN jsonb_build_object('matched', (v_pessoa_count + v_account_count + v_func_count + v_contr_count) > 0,
    'phone_normalized', v_digits, 'phone_variants', v_variants,
    'pessoas_updated', v_pessoa_count, 'supporter_accounts_updated', v_account_count,
    'funcionarios_updated', v_func_count, 'contratados_updated', v_contr_count);
END; $$;