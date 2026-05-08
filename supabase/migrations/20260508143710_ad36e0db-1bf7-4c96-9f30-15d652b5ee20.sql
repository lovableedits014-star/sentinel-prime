ALTER TABLE public.whatsapp_groups
  ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_favorite
  ON public.whatsapp_groups (client_id, is_favorite)
  WHERE is_favorite = true;