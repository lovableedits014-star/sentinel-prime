CREATE OR REPLACE FUNCTION public.whatsapp_effective_daily_limit(
  p_stage TEXT,
  p_daily_limit INTEGER
) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT 999999;
$$;

GRANT EXECUTE ON FUNCTION public.whatsapp_effective_daily_limit(text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.pick_healthy_whatsapp_instance(p_client_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_chosen_id UUID;
BEGIN
  WITH candidates AS (
    SELECT i.id,
      CASE WHEN i.status = 'connected' THEN 3 WHEN i.status = 'open' THEN 3 WHEN i.status = 'connecting' THEN 2 ELSE 1 END AS status_score,
      LEAST(1.0, EXTRACT(EPOCH FROM (now() - COALESCE(i.last_send_at, now() - INTERVAL '1 day'))) / 60.0) AS rest_score,
      COALESCE((SELECT CASE WHEN COUNT(*) = 0 THEN 1.0
        ELSE SUM(CASE WHEN success THEN 1.0 ELSE 0.0 END) / COUNT(*)::numeric END
        FROM whatsapp_instance_send_log l
        WHERE l.instance_id = i.id AND l.sent_at >= now() - INTERVAL '24 hours'), 1.0) AS success_rate
    FROM whatsapp_instances i
    WHERE i.client_id = p_client_id
      AND i.is_active = true
      AND i.bridge_url IS NOT NULL
      AND i.bridge_api_key IS NOT NULL
      AND i.phone_number IS NOT NULL
  )
  SELECT id INTO v_chosen_id FROM candidates
  ORDER BY status_score DESC, (rest_score * 0.7 + success_rate * 0.3) DESC, random() LIMIT 1;
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
    AND i.bridge_url IS NOT NULL
    AND i.bridge_api_key IS NOT NULL
    AND i.phone_number IS NOT NULL
    AND (g.is_announcement IS NOT TRUE OR g.is_admin IS TRUE)
    AND (p_exclude_instance_ids IS NULL OR NOT (i.id = ANY(p_exclude_instance_ids)))
  ORDER BY
    CASE WHEN i.status = 'connected' THEN 3 WHEN i.status = 'open' THEN 3 WHEN i.status = 'connecting' THEN 2 ELSE 1 END DESC,
    g.is_admin DESC NULLS LAST,
    COALESCE(i.messages_sent_today, 0) ASC,
    i.last_send_at ASC NULLS FIRST,
    i.is_primary DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.pick_healthy_whatsapp_instance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pick_healthy_instance_for_group(uuid, text, uuid[]) TO authenticated, service_role;

UPDATE public.whatsapp_instances
SET
  is_active = true,
  suspected_banned_at = null,
  auto_suspected_reason = null,
  paused_until = null,
  consecutive_failures = 0,
  last_disconnect_reason = null
WHERE bridge_api_key IS NOT NULL;