ALTER TABLE public.whatsapp_dispatches
  ADD COLUMN IF NOT EXISTS max_instances INTEGER,
  ADD COLUMN IF NOT EXISTS ignore_stage_cap BOOLEAN NOT NULL DEFAULT false;