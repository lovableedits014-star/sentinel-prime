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
  v_existing_id uuid;
  v_participant_id uuid;
  v_token text;
BEGIN
  SELECT id, client_id, tracking_enabled INTO v_mission
    FROM portal_missions WHERE id = p_mission_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF p_code IS NOT NULL AND p_code <> '' AND p_code <> 'invalid' THEN
    SELECT id INTO v_dist_id FROM mission_distributions
     WHERE short_code = p_code AND mission_id = p_mission_id;
  END IF;

  SELECT id INTO v_existing_id FROM mission_participants
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

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

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