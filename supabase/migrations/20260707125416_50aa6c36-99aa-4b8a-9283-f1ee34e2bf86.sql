
-- Função auxiliar: limite efetivo por estágio
CREATE OR REPLACE FUNCTION public.whatsapp_effective_daily_limit(
  p_stage TEXT,
  p_daily_limit INTEGER
) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(
    COALESCE(p_daily_limit, 800),
    CASE p_stage
      WHEN 'novo' THEN 100
      WHEN 'aquecendo' THEN 400
      ELSE 999999
    END
  );
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_effective_daily_limit(text, integer) TO authenticated, service_role;

-- Atualiza pick para telefone individual usando o limite efetivo
CREATE OR REPLACE FUNCTION public.pick_healthy_whatsapp_instance(p_client_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_chosen_id UUID;
BEGIN
  WITH candidates AS (
    SELECT i.id,
      LEAST(1.0, EXTRACT(EPOCH FROM (now() - COALESCE(i.last_send_at, now() - INTERVAL '1 day'))) / 60.0) AS rest_score,
      COALESCE((SELECT CASE WHEN COUNT(*) = 0 THEN 1.0
        ELSE SUM(CASE WHEN success THEN 1.0 ELSE 0.0 END) / COUNT(*)::numeric END
        FROM whatsapp_instance_send_log l
        WHERE l.instance_id = i.id AND l.sent_at >= now() - INTERVAL '24 hours'), 1.0) AS success_rate
    FROM whatsapp_instances i
    WHERE i.client_id = p_client_id
      AND i.is_active = true
      AND i.status = 'connected'
      AND i.bridge_url IS NOT NULL
      AND i.bridge_api_key IS NOT NULL
      AND i.phone_number IS NOT NULL
      AND COALESCE(i.consecutive_failures, 0) < 3
      AND (i.last_health_check_at IS NULL OR i.last_health_check_at >= now() - INTERVAL '30 minutes')
      AND i.suspected_banned_at IS NULL
      AND (i.paused_until IS NULL OR i.paused_until <= now())
      AND (
        i.messages_sent_today_date IS NULL
        OR i.messages_sent_today_date < CURRENT_DATE
        OR COALESCE(i.messages_sent_today, 0) < public.whatsapp_effective_daily_limit(i.ramp_up_stage, i.daily_send_limit)
      )
  )
  SELECT id INTO v_chosen_id FROM candidates
  ORDER BY (rest_score * 0.7 + success_rate * 0.3) DESC, random() LIMIT 1;
  RETURN v_chosen_id;
END; $$;

CREATE OR REPLACE FUNCTION public.pick_healthy_instance_for_group(
  p_client_id uuid,
  p_group_jid text,
  p_exclude_instance_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.id
  FROM public.whatsapp_instances i
  INNER JOIN public.whatsapp_groups g
    ON g.instance_id = i.id
   AND g.client_id   = i.client_id
   AND g.group_jid   = p_group_jid
   AND g.is_active   = true
  WHERE i.client_id = p_client_id
    AND i.is_active = true
    AND i.status    = 'connected'
    AND i.bridge_url IS NOT NULL
    AND i.bridge_api_key IS NOT NULL
    AND i.phone_number IS NOT NULL
    AND COALESCE(i.consecutive_failures, 0) < 5
    AND i.suspected_banned_at IS NULL
    AND (i.paused_until IS NULL OR i.paused_until <= now())
    AND (
      i.messages_sent_today_date IS NULL
      OR i.messages_sent_today_date < CURRENT_DATE
      OR COALESCE(i.messages_sent_today, 0) < public.whatsapp_effective_daily_limit(i.ramp_up_stage, i.daily_send_limit)
    )
    AND (i.last_health_check_at IS NULL OR i.last_health_check_at >= now() - INTERVAL '30 minutes')
    AND (g.is_announcement IS NOT TRUE OR g.is_admin IS TRUE)
    AND (p_exclude_instance_ids IS NULL OR NOT (i.id = ANY(p_exclude_instance_ids)))
  ORDER BY
    g.is_admin DESC NULLS LAST,
    COALESCE(i.messages_sent_today, 0) ASC,
    i.last_send_at ASC NULLS FIRST,
    i.is_primary DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.pick_healthy_whatsapp_instance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pick_healthy_instance_for_group(uuid, text, uuid[]) TO authenticated, service_role;
