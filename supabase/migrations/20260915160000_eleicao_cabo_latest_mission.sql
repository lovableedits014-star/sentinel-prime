-- A jornada publica acompanha automaticamente a missao ativa mais recente.
CREATE OR REPLACE FUNCTION public.eleicao_cabo_onboarding_latest_mission(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_client_id uuid; v_mission record;
BEGIN
  SELECT client_id INTO v_client_id FROM eleicao_notif_config WHERE onboarding_public_token::text=p_token;
  IF v_client_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Link invalido'); END IF;
  SELECT m.id,m.title,m.platform,coalesce(m.publicado_em,m.created_at) publicado_em
  INTO v_mission FROM portal_missions m
  WHERE m.client_id=v_client_id AND m.archived_at IS NULL AND coalesce(m.is_active,true)
  ORDER BY m.created_at DESC,m.id DESC LIMIT 1;
  IF v_mission.id IS NULL THEN RETURN jsonb_build_object('ok',true,'mission',NULL); END IF;
  RETURN jsonb_build_object('ok',true,'mission',jsonb_build_object(
    'id',v_mission.id,'titulo',v_mission.title,'plataforma',v_mission.platform,'publicado_em',v_mission.publicado_em));
END;$function$;
REVOKE ALL ON FUNCTION public.eleicao_cabo_onboarding_latest_mission(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_onboarding_latest_mission(text) TO anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
