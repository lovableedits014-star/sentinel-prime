CREATE OR REPLACE FUNCTION public.public_mission_config(p_mission_id uuid, p_code text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission record; v_client_name text; v_dist record; v_tok record;
  v_participant record; v_distribution_valid boolean := false;
  v_group_name text := null; v_participant_json jsonb := null; v_done timestamptz;
  v_links jsonb := '[]'::jsonb; v_digits text; v_mask text := null;
BEGIN
  SELECT id, client_id, title, tracking_enabled, link_facebook, link_instagram,
         link_avulso, instructions, post_url, platform, archived_at
    INTO v_mission FROM portal_missions WHERE id = p_mission_id;
  IF v_mission.id IS NULL THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT name INTO v_client_name FROM clients WHERE id = v_mission.client_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'label', l.label, 'url', l.url, 'kind', l.kind)
                            ORDER BY l.display_order, l.created_at), '[]'::jsonb)
    INTO v_links FROM portal_mission_links l WHERE l.mission_id = p_mission_id;

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
      SELECT id, nome, cargo_snapshot, regiao_snapshot, match_source, phone_e164
        INTO v_participant FROM mission_participants WHERE id = v_tok.participant_id;
      IF v_participant.id IS NOT NULL THEN
        SELECT concluido_em INTO v_done FROM mission_checkins
         WHERE mission_id = p_mission_id AND participant_id = v_participant.id;

        v_digits := regexp_replace(coalesce(v_participant.phone_e164,''), '\D', '', 'g');
        IF length(v_digits) >= 6 THEN
          v_mask := left(v_digits, 4) || repeat('•', greatest(length(v_digits) - 6, 0)) || right(v_digits, 2);
        END IF;

        v_participant_json := jsonb_build_object(
          'id', v_participant.id, 'nome', v_participant.nome,
          'cargo', v_participant.cargo_snapshot, 'regiao', v_participant.regiao_snapshot,
          'reconhecido', v_participant.match_source IS NOT NULL,
          'telefone_mascarado', v_mask,
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
    'links', v_links,
    'client_id', v_mission.client_id,
    'client_name', v_client_name,
    'distribution_valid', v_distribution_valid,
    'group_name', v_group_name,
    'participant', v_participant_json);
END $$;