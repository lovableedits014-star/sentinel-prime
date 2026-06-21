
-- 1) Relaxar a janela do health check de 10min para 30min e não bloquear
--    quando connected_since estiver vazio (webhook pode limpar). Mantém os
--    demais critérios anti-ban (consecutive_failures < 3, status connected,
--    credenciais presentes).
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
      AND COALESCE(i.consecutive_failures, 0) < 3
      AND (i.last_health_check_at IS NULL OR i.last_health_check_at >= now() - INTERVAL '30 minutes')
      AND (i.suspected_banned_at IS NULL)
  )
  SELECT id INTO v_chosen_id FROM candidates
  ORDER BY (rest_score * 0.7 + success_rate * 0.3) DESC, random() LIMIT 1;
  RETURN v_chosen_id;
END; $$;

-- 2) View utilitária que retorna a "prontidão" de cada instância do cliente
--    do ponto de vista do disparo. Usada pelo frontend pra explicar o motivo
--    exato quando o Disparos diz "não pronto", em vez de só "desconectado".
CREATE OR REPLACE VIEW public.v_whatsapp_dispatch_readiness AS
SELECT
  i.id,
  i.client_id,
  i.apelido,
  i.is_active,
  i.is_primary,
  i.status,
  i.phone_number,
  i.last_health_check_at,
  i.last_disconnected_at,
  i.connected_since,
  i.consecutive_failures,
  i.suspected_banned_at,
  (i.bridge_url IS NOT NULL AND i.bridge_api_key IS NOT NULL) AS has_credentials,
  CASE
    WHEN i.is_active IS NOT TRUE THEN 'inativa'
    WHEN i.bridge_url IS NULL OR i.bridge_api_key IS NULL THEN 'sem_credencial'
    WHEN i.suspected_banned_at IS NOT NULL THEN 'suspeita_ban'
    WHEN i.status <> 'connected' THEN 'desconectada'
    WHEN COALESCE(i.consecutive_failures, 0) >= 3 THEN 'muitas_falhas'
    WHEN i.last_health_check_at IS NOT NULL
      AND i.last_health_check_at < now() - INTERVAL '30 minutes' THEN 'health_check_antigo'
    ELSE 'pronta'
  END AS readiness
FROM public.whatsapp_instances i;

GRANT SELECT ON public.v_whatsapp_dispatch_readiness TO authenticated, service_role;
