
ALTER TABLE public.whatsapp_dispatches
  ADD COLUMN IF NOT EXISTS resume_count INTEGER NOT NULL DEFAULT 0;
