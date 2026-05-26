
-- ============================================================================
-- Frente 3+5+7: Resiliência de grupos + onboarding automático de instância
-- ============================================================================

-- 1) Colunas novas em whatsapp_instances
ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS suspected_banned_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_sent_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onboarding_pending_count   INTEGER,
  ADD COLUMN IF NOT EXISTS pending_onboarding         BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wainst_pending_onboarding
  ON public.whatsapp_instances(client_id)
  WHERE pending_onboarding = true;

-- 2) RPC: escolhe instância saudável MEMBRO de um grupo específico
CREATE OR REPLACE FUNCTION public.pick_healthy_instance_for_group(
  p_client_id uuid,
  p_group_jid text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    -- não enviar de grupos que são "somente admins" se a instância não for admin
    AND (g.is_announcement IS NOT TRUE OR g.is_admin IS TRUE)
  ORDER BY
    g.is_admin DESC NULLS LAST,
    COALESCE(i.messages_sent_today, 0) ASC,
    i.last_send_at ASC NULLS FIRST,
    i.is_primary DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.pick_healthy_instance_for_group(uuid, text) TO authenticated, service_role;

-- 3) Trigger: marca pending_onboarding ao conectar pela 1ª vez (não-principal)
CREATE OR REPLACE FUNCTION public.queue_instance_onboarding()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'connected'
     AND (OLD.status IS DISTINCT FROM 'connected')
     AND NEW.onboarding_sent_at IS NULL
     AND COALESCE(NEW.is_primary, false) = false
  THEN
    NEW.pending_onboarding := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_queue_instance_onboarding ON public.whatsapp_instances;
CREATE TRIGGER trg_queue_instance_onboarding
  BEFORE UPDATE ON public.whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_instance_onboarding();
