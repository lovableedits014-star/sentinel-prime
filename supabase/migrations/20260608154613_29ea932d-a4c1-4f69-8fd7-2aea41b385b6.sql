ALTER TABLE public.whatsapp_instances
  ADD COLUMN IF NOT EXISTS reconnect_attempts_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reconnect_attempts_date date,
  ADD COLUMN IF NOT EXISTS last_create_instance_at timestamptz;