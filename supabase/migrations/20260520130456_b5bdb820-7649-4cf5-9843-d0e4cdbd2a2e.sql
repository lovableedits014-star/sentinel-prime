ALTER TABLE public.whatsapp_dispatches
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_type text DEFAULT 'image';