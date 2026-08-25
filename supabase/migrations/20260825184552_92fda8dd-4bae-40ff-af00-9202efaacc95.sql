-- 1) Normalização de telefone -------------------------------------------------
CREATE OR REPLACE FUNCTION public.mission_norm_phone(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE d text;
BEGIN
  d := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  d := ltrim(d, '0');
  IF length(d) > 11 AND left(d, 2) = '55' THEN
    d := ltrim(substr(d, 3), '0');
  END IF;
  IF length(d) IN (10, 11) THEN RETURN '55' || d; END IF;
  IF length(d) IN (12, 13) AND left(d, 2) = '55' THEN RETURN d; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.mission_phone_key(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE n text; loc text; ddd text; rest text;
BEGIN
  n := public.mission_norm_phone(p);
  IF n IS NULL THEN RETURN NULL; END IF;
  loc := substr(n, 3);
  ddd := left(loc, 2);
  rest := substr(loc, 3);
  IF length(rest) = 9 THEN rest := right(rest, 8); END IF;
  RETURN ddd || rest;
END $$;

-- 2) Participantes: vínculos fortes -------------------------------------------
ALTER TABLE public.mission_participants
  ADD COLUMN IF NOT EXISTS funcionario_id uuid,
  ADD COLUMN IF NOT EXISTS contratado_id uuid,
  ADD COLUMN IF NOT EXISTS crm_pessoa_id uuid,
  ADD COLUMN IF NOT EXISTS match_source text,
  ADD COLUMN IF NOT EXISTS matched_at timestamptz,
  ADD COLUMN IF NOT EXISTS cargo_snapshot text,
  ADD COLUMN IF NOT EXISTS regiao_snapshot text;

CREATE INDEX IF NOT EXISTS idx_mission_participants_phone_key
  ON public.mission_participants (client_id, public.mission_phone_key(phone_e164));
CREATE INDEX IF NOT EXISTS idx_mission_participants_pessoa
  ON public.mission_participants (client_id, pessoa_id);

CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_phone_key
  ON public.eleicao_pessoas (client_id, public.mission_phone_key(telefone));
CREATE INDEX IF NOT EXISTS idx_funcionarios_phone_key
  ON public.funcionarios (client_id, public.mission_phone_key(telefone));
CREATE INDEX IF NOT EXISTS idx_contratados_phone_key
  ON public.contratados (client_id, public.mission_phone_key(telefone));

-- 3) Resolver identidade pelo telefone ----------------------------------------
CREATE OR REPLACE FUNCTION public.mission_resolve_identity(p_client_id uuid, p_phone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE k text; r record;
BEGIN
  k := public.mission_phone_key(p_phone);
  IF k IS NULL OR p_client_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT id, nome, tipo, is_voluntario, regiao, cidade, valor_contratacao
    INTO r
    FROM eleicao_pessoas
   WHERE client_id = p_client_id AND public.mission_phone_key(telefone) = k
   ORDER BY updated_at DESC NULLS LAST
   LIMIT 1;
  IF r.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'match_source', 'eleicao',
      'pessoa_id', r.id,
      'nome', r.nome,
      'cargo', CASE WHEN r.is_voluntario THEN 'voluntario' ELSE r.tipo::text END,
      'regiao', coalesce(r.regiao, r.cidade),
      'obrigado', (r.is_voluntario OR r.valor_contratacao IS NOT NULL)
    );
  END IF;

  SELECT id, nome, cidade INTO r
    FROM contratados
   WHERE client_id = p_client_id AND public.mission_phone_key(telefone) = k
   LIMIT 1;
  IF r.id IS NOT NULL THEN
    RETURN jsonb_build_object('match_source','contratado','contratado_id',r.id,
      'nome',r.nome,'cargo','contratado','regiao',r.cidade,'obrigado',true);
  END IF;

  SELECT id, nome, cidade INTO r
    FROM funcionarios
   WHERE client_id = p_client_id AND public.mission_phone_key(telefone) = k
   LIMIT 1;
  IF r.id IS NOT NULL THEN
    RETURN jsonb_build_object('match_source','funcionario','funcionario_id',r.id,
      'nome',r.nome,'cargo','funcionario','regiao',r.cidade,'obrigado',true);
  END IF;

  SELECT id, nome, cidade INTO r
    FROM pessoas
   WHERE client_id = p_client_id AND public.mission_phone_key(telefone) = k
   LIMIT 1;
  IF r.id IS NOT NULL THEN
    RETURN jsonb_build_object('match_source','crm','crm_pessoa_id',r.id,
      'nome',r.nome,'cargo','contato','regiao',r.cidade,'obrigado',false);
  END IF;

  RETURN '{}'::jsonb;
END $$;

-- 4) Tabela de check-ins ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mission_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  mission_id uuid NOT NULL,
  participant_id uuid NOT NULL,
  pessoa_id uuid,
  funcionario_id uuid,
  contratado_id uuid,
  distribution_id uuid,
  primeiro_acesso_em timestamptz NOT NULL DEFAULT now(),
  ultimo_acesso_em timestamptz NOT NULL DEFAULT now(),
  primeiro_clique_em timestamptz,
  concluido_em timestamptz,
  opens integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mission_id, participant_id)
);

GRANT SELECT ON public.mission_checkins TO authenticated;
GRANT ALL ON public.mission_checkins TO service_role;
ALTER TABLE public.mission_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipe do cliente le check-ins" ON public.mission_checkins;
CREATE POLICY "Equipe do cliente le check-ins" ON public.mission_checkins
  FOR SELECT TO authenticated USING (public.is_client_member(client_id));

CREATE INDEX IF NOT EXISTS idx_mission_checkins_mission ON public.mission_checkins (mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_checkins_pessoa ON public.mission_checkins (client_id, pessoa_id);

CREATE OR REPLACE FUNCTION public.mission_checkins_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_mission_checkins_touch ON public.mission_checkins;
CREATE TRIGGER trg_mission_checkins_touch BEFORE UPDATE ON public.mission_checkins
  FOR EACH ROW EXECUTE FUNCTION public.mission_checkins_touch();

-- 5) Alimentar check-ins a partir dos eventos ---------------------------------
CREATE OR REPLACE FUNCTION public.mission_events_sync_checkin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; is_click boolean; is_done boolean;
BEGIN
  IF NEW.is_bot OR NEW.participant_id IS NULL OR NEW.mission_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT pessoa_id, funcionario_id, contratado_id, client_id
    INTO p FROM mission_participants WHERE id = NEW.participant_id;

  is_click := NEW.event_type::text IN ('click_facebook','click_instagram','click_avulso');
  is_done  := NEW.event_type::text = 'declared_done';

  INSERT INTO mission_checkins (
    client_id, mission_id, participant_id, pessoa_id, funcionario_id, contratado_id,
    distribution_id, primeiro_acesso_em, ultimo_acesso_em, primeiro_clique_em, concluido_em, opens, clicks
  ) VALUES (
    coalesce(NEW.client_id, p.client_id), NEW.mission_id, NEW.participant_id,
    p.pessoa_id, p.funcionario_id, p.contratado_id, NEW.distribution_id,
    NEW.created_at, NEW.created_at,
    CASE WHEN is_click THEN NEW.created_at END,
    CASE WHEN is_done THEN NEW.created_at END,
    CASE WHEN NEW.event_type::text = 'open' THEN 1 ELSE 0 END,
    CASE WHEN is_click THEN 1 ELSE 0 END
  )
  ON CONFLICT (mission_id, participant_id) DO UPDATE SET
    ultimo_acesso_em = GREATEST(mission_checkins.ultimo_acesso_em, NEW.created_at),
    primeiro_clique_em = coalesce(mission_checkins.primeiro_clique_em, CASE WHEN is_click THEN NEW.created_at END),
    concluido_em = coalesce(mission_checkins.concluido_em, CASE WHEN is_done THEN NEW.created_at END),
    opens = mission_checkins.opens + CASE WHEN NEW.event_type::text = 'open' THEN 1 ELSE 0 END,
    clicks = mission_checkins.clicks + CASE WHEN is_click THEN 1 ELSE 0 END,
    distribution_id = coalesce(mission_checkins.distribution_id, NEW.distribution_id),
    pessoa_id = coalesce(mission_checkins.pessoa_id, p.pessoa_id),
    funcionario_id = coalesce(mission_checkins.funcionario_id, p.funcionario_id),
    contratado_id = coalesce(mission_checkins.contratado_id, p.contratado_id);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mission_events_sync_checkin ON public.mission_events;
CREATE TRIGGER trg_mission_events_sync_checkin AFTER INSERT ON public.mission_events
  FOR EACH ROW EXECUTE FUNCTION public.mission_events_sync_checkin();

-- 6) Identify público agora reconhece a pessoa --------------------------------
CREATE OR REPLACE FUNCTION public.public_mission_identify(
  p_mission_id uuid, p_code text, p_nome text, p_phone text,
  p_user_agent text, p_device text, p_is_bot boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mission record; v_dist_id uuid; v_existing_id uuid;
  v_participant_id uuid; v_token text; v_ident jsonb; v_phone text;
BEGIN
  SELECT id, client_id, tracking_enabled INTO v_mission
    FROM portal_missions WHERE id = p_mission_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  v_phone := coalesce(public.mission_norm_phone(p_phone), p_phone);

  IF p_code IS NOT NULL AND p_code <> '' AND p_code <> 'invalid' THEN
    SELECT id INTO v_dist_id FROM mission_distributions
     WHERE short_code = p_code AND mission_id = p_mission_id;
  END IF;

  v_ident := public.mission_resolve_identity(v_mission.client_id, v_phone);

  SELECT id INTO v_existing_id FROM mission_participants
   WHERE client_id = v_mission.client_id
     AND public.mission_phone_key(phone_e164) = public.mission_phone_key(v_phone)
   ORDER BY created_at
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    v_participant_id := v_existing_id;
    UPDATE mission_participants SET
      nome = coalesce(nullif(v_ident->>'nome',''), p_nome),
      phone_e164 = v_phone,
      last_seen_at = now(),
      pessoa_id = coalesce((v_ident->>'pessoa_id')::uuid, pessoa_id),
      funcionario_id = coalesce((v_ident->>'funcionario_id')::uuid, funcionario_id),
      contratado_id = coalesce((v_ident->>'contratado_id')::uuid, contratado_id),
      crm_pessoa_id = coalesce((v_ident->>'crm_pessoa_id')::uuid, crm_pessoa_id),
      match_source = coalesce(v_ident->>'match_source', match_source),
      matched_at = CASE WHEN v_ident->>'match_source' IS NOT NULL THEN now() ELSE matched_at END,
      cargo_snapshot = coalesce(v_ident->>'cargo', cargo_snapshot),
      regiao_snapshot = coalesce(v_ident->>'regiao', regiao_snapshot)
    WHERE id = v_participant_id;
  ELSE
    INSERT INTO mission_participants (
      client_id, phone_e164, nome, first_seen_at, last_seen_at,
      pessoa_id, funcionario_id, contratado_id, crm_pessoa_id,
      match_source, matched_at, cargo_snapshot, regiao_snapshot)
    VALUES (
      v_mission.client_id, v_phone, coalesce(nullif(v_ident->>'nome',''), p_nome), now(), now(),
      (v_ident->>'pessoa_id')::uuid, (v_ident->>'funcionario_id')::uuid,
      (v_ident->>'contratado_id')::uuid, (v_ident->>'crm_pessoa_id')::uuid,
      v_ident->>'match_source',
      CASE WHEN v_ident->>'match_source' IS NOT NULL THEN now() END,
      v_ident->>'cargo', v_ident->>'regiao')
    RETURNING id INTO v_participant_id;
  END IF;

  SELECT token INTO v_token FROM mission_visitor_tokens
   WHERE participant_id = v_participant_id AND revoked_at IS NULL
   ORDER BY created_at DESC LIMIT 1;

  IF v_token IS NULL THEN
    v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
    INSERT INTO mission_visitor_tokens (token, participant_id, client_id, user_agent, device_hint, last_distribution_id)
    VALUES (v_token, v_participant_id, v_mission.client_id, p_user_agent, p_device, v_dist_id);
  ELSE
    UPDATE mission_visitor_tokens
       SET last_used_at = now(), last_distribution_id = coalesce(v_dist_id, last_distribution_id)
     WHERE token = v_token;
  END IF;

  INSERT INTO mission_events (mission_id, distribution_id, participant_id, client_id,
    event_type, user_agent, device_category, is_bot)
  VALUES (p_mission_id, v_dist_id, v_participant_id, v_mission.client_id,
    'open', p_user_agent, p_device, coalesce(p_is_bot,false));

  RETURN jsonb_build_object(
    'token', v_token,
    'participant', jsonb_build_object(
      'id', v_participant_id,
      'nome', coalesce(nullif(v_ident->>'nome',''), p_nome),
      'cargo', v_ident->>'cargo',
      'regiao', v_ident->>'regiao',
      'reconhecido', (v_ident->>'match_source') IS NOT NULL,
      'obrigado', coalesce((v_ident->>'obrigado')::boolean, false)
    )
  );
END $$;

-- 7) Config público devolve cargo/região do participante ----------------------
CREATE OR REPLACE FUNCTION public.public_mission_config(p_mission_id uuid, p_code text, p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_mission record; v_client_name text; v_dist record; v_tok record;
  v_participant record; v_distribution_valid boolean := false;
  v_group_name text := null; v_participant_json jsonb := null; v_done timestamptz;
BEGIN
  SELECT id, client_id, title, tracking_enabled, link_facebook, link_instagram,
         link_avulso, instructions, post_url, platform, archived_at
    INTO v_mission FROM portal_missions WHERE id = p_mission_id;
  IF v_mission.id IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT name INTO v_client_name FROM clients WHERE id = v_mission.client_id;

  IF p_code IS NOT NULL AND length(p_code) > 0 AND p_code <> 'invalid' THEN
    SELECT id, group_name_snapshot INTO v_dist FROM mission_distributions
     WHERE short_code = p_code AND mission_id = p_mission_id;
    IF v_dist.id IS NOT NULL THEN
      v_distribution_valid := true;
      v_group_name := v_dist.group_name_snapshot;
    END IF;
  END IF;

  IF p_token IS NOT NULL AND length(p_token) > 0 THEN
    SELECT participant_id, client_id, revoked_at INTO v_tok
      FROM mission_visitor_tokens WHERE token = p_token;
    IF v_tok.participant_id IS NOT NULL AND v_tok.revoked_at IS NULL
       AND v_tok.client_id = v_mission.client_id THEN
      SELECT id, nome, cargo_snapshot, regiao_snapshot, match_source
        INTO v_participant FROM mission_participants WHERE id = v_tok.participant_id;
      IF v_participant.id IS NOT NULL THEN
        SELECT concluido_em INTO v_done FROM mission_checkins
         WHERE mission_id = p_mission_id AND participant_id = v_participant.id;
        v_participant_json := jsonb_build_object(
          'id', v_participant.id, 'nome', v_participant.nome,
          'cargo', v_participant.cargo_snapshot, 'regiao', v_participant.regiao_snapshot,
          'reconhecido', v_participant.match_source IS NOT NULL,
          'concluido_em', v_done);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'mission', jsonb_build_object(
      'id', v_mission.id, 'title', v_mission.title,
      'tracking_enabled', v_mission.tracking_enabled,
      'link_facebook', v_mission.link_facebook,
      'link_instagram', v_mission.link_instagram,
      'link_avulso', v_mission.link_avulso,
      'instructions', v_mission.instructions,
      'legacy_post_url', v_mission.post_url,
      'legacy_platform', v_mission.platform,
      'archived_at', v_mission.archived_at),
    'client_id', v_mission.client_id,
    'client_name', v_client_name,
    'distribution_valid', v_distribution_valid,
    'group_name', v_group_name,
    'participant', v_participant_json);
END $$;

-- 8) Geração de links --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mission_link_generate(
  p_mission_id uuid, p_group_jid text DEFAULT NULL, p_group_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client uuid; v_code text; v_id uuid; v_existing record;
BEGIN
  SELECT client_id INTO v_client FROM portal_missions WHERE id = p_mission_id;
  IF v_client IS NULL THEN RAISE EXCEPTION 'Missão não encontrada'; END IF;
  IF NOT public.is_client_member(v_client) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  SELECT id, short_code INTO v_existing FROM mission_distributions
   WHERE mission_id = p_mission_id
     AND coalesce(group_jid,'') = coalesce(p_group_jid,'')
     AND coalesce(group_name_snapshot,'') = coalesce(p_group_name,'')
   LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object('id', v_existing.id, 'short_code', v_existing.short_code, 'reused', true);
  END IF;

  LOOP
    v_code := lower(substr(replace(gen_random_uuid()::text,'-',''), 1, 7));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM mission_distributions WHERE short_code = v_code);
  END LOOP;

  INSERT INTO mission_distributions (mission_id, client_id, group_jid, group_name_snapshot, short_code, created_by)
  VALUES (p_mission_id, v_client, p_group_jid, p_group_name, v_code, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'short_code', v_code, 'reused', false);
END $$;

-- 9) Dashboard de cobrança ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.mission_checkin_dashboard(
  p_client_id uuid,
  p_mission_id uuid,
  p_incluir_sem_valor boolean DEFAULT false,
  p_incluir_funcionarios boolean DEFAULT false,
  p_regiao text DEFAULT NULL)
RETURNS TABLE(
  pessoa_id uuid, origem text, nome text, telefone text, cargo text, regiao text,
  cidade text, is_voluntario boolean, tem_contrato boolean, indicador_nome text,
  status text, primeiro_acesso_em timestamptz, concluido_em timestamptz, clicks integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  RETURN QUERY
  WITH base AS (
    SELECT p.id, 'eleicao'::text AS origem, p.nome, p.telefone,
           CASE WHEN p.is_voluntario THEN 'voluntario' ELSE p.tipo::text END AS cargo,
           coalesce(p.regiao, p.cidade) AS regiao, p.cidade,
           coalesce(p.is_voluntario,false) AS is_voluntario,
           (p.valor_contratacao IS NOT NULL) AS tem_contrato,
           (SELECT pai.nome FROM eleicao_pessoas pai WHERE pai.id = p.parent_id) AS indicador_nome
      FROM eleicao_pessoas p
     WHERE p.client_id = p_client_id
       AND (p_incluir_sem_valor OR p.valor_contratacao IS NOT NULL OR coalesce(p.is_voluntario,false))
    UNION ALL
    SELECT f.id, 'funcionario', f.nome, f.telefone, 'funcionario', f.cidade, f.cidade,
           false, true, NULL
      FROM funcionarios f
     WHERE p_incluir_funcionarios AND f.client_id = p_client_id
  ), ck AS (
    SELECT c.pessoa_id, c.funcionario_id, c.primeiro_acesso_em, c.concluido_em, c.clicks
      FROM mission_checkins c
     WHERE c.client_id = p_client_id AND c.mission_id = p_mission_id
  )
  SELECT b.id, b.origem, b.nome, b.telefone, b.cargo, b.regiao, b.cidade,
         b.is_voluntario, b.tem_contrato, b.indicador_nome,
         CASE
           WHEN k.concluido_em IS NOT NULL THEN 'cumpriu'
           WHEN k.primeiro_acesso_em IS NOT NULL THEN 'abriu'
           ELSE 'nao_abriu'
         END AS status,
         k.primeiro_acesso_em, k.concluido_em, coalesce(k.clicks, 0)
    FROM base b
    LEFT JOIN ck k
      ON (b.origem = 'eleicao' AND k.pessoa_id = b.id)
      OR (b.origem = 'funcionario' AND k.funcionario_id = b.id)
   WHERE p_regiao IS NULL OR b.regiao = p_regiao
   ORDER BY b.nome;
END $$;

-- 10) Histórico de missões da pessoa -----------------------------------------
CREATE OR REPLACE FUNCTION public.mission_checkin_pessoa_historico(
  p_client_id uuid, p_pessoa_id uuid, p_limit integer DEFAULT 20)
RETURNS TABLE(mission_id uuid, title text, publicado_em timestamptz,
  primeiro_acesso_em timestamptz, concluido_em timestamptz, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  RETURN QUERY
  SELECT m.id, m.title, coalesce(m.publicado_em, m.created_at),
         c.primeiro_acesso_em, c.concluido_em,
         CASE WHEN c.concluido_em IS NOT NULL THEN 'cumpriu'
              WHEN c.primeiro_acesso_em IS NOT NULL THEN 'abriu'
              ELSE 'nao_abriu' END
    FROM portal_missions m
    LEFT JOIN mission_checkins c
      ON c.mission_id = m.id AND c.pessoa_id = p_pessoa_id
   WHERE m.client_id = p_client_id AND m.archived_at IS NULL
   ORDER BY coalesce(m.publicado_em, m.created_at) DESC
   LIMIT greatest(1, coalesce(p_limit, 20));
END $$;

-- 11) Backfill dos eventos já registrados ------------------------------------
INSERT INTO public.mission_checkins (
  client_id, mission_id, participant_id, pessoa_id, funcionario_id, contratado_id,
  distribution_id, primeiro_acesso_em, ultimo_acesso_em, primeiro_clique_em, concluido_em, opens, clicks)
SELECT coalesce(e.client_id, mp.client_id), e.mission_id, e.participant_id,
       mp.pessoa_id, mp.funcionario_id, mp.contratado_id,
       min(e.distribution_id::text)::uuid,
       min(e.created_at), max(e.created_at),
       min(e.created_at) FILTER (WHERE e.event_type::text IN ('click_facebook','click_instagram','click_avulso')),
       min(e.created_at) FILTER (WHERE e.event_type::text = 'declared_done'),
       count(*) FILTER (WHERE e.event_type::text = 'open')::int,
       count(*) FILTER (WHERE e.event_type::text IN ('click_facebook','click_instagram','click_avulso'))::int
  FROM public.mission_events e
  JOIN public.mission_participants mp ON mp.id = e.participant_id
 WHERE NOT e.is_bot AND e.mission_id IS NOT NULL AND e.participant_id IS NOT NULL
 GROUP BY 1,2,3,4,5,6
ON CONFLICT (mission_id, participant_id) DO NOTHING;

-- 12) Vincular participantes existentes pelo telefone ------------------------
UPDATE public.mission_participants mp
   SET pessoa_id = ep.id,
       match_source = coalesce(mp.match_source, 'eleicao'),
       matched_at = coalesce(mp.matched_at, now()),
       cargo_snapshot = coalesce(mp.cargo_snapshot, CASE WHEN ep.is_voluntario THEN 'voluntario' ELSE ep.tipo::text END),
       regiao_snapshot = coalesce(mp.regiao_snapshot, ep.regiao, ep.cidade)
  FROM public.eleicao_pessoas ep
 WHERE mp.pessoa_id IS NULL
   AND ep.client_id = mp.client_id
   AND public.mission_phone_key(ep.telefone) = public.mission_phone_key(mp.phone_e164);

UPDATE public.mission_checkins c
   SET pessoa_id = mp.pessoa_id
  FROM public.mission_participants mp
 WHERE c.participant_id = mp.id AND c.pessoa_id IS NULL AND mp.pessoa_id IS NOT NULL;