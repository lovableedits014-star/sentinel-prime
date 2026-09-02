-- Rastreio movel confiavel: o clique e persistido antes do redirecionamento
-- externo e o ultimo link obrigatorio conclui a missao na mesma transacao.
-- As URLs publicas /missao/:id existentes permanecem inalteradas.

CREATE OR REPLACE FUNCTION public.public_mission_follow_link(
  p_mission_id uuid,
  p_code text,
  p_token text,
  p_link_key text,
  p_user_agent text DEFAULT NULL,
  p_device text DEFAULT NULL,
  p_is_bot boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mission record;
  v_participant_id uuid;
  v_destination text;
  v_event_type text;
  v_link_id uuid;
  v_gate jsonb;
  v_completed boolean := false;
BEGIN
  SELECT id,client_id,archived_at,link_facebook,link_instagram,link_avulso,post_url,platform
  INTO v_mission
  FROM portal_missions
  WHERE id=p_mission_id;

  IF v_mission.id IS NULL OR v_mission.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'error','Missao nao encontrada');
  END IF;

  SELECT t.participant_id INTO v_participant_id
  FROM mission_visitor_tokens t
  WHERE t.token=p_token AND t.revoked_at IS NULL AND t.client_id=v_mission.client_id;
  IF v_participant_id IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','Identificacao invalida');
  END IF;

  CASE p_link_key
    WHEN 'facebook' THEN
      v_destination:=coalesce(v_mission.link_facebook,
        CASE WHEN v_mission.platform='facebook' THEN v_mission.post_url END);
      v_event_type:='click_facebook';
    WHEN 'instagram' THEN
      v_destination:=coalesce(v_mission.link_instagram,
        CASE WHEN v_mission.platform='instagram' THEN v_mission.post_url END);
      v_event_type:='click_instagram';
    WHEN 'avulso' THEN
      v_destination:=v_mission.link_avulso;
      v_event_type:='click_avulso';
    ELSE
      BEGIN v_link_id:=p_link_key::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RETURN jsonb_build_object('ok',false,'error','Link invalido');
      END;
      SELECT l.url INTO v_destination
      FROM portal_mission_links l
      WHERE l.id=v_link_id AND l.mission_id=p_mission_id;
      v_event_type:='click_link';
  END CASE;

  IF v_destination IS NULL OR v_destination !~* '^https?://' THEN
    RETURN jsonb_build_object('ok',false,'error','Destino invalido');
  END IF;

  -- Serializa o ultimo clique e a conclusao para um participante/missao.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_mission_id::text||':'||v_participant_id::text,0));

  PERFORM public.public_mission_event(
    p_mission_id,p_code,p_token,v_event_type,p_user_agent,p_device,
    coalesce(p_is_bot,false),v_link_id
  );

  IF NOT coalesce(p_is_bot,false) THEN
    v_gate:=public.public_mission_can_confirm(p_mission_id,p_token);
    IF coalesce((v_gate->>'ok')::boolean,false) THEN
      IF NOT EXISTS(
        SELECT 1 FROM mission_events e
        WHERE e.mission_id=p_mission_id AND e.participant_id=v_participant_id
          AND e.event_type::text='declared_done' AND NOT coalesce(e.is_bot,false)
      ) THEN
        PERFORM public.public_mission_event(
          p_mission_id,p_code,p_token,'declared_done',p_user_agent,p_device,false,NULL
        );
      END IF;
      v_completed:=true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',true,'destination',v_destination,'completed',v_completed,
    'participant_id',v_participant_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.public_mission_follow_link(uuid,text,text,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_mission_follow_link(uuid,text,text,text,text,text,boolean) TO anon,authenticated;

-- Repara somente participacoes que comprovadamente ja acessaram todos os links
-- obrigatorios, mas ficaram sem conclusao porque o navegador nao voltou do app.
WITH candidates AS (
  SELECT DISTINCT e.mission_id,e.participant_id,e.client_id,
    (array_agg(e.distribution_id ORDER BY e.created_at DESC)
      FILTER (WHERE e.distribution_id IS NOT NULL))[1] distribution_id,
    max(e.user_agent) user_agent,max(e.device_category) device_category
  FROM mission_events e
  JOIN portal_missions m ON m.id=e.mission_id AND m.archived_at IS NULL
  WHERE e.participant_id IS NOT NULL AND NOT coalesce(e.is_bot,false)
  GROUP BY e.mission_id,e.participant_id,e.client_id
), complete AS (
  SELECT c.*
  FROM candidates c
  WHERE
    (CASE WHEN EXISTS(
      SELECT 1 FROM portal_missions m WHERE m.id=c.mission_id AND
        (m.link_facebook IS NOT NULL OR (m.platform='facebook' AND m.post_url IS NOT NULL))
    ) THEN EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=c.mission_id AND e.participant_id=c.participant_id
        AND e.event_type::text='click_facebook' AND NOT coalesce(e.is_bot,false)
    ) ELSE true END)
    AND (CASE WHEN EXISTS(
      SELECT 1 FROM portal_missions m WHERE m.id=c.mission_id AND
        (m.link_instagram IS NOT NULL OR (m.platform='instagram' AND m.post_url IS NOT NULL))
    ) THEN EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=c.mission_id AND e.participant_id=c.participant_id
        AND e.event_type::text='click_instagram' AND NOT coalesce(e.is_bot,false)
    ) ELSE true END)
    AND (CASE WHEN EXISTS(
      SELECT 1 FROM portal_missions m WHERE m.id=c.mission_id AND m.link_avulso IS NOT NULL
    ) THEN EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=c.mission_id AND e.participant_id=c.participant_id
        AND e.event_type::text='click_avulso' AND NOT coalesce(e.is_bot,false)
    ) ELSE true END)
    AND NOT EXISTS(
      SELECT 1 FROM portal_mission_links l
      WHERE l.mission_id=c.mission_id AND NOT EXISTS(
        SELECT 1 FROM mission_events e WHERE e.mission_id=c.mission_id AND e.participant_id=c.participant_id
          AND e.event_type::text='click_link' AND e.mission_link_id=l.id AND NOT coalesce(e.is_bot,false)
      )
    )
    AND EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=c.mission_id AND e.participant_id=c.participant_id
        AND e.event_type::text LIKE 'click_%' AND NOT coalesce(e.is_bot,false)
    )
    AND NOT EXISTS(
      SELECT 1 FROM mission_events e WHERE e.mission_id=c.mission_id AND e.participant_id=c.participant_id
        AND e.event_type::text='declared_done' AND NOT coalesce(e.is_bot,false)
    )
)
INSERT INTO mission_events(
  mission_id,distribution_id,participant_id,client_id,event_type,user_agent,device_category,is_bot
)
SELECT mission_id,distribution_id,participant_id,client_id,'declared_done'::mission_event_type,
  user_agent,device_category,false
FROM complete;

NOTIFY pgrst, 'reload schema';
