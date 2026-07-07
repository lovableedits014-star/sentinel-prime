
-- =====================================================================
-- FASE 1: Colunas de limite diário, ramp-up, pausa e razão de ban
-- =====================================================================
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS daily_send_limit INTEGER NOT NULL DEFAULT 800,
  ADD COLUMN IF NOT EXISTS ramp_up_stage TEXT NOT NULL DEFAULT 'maduro',
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_suspected_reason TEXT,
  ADD COLUMN IF NOT EXISTS first_connected_at TIMESTAMPTZ;

-- Backfill: chips já em uso (com envios feitos ou já conectados) permanecem maduros
UPDATE public.whatsapp_instances
   SET ramp_up_stage = 'maduro',
       first_connected_at = COALESCE(first_connected_at, connected_since, created_at)
 WHERE ramp_up_stage IS NULL OR first_connected_at IS NULL;

-- Constraint: valores válidos de ramp_up_stage
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'whatsapp_instances_ramp_stage_chk'
  ) THEN
    ALTER TABLE public.whatsapp_instances
      ADD CONSTRAINT whatsapp_instances_ramp_stage_chk
      CHECK (ramp_up_stage IN ('novo','aquecendo','maduro'));
  END IF;
END $$;

-- =====================================================================
-- Trigger: registrar first_connected_at ao conectar pela primeira vez
-- e novo chip nasce como 'novo' (não é backfill; é para chips futuros)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trg_whatsapp_first_connect()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'connected' AND NEW.first_connected_at IS NULL THEN
    NEW.first_connected_at := now();
    -- Só marca como 'novo' se o chip foi criado agora (não é backfill de chip antigo)
    IF NEW.created_at >= now() - INTERVAL '1 minute' THEN
      NEW.ramp_up_stage := 'novo';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_wa_first_connect ON public.whatsapp_instances;
CREATE TRIGGER trg_wa_first_connect
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW EXECUTE FUNCTION public.trg_whatsapp_first_connect();

-- =====================================================================
-- Função de promoção de estágio (chamada pelo cron / por consultas)
-- Segura: retorna quantidade de chips promovidos
-- =====================================================================
CREATE OR REPLACE FUNCTION public.promote_whatsapp_ramp_stages()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INTEGER := 0;
BEGIN
  -- novo → aquecendo após 3 dias de first_connected_at
  UPDATE public.whatsapp_instances
     SET ramp_up_stage = 'aquecendo'
   WHERE ramp_up_stage = 'novo'
     AND first_connected_at IS NOT NULL
     AND first_connected_at <= now() - INTERVAL '3 days'
     AND suspected_banned_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- aquecendo → maduro após 7 dias
  UPDATE public.whatsapp_instances
     SET ramp_up_stage = 'maduro'
   WHERE ramp_up_stage = 'aquecendo'
     AND first_connected_at IS NOT NULL
     AND first_connected_at <= now() - INTERVAL '7 days'
     AND suspected_banned_at IS NULL;
  RETURN v_count;
END; $$;

GRANT EXECUTE ON FUNCTION public.promote_whatsapp_ramp_stages() TO service_role, authenticated;

-- =====================================================================
-- FASE 3: Trigger de auto-suspeita de ban
-- Se o chip acumula 10+ falhas seguidas com last_send_at recente, marca
-- =====================================================================
CREATE OR REPLACE FUNCTION public.trg_whatsapp_auto_suspect_ban()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.whatsapp_instances%ROWTYPE;
BEGIN
  IF NEW.success = false THEN
    SELECT * INTO v_row FROM public.whatsapp_instances WHERE id = NEW.instance_id;
    IF v_row.id IS NOT NULL
       AND v_row.suspected_banned_at IS NULL
       AND COALESCE(v_row.consecutive_failures, 0) >= 10
       AND v_row.last_send_at IS NOT NULL
       AND v_row.last_send_at >= now() - INTERVAL '15 minutes'
    THEN
      UPDATE public.whatsapp_instances
         SET suspected_banned_at = now(),
             auto_suspected_reason = format(
               'Auto: %s falhas seguidas nos últimos 15min. Último erro: %s',
               v_row.consecutive_failures,
               COALESCE(NEW.error_message, 'sem detalhes')
             )
       WHERE id = NEW.instance_id;
      -- Log de ação
      INSERT INTO public.action_logs (client_id, actor_type, actor_id, action, details)
      VALUES (
        v_row.client_id, 'system', NULL, 'whatsapp_auto_suspected_ban',
        jsonb_build_object(
          'instance_id', v_row.id,
          'apelido', v_row.apelido,
          'consecutive_failures', v_row.consecutive_failures,
          'last_error', NEW.error_message
        )
      );
    END IF;
  ELSE
    -- Se envio deu sucesso e o chip estava sob suspeita há mais de 24h → segunda chance
    SELECT * INTO v_row FROM public.whatsapp_instances WHERE id = NEW.instance_id;
    IF v_row.id IS NOT NULL
       AND v_row.suspected_banned_at IS NOT NULL
       AND v_row.suspected_banned_at <= now() - INTERVAL '24 hours'
    THEN
      UPDATE public.whatsapp_instances
         SET suspected_banned_at = NULL,
             auto_suspected_reason = NULL,
             consecutive_failures = 0
       WHERE id = NEW.instance_id;
      INSERT INTO public.action_logs (client_id, actor_type, actor_id, action, details)
      VALUES (
        v_row.client_id, 'system', NULL, 'whatsapp_auto_cleared_suspicion',
        jsonb_build_object('instance_id', v_row.id, 'apelido', v_row.apelido)
      );
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_wa_auto_suspect_ban ON public.whatsapp_instance_send_log;
CREATE TRIGGER trg_wa_auto_suspect_ban
  AFTER INSERT ON public.whatsapp_instance_send_log
  FOR EACH ROW EXECUTE FUNCTION public.trg_whatsapp_auto_suspect_ban();

-- =====================================================================
-- FASE 1+5: Atualiza RPCs para respeitar limite diário, pausa e ban
-- =====================================================================
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
        OR COALESCE(i.messages_sent_today, 0) < i.daily_send_limit
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
      OR COALESCE(i.messages_sent_today, 0) < i.daily_send_limit
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
