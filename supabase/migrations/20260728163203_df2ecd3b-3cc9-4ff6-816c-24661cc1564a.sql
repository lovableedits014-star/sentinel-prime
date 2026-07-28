
-- ============================================================
-- Public mission RPCs (SECURITY DEFINER) — used by /api/public/missao/*
-- Enable anon-safe access to mission tracking without needing
-- SUPABASE_SERVICE_ROLE_KEY in the TSS worker environment.
-- ============================================================

CREATE OR REPLACE FUNCTION public.public_mission_config(
  p_mission_id uuid,
  p_code text,
  p_token text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission record;
  v_client_name text;
  v_dist record;
  v_tok record;
  v_participant record;
  v_distribution_valid boolean := false;
  v_group_name text := null;
  v_participant_json jsonb := null;
BEGIN
  SELECT id, client_id, title, tracking_enabled, link_facebook, link_instagram,
         link_avulso, instructions, post_url, platform
    INTO v_mission
    FROM portal_missions
   WHERE id = p_mission_id;

  IF v_mission.id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  SELECT name INTO v_client_name FROM clients WHERE id = v_mission.client_id;

  IF p_code IS NOT NULL AND length(p_code) > 0 AND p_code <> 'invalid' THEN
    SELECT id, group_name_snapshot INTO v_dist
      FROM mission_distributions
     WHERE short_code = p_code AND mission_id = p_mission_id;
    IF v_dist.id IS NOT NULL THEN
      v_distribution_valid := true;
      v_group_name := v_dist.group_name_snapshot;
    END IF;
  END IF;

  IF p_token IS NOT NULL AND length(p_token) > 0 THEN
    SELECT participant_id, client_id, revoked_at INTO v_tok
      FROM mission_visitor_tokens
     WHERE token = p_token;
    IF v_tok.participant_id IS NOT NULL
       AND v_tok.revoked_at IS NULL
       AND v_tok.client_id = v_mission.client_id THEN
      SELECT id, nome INTO v_participant
        FROM mission_participants
       WHERE id = v_tok.participant_id;
      IF v_participant.id IS NOT NULL THEN
        v_participant_json := jsonb_build_object('id', v_participant.id, 'nome', v_participant.nome);
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'mission', jsonb_build_object(
      'id', v_mission.id,
      'title', v_mission.title,
      'tracking_enabled', v_mission.tracking_enabled,
      'link_facebook', v_mission.link_facebook,
      'link_instagram', v_mission.link_instagram,
      'link_avulso', v_mission.link_avulso,
      'instructions', v_mission.instructions,
      'legacy_post_url', v_mission.post_url,
      'legacy_platform', v_mission.platform
    ),
    'client_name', v_client_name,
    'distribution_valid', v_distribution_valid,
    'group_name', v_group_name,
    'participant', v_participant_json
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_mission_config(uuid, text, text) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.public_mission_identify(
  p_mission_id uuid,
  p_code text,
  p_nome text,
  p_phone text,
  p_user_agent text,
  p_device text,
  p_is_bot boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission record;
  v_dist_id uuid;
  v_participant_id uuid;
  v_existing_id uuid;
  v_token text;
  v_bytes bytea;
BEGIN
  IF p_mission_id IS NULL OR p_nome IS NULL OR length(btrim(p_nome)) = 0
     OR p_phone IS NULL OR length(btrim(p_phone)) = 0 THEN
    RETURN jsonb_build_object('error', 'Dados inválidos');
  END IF;

  SELECT id, client_id INTO v_mission FROM portal_missions WHERE id = p_mission_id;
  IF v_mission.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Missão não encontrada');
  END IF;

  IF p_code IS NOT NULL AND length(p_code) > 0 AND p_code <> 'invalid' THEN
    SELECT id INTO v_dist_id
      FROM mission_distributions
     WHERE short_code = p_code AND mission_id = p_mission_id;
  END IF;

  SELECT id INTO v_existing_id
    FROM mission_participants
   WHERE client_id = v_mission.client_id AND phone_e164 = p_phone;

  IF v_existing_id IS NOT NULL THEN
    v_participant_id := v_existing_id;
    UPDATE mission_participants
       SET nome = p_nome, last_seen_at = now()
     WHERE id = v_participant_id;
  ELSE
    INSERT INTO mission_participants (client_id, phone_e164, nome, first_seen_at, last_seen_at)
    VALUES (v_mission.client_id, p_phone, p_nome, now(), now())
    RETURNING id INTO v_participant_id;
  END IF;

  v_bytes := gen_random_bytes(24);
  v_token := encode(v_bytes, 'hex');

  INSERT INTO mission_visitor_tokens (token, participant_id, client_id, user_agent, device_hint)
  VALUES (v_token, v_participant_id, v_mission.client_id, p_user_agent, p_device);

  INSERT INTO mission_events (mission_id, distribution_id, participant_id, client_id, event_type, user_agent, device_category, is_bot)
  VALUES (p_mission_id, v_dist_id, v_participant_id, v_mission.client_id, 'open', p_user_agent, p_device, coalesce(p_is_bot, false));

  RETURN jsonb_build_object(
    'token', v_token,
    'participant', jsonb_build_object('id', v_participant_id, 'nome', p_nome)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_mission_identify(uuid, text, text, text, text, text, boolean) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.public_mission_event(
  p_mission_id uuid,
  p_code text,
  p_token text,
  p_type text,
  p_user_agent text,
  p_device text,
  p_is_bot boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission record;
  v_dist_id uuid;
  v_participant_id uuid;
  v_tok record;
BEGIN
  IF p_mission_id IS NULL OR p_type IS NULL
     OR p_type NOT IN ('open','click_facebook','click_instagram','click_avulso','declared_done') THEN
    RETURN jsonb_build_object('error', 'Dados inválidos');
  END IF;

  SELECT id, client_id INTO v_mission FROM portal_missions WHERE id = p_mission_id;
  IF v_mission.id IS NULL THEN
    RETURN jsonb_build_object('error', 'Missão não encontrada');
  END IF;

  IF p_code IS NOT NULL AND length(p_code) > 0 AND p_code <> 'invalid' THEN
    SELECT id INTO v_dist_id
      FROM mission_distributions
     WHERE short_code = p_code AND mission_id = p_mission_id;
  END IF;

  IF p_token IS NOT NULL AND length(p_token) > 0 THEN
    SELECT participant_id, client_id, revoked_at INTO v_tok
      FROM mission_visitor_tokens WHERE token = p_token;
    IF v_tok.participant_id IS NOT NULL
       AND v_tok.revoked_at IS NULL
       AND v_tok.client_id = v_mission.client_id THEN
      v_participant_id := v_tok.participant_id;
      UPDATE mission_visitor_tokens SET last_used_at = now() WHERE token = p_token;
      UPDATE mission_participants SET last_seen_at = now() WHERE id = v_participant_id;
    END IF;
  END IF;

  INSERT INTO mission_events (mission_id, distribution_id, participant_id, client_id, event_type, user_agent, device_category, is_bot)
  VALUES (p_mission_id, v_dist_id, v_participant_id, v_mission.client_id, p_type::mission_event_type, p_user_agent, p_device, coalesce(p_is_bot, false));

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_mission_event(uuid, text, text, text, text, text, boolean) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.public_mission_switch(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) = 0 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;
  UPDATE mission_visitor_tokens SET revoked_at = now() WHERE token = p_token;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_mission_switch(text) TO anon, authenticated;
