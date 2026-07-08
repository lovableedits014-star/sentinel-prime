ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS bridge_instance_id text,
  ADD COLUMN IF NOT EXISTS last_keepalive_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_keepalive_status text,
  ADD COLUMN IF NOT EXISTS last_keepalive_details jsonb,
  ADD COLUMN IF NOT EXISTS last_auto_reconnect_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_webhook_rebound_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS last_disconnect_reason text;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_bridge_instance_id
  ON public.whatsapp_instances (bridge_instance_id)
  WHERE bridge_instance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_client_bridge_instance_id
  ON public.whatsapp_instances (client_id, bridge_instance_id)
  WHERE bridge_instance_id IS NOT NULL;