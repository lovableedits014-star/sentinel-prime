
-- 1) Archive column
ALTER TABLE public.portal_missions ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2) Snapshot title on events + preserve on delete
ALTER TABLE public.mission_events ADD COLUMN IF NOT EXISTS mission_title_snapshot text;

-- Change FK to SET NULL (preserve historical events if mission is hard-deleted)
ALTER TABLE public.mission_events DROP CONSTRAINT IF EXISTS mission_events_mission_id_fkey;
ALTER TABLE public.mission_events
  ALTER COLUMN mission_id DROP NOT NULL;
ALTER TABLE public.mission_events
  ADD CONSTRAINT mission_events_mission_id_fkey
  FOREIGN KEY (mission_id) REFERENCES public.portal_missions(id) ON DELETE SET NULL;

-- Same for distributions so we don't lose group attribution on hard delete
ALTER TABLE public.mission_distributions DROP CONSTRAINT IF EXISTS mission_distributions_mission_id_fkey;
ALTER TABLE public.mission_distributions
  ADD CONSTRAINT mission_distributions_mission_id_fkey
  FOREIGN KEY (mission_id) REFERENCES public.portal_missions(id) ON DELETE SET NULL;
ALTER TABLE public.mission_distributions ALTER COLUMN mission_id DROP NOT NULL;

-- Trigger to fill mission_title_snapshot
CREATE OR REPLACE FUNCTION public.fill_mission_title_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mission_title_snapshot IS NULL AND NEW.mission_id IS NOT NULL THEN
    SELECT title INTO NEW.mission_title_snapshot FROM public.portal_missions WHERE id = NEW.mission_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_mission_title_snapshot ON public.mission_events;
CREATE TRIGGER trg_fill_mission_title_snapshot
BEFORE INSERT ON public.mission_events
FOR EACH ROW EXECUTE FUNCTION public.fill_mission_title_snapshot();

-- Backfill for existing rows
UPDATE public.mission_events e
SET mission_title_snapshot = pm.title
FROM public.portal_missions pm
WHERE e.mission_id = pm.id AND e.mission_title_snapshot IS NULL;

-- Also snapshot group name on the event (survives mission_distributions being cleared)
ALTER TABLE public.mission_events ADD COLUMN IF NOT EXISTS distribution_group_snapshot text;
CREATE OR REPLACE FUNCTION public.fill_mission_event_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.mission_title_snapshot IS NULL AND NEW.mission_id IS NOT NULL THEN
    SELECT title INTO NEW.mission_title_snapshot FROM public.portal_missions WHERE id = NEW.mission_id;
  END IF;
  IF NEW.distribution_group_snapshot IS NULL AND NEW.distribution_id IS NOT NULL THEN
    SELECT group_name_snapshot INTO NEW.distribution_group_snapshot FROM public.mission_distributions WHERE id = NEW.distribution_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_mission_title_snapshot ON public.mission_events;
CREATE TRIGGER trg_fill_mission_event_snapshots
BEFORE INSERT ON public.mission_events
FOR EACH ROW EXECUTE FUNCTION public.fill_mission_event_snapshots();

UPDATE public.mission_events e
SET distribution_group_snapshot = d.group_name_snapshot
FROM public.mission_distributions d
WHERE e.distribution_id = d.id AND e.distribution_group_snapshot IS NULL;

-- 3) Token→distribution binding: track last distribution seen per token, to fallback when link comes without code
ALTER TABLE public.mission_visitor_tokens ADD COLUMN IF NOT EXISTS last_distribution_id uuid;

-- 4) Updated RPC: public_mission_config now returns client_id
CREATE OR REPLACE FUNCTION public.public_mission_config(p_mission_id uuid, p_code text, p_token text)
RETURNS jsonb
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
         link_avulso, instructions, post_url, platform, archived_at
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
      'legacy_platform', v_mission.platform,
      'archived_at', v_mission.archived_at
    ),
    'client_id', v_mission.client_id,
    'client_name', v_client_name,
    'distribution_valid', v_distribution_valid,
    'group_name', v_group_name,
    'participant', v_participant_json
  );
END;
$$;

-- 5) Updated identify: reuse existing token per (client_id, participant_id) instead of creating new one every time
CREATE OR REPLACE FUNCTION public.public_mission_identify(
  p_mission_id uuid, p_code text, p_nome text, p_phone text,
  p_user_agent text, p_device text, p_is_bot boolean
)
RETURNS jsonb
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

  -- Reuse existing non-revoked token for this participant if any
  SELECT token INTO v_token
    FROM mission_visitor_tokens
   WHERE participant_id = v_participant_id AND revoked_at IS NULL
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_token IS NULL THEN
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO mission_visitor_tokens (token, participant_id, client_id, user_agent, device_hint, last_distribution_id)
    VALUES (v_token, v_participant_id, v_mission.client_id, p_user_agent, p_device, v_dist_id);
  ELSE
    UPDATE mission_visitor_tokens
       SET last_used_at = now(),
           user_agent = coalesce(p_user_agent, user_agent),
           device_hint = coalesce(p_device, device_hint),
           last_distribution_id = coalesce(v_dist_id, last_distribution_id)
     WHERE token = v_token;
  END IF;

  INSERT INTO mission_events (mission_id, distribution_id, participant_id, client_id, event_type, user_agent, device_category, is_bot)
  VALUES (p_mission_id, v_dist_id, v_participant_id, v_mission.client_id, 'open', p_user_agent, p_device, coalesce(p_is_bot, false));

  RETURN jsonb_build_object(
    'token', v_token,
    'participant', jsonb_build_object('id', v_participant_id, 'nome', p_nome)
  );
END;
$$;

-- 6) Updated event RPC: fallback to token.last_distribution_id when no code provided
CREATE OR REPLACE FUNCTION public.public_mission_event(
  p_mission_id uuid, p_code text, p_token text, p_type text,
  p_user_agent text, p_device text, p_is_bot boolean
)
RETURNS jsonb
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
    SELECT participant_id, client_id, revoked_at, last_distribution_id INTO v_tok
      FROM mission_visitor_tokens WHERE token = p_token;
    IF v_tok.participant_id IS NOT NULL
       AND v_tok.revoked_at IS NULL
       AND v_tok.client_id = v_mission.client_id THEN
      v_participant_id := v_tok.participant_id;
      -- Fallback: if code did not resolve a distribution but the token has one, use it
      IF v_dist_id IS NULL AND v_tok.last_distribution_id IS NOT NULL THEN
        v_dist_id := v_tok.last_distribution_id;
      END IF;
      -- Persist the newest distribution seen on the token
      UPDATE mission_visitor_tokens
         SET last_used_at = now(),
             last_distribution_id = coalesce(v_dist_id, last_distribution_id)
       WHERE token = p_token;
      UPDATE mission_participants SET last_seen_at = now() WHERE id = v_participant_id;
    END IF;
  END IF;

  INSERT INTO mission_events (mission_id, distribution_id, participant_id, client_id, event_type, user_agent, device_category, is_bot)
  VALUES (p_mission_id, v_dist_id, v_participant_id, v_mission.client_id, p_type::mission_event_type, p_user_agent, p_device, coalesce(p_is_bot, false));

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 7) Aggregated dashboard RPC (all missions for a client, including archived, with stats)
CREATE OR REPLACE FUNCTION public.client_missions_dashboard(p_client_id uuid)
RETURNS TABLE (
  mission_id uuid,
  title text,
  archived_at timestamptz,
  tracking_enabled boolean,
  created_at timestamptz,
  total_opens bigint,
  unique_participants bigint,
  click_facebook bigint,
  click_instagram bigint,
  click_avulso bigint,
  declared_done bigint,
  last_event_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ev AS (
    SELECT
      e.mission_id,
      count(*) FILTER (WHERE e.event_type = 'open' AND NOT e.is_bot) AS total_opens,
      count(DISTINCT e.participant_id) FILTER (WHERE NOT e.is_bot) AS unique_participants,
      count(*) FILTER (WHERE e.event_type = 'click_facebook' AND NOT e.is_bot) AS click_facebook,
      count(*) FILTER (WHERE e.event_type = 'click_instagram' AND NOT e.is_bot) AS click_instagram,
      count(*) FILTER (WHERE e.event_type = 'click_avulso' AND NOT e.is_bot) AS click_avulso,
      count(*) FILTER (WHERE e.event_type = 'declared_done' AND NOT e.is_bot) AS declared_done,
      max(e.created_at) AS last_event_at
    FROM mission_events e
    WHERE e.client_id = p_client_id AND e.mission_id IS NOT NULL
    GROUP BY e.mission_id
  )
  SELECT
    m.id,
    m.title,
    m.archived_at,
    m.tracking_enabled,
    m.created_at,
    coalesce(ev.total_opens, 0),
    coalesce(ev.unique_participants, 0),
    coalesce(ev.click_facebook, 0),
    coalesce(ev.click_instagram, 0),
    coalesce(ev.click_avulso, 0),
    coalesce(ev.declared_done, 0),
    ev.last_event_at
  FROM portal_missions m
  LEFT JOIN ev ON ev.mission_id = m.id
  WHERE m.client_id = p_client_id
  ORDER BY (m.archived_at IS NULL) DESC, coalesce(ev.last_event_at, m.created_at) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.client_missions_dashboard(uuid) TO authenticated;
