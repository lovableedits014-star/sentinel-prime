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
    AND COALESCE(i.consecutive_failures, 0) < 5
    AND i.suspected_banned_at IS NULL
    AND (g.is_announcement IS NOT TRUE OR g.is_admin IS TRUE)
    AND (p_exclude_instance_ids IS NULL OR NOT (i.id = ANY(p_exclude_instance_ids)))
  ORDER BY
    g.is_admin DESC NULLS LAST,
    COALESCE(i.messages_sent_today, 0) ASC,
    i.last_send_at ASC NULLS FIRST,
    i.is_primary DESC
  LIMIT 1;
$function$;