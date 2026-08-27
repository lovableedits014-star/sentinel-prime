CREATE OR REPLACE FUNCTION public.public_mission_can_confirm(p_mission_id uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_m record; v_participant uuid; v_required integer := 0; v_clicked integer := 0;
BEGIN
  SELECT id, link_facebook, link_instagram, link_avulso, post_url, platform
    INTO v_m FROM portal_missions WHERE id=p_mission_id AND archived_at IS NULL;
  IF v_m.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Missão não encontrada'); END IF;

  SELECT participant_id INTO v_participant FROM mission_visitor_tokens
   WHERE token=p_token AND revoked_at IS NULL;
  IF v_participant IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Identificação inválida'); END IF;

  v_required :=
    CASE WHEN v_m.link_facebook IS NOT NULL OR (v_m.link_facebook IS NULL AND v_m.platform='facebook' AND v_m.post_url IS NOT NULL) THEN 1 ELSE 0 END +
    CASE WHEN v_m.link_instagram IS NOT NULL OR (v_m.link_instagram IS NULL AND v_m.platform='instagram' AND v_m.post_url IS NOT NULL) THEN 1 ELSE 0 END +
    CASE WHEN v_m.link_avulso IS NOT NULL THEN 1 ELSE 0 END +
    (SELECT count(*) FROM portal_mission_links l WHERE l.mission_id=p_mission_id);

  SELECT
    (CASE WHEN (v_m.link_facebook IS NOT NULL OR (v_m.platform='facebook' AND v_m.post_url IS NOT NULL)) AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant
       AND e.event_type::text='click_facebook' AND NOT coalesce(e.is_bot,false)) THEN 1 ELSE 0 END) +
    (CASE WHEN (v_m.link_instagram IS NOT NULL OR (v_m.platform='instagram' AND v_m.post_url IS NOT NULL)) AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant
       AND e.event_type::text='click_instagram' AND NOT coalesce(e.is_bot,false)) THEN 1 ELSE 0 END) +
    (CASE WHEN v_m.link_avulso IS NOT NULL AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant
       AND e.event_type::text='click_avulso' AND NOT coalesce(e.is_bot,false)) THEN 1 ELSE 0 END) +
    (SELECT count(*) FROM portal_mission_links l WHERE l.mission_id=p_mission_id AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant
       AND e.event_type::text='click_link' AND e.mission_link_id=l.id AND NOT coalesce(e.is_bot,false)))
  INTO v_clicked;

  RETURN jsonb_build_object('ok',v_clicked>=v_required,'required',v_required,'clicked',v_clicked,'remaining',greatest(v_required-v_clicked,0));
END $function$;