-- Endurece a seleção de instância para envio em grupos com os mesmos critérios
-- conservadores do envio individual: exige credenciais, health_check recente
-- e número pareado (phone_number). Sem isso, uma instância com bridge dizendo
-- "connected" mas sessão WhatsApp ainda não pareada era escolhida e o envio falhava.
CREATE OR REPLACE FUNCTION public.pick_healthy_instance_for_group(
  p_client_id uuid,
  p_group_jid text,
  p_exclude_instance_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    AND (i.last_health_check_at IS NULL OR i.last_health_check_at >= now() - INTERVAL '30 minutes')
    AND (g.is_announcement IS NOT TRUE OR g.is_admin IS TRUE)
    AND (p_exclude_instance_ids IS NULL OR NOT (i.id = ANY(p_exclude_instance_ids)))
  ORDER BY
    g.is_admin DESC NULLS LAST,
    COALESCE(i.messages_sent_today, 0) ASC,
    i.last_send_at ASC NULLS FIRST,
    i.is_primary DESC
  LIMIT 1;
$function$;

-- Mesma regra para envio individual: exige phone_number pareado.
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
      AND (i.suspected_banned_at IS NULL)
  )
  SELECT id INTO v_chosen_id FROM candidates
  ORDER BY (rest_score * 0.7 + success_rate * 0.3) DESC, random() LIMIT 1;
  RETURN v_chosen_id;
END; $$;